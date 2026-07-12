---
title: 'Confirmed-empty ingest outcome — clear deals + advance freshness when a store honestly has zero specials'
type: 'bugfix'
created: '2026-07-11'
status: 'in-review'
baseline_commit: '120bd6d2007a8a895d702d5650cbf7573564626c'
context:
  - '_bmad-output/implementation-artifacts/investigations/retro-parallel-outages-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `happy-time-mt-vernon` has genuinely run zero Dutchie specials since its June promos expired (live-verified 2026-07-11), but "legitimately empty" is unrepresentable: `scraperClient` collapses failures and real empties to the same `[]`, so `applyIngest` freezes `lastFetchedAt`, the store reds the hourly alert-gate forever, and the app serves expired June deals as current.

**Approach:** Make "confirmed empty" a first-class outcome through the whole chain. A Dutchie scrape whose service call succeeded AND whose `GetSpecialMenuCards` intercept carries `menuCards: []` on **every** retry attempt is confirmed empty (the ADR-051 3-attempt retry doubles as the race guard). Propagate that flag scraper → `ingestRun` → `POST /api/ingest` → `applyIngest`, which then clears the store's deals and advances `lastFetchedAt` (store reads `ok`, dead deals drop from the feed). Unconfirmed/failed empties keep today's last-known-good `stale` semantics exactly.

## Boundaries & Constraints

**Always:**
- Honest Math (ADR-007/009): confirmed-empty requires positive evidence (service `success:true` + `GetSpecialMenuCards` intercepted + `menuCards` is an array of length 0) on every attempt; any doubt degrades to today's `stale` behavior.
- `menuCards` non-empty but all cards skipped by the transform (nameless/malformed) is NOT confirmed empty — that's shape-drift, keep last-known-good.
- Deals scrapers keep the never-throw contract; the return shape becomes `{ deals: Deal[], confirmedEmpty: boolean }` (ADR to document the contract change).
- `remedy-tulalip` (Axios+Cheerio, no GraphQL evidence) always reports `confirmedEmpty: false`.
- `POST /api/ingest` stays fail-closed: `confirmedEmpty` must be absent or boolean, else 400; `applyIngest` honors only `=== true`.
- Products pipeline (`_dutchieProducts`, `postScrape` callers) behavior unchanged.

**Ask First:**
- Any client/UI code change beyond what falls out automatically (expectation: none — a store with `deals: []` already renders no card).
- Committing/pushing/PR (per standing rule: build+verify first, then push+self-merge is pre-authorized; branch off master first).

**Never:**
- No per-store mutes, alert-gate suppression lists, or `STALE_ALERT_MS` tuning — fix the representation, not the alarm.
- No manual data.json edit as the fix (commit-back would overwrite it).
- Don't touch `deriveStoreStatus` / freshness windows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Confirmed empty | All 3 attempts: service ok + intercept present + `menuCards: []` | `{ deals: [], confirmedEmpty: true }`; applyIngest clears deals, sets `lastFetchedAt=now`, `stale=false`, result `'empty'` | N/A |
| Deals found | Any attempt yields ≥1 normalized deal | `{ deals, confirmedEmpty: false }`; result `'ok'` (unchanged) | N/A |
| Failure-collapsed empty | Any attempt: service down / `success:false` / no `GetSpecialMenuCards` intercept / `menuCards` not an array / throw | `confirmedEmpty: false`; applyIngest keeps deals+`lastFetchedAt`, result `'stale'` (today's behavior) | never throws |
| Shape-drift empty | `menuCards` has cards but transform yields 0 deals | `confirmedEmpty: false` → `'stale'` | N/A |
| Scraped deals all dropped by `normalizeDeals` | scraper returned deals, chokepoint filtered all | entry NOT confirmed-empty → `'stale'` | N/A |
| Bad flag on ingest | body entry `confirmedEmpty: "yes"` | 400 BAD_REQUEST | fail closed |
| Seed commit-back | artifact entry carries `confirmedEmpty: true` | `commitBackSeed`'s applyIngest merge clears the seed's deals too | N/A |

</frozen-after-approval>

## Code Map

- `server/utils/scraperClient.ts` -- `postScrape` collapses all failures to `[]`; add `postScrapeDetailed` returning `{ ok, intercepted }`, `postScrape` delegates (products path untouched)
- `server/scrapers/_dutchie.ts` -- `pickSpecials` + `scrapeDutchieSpecials` (3-attempt retry, ADR-051): detection + new return shape live here
- `server/scrapers/{the-joint-everett,jet-cannabis-everett,kush21-everett-evergreen}.ts` -- thin wrappers, return type follows
- `server/scrapers/remedy-tulalip.ts` -- wrap result as `{ deals, confirmedEmpty: false }`
- `server/scrapers/dutchie-stores.ts` -- `makeDutchieScraper` type ripple (deals registry only; product registry untouched)
- `server/scrapers/index.ts` + `_template.ts` -- registry type `Record<string, () => Promise<DealScrapeOutcome>>` + contract doc
- `server/types/index.ts` -- `IngestEntry.confirmedEmpty?`, `IngestResult` + `'empty'`, `DealScrapeOutcome`
- `server/scripts/ingestRun.ts` -- build entries with the flag; `'empty'` acceptable (ok stays true); log line shows `empty`
- `server/routes/ingestRoute.ts` -- `isValidEntry` validates optional boolean
- `server/utils/applyIngest.ts` -- new confirmed-empty branch (clear + advance + `'empty'`, counts toward `accepted`/`lastScraperRun`)
- `server/utils/runScrapers.ts` -- caller-less legacy, consumes registry: adapt to `.deals` (behavior unchanged)
- `ADR.md` -- new ADR-083

## Tasks & Acceptance

**Execution:**
- [x] `server/types/index.ts` -- add `DealScrapeOutcome`, `IngestEntry.confirmedEmpty?: boolean`, extend `IngestResult` with `'empty'` -- contract first so tsc drives the ripple
- [x] `server/utils/scraperClient.ts` -- add `postScrapeDetailed(req): Promise<{ ok: boolean; intercepted: Intercepted[] }>`; `postScrape` delegates -- expose the success signal without touching products callers
- [x] `server/scrapers/_dutchie.ts` -- per-attempt confirmed-empty detection (ok + intercept + `menuCards` array + length 0); `scrapeDutchieSpecials` returns `DealScrapeOutcome`; `confirmedEmpty` true only when ALL attempts confirm -- core evidence logic
- [x] `server/scrapers/remedy-tulalip.ts`, 3 dedicated Dutchie files, `dutchie-stores.ts`, `index.ts`, `_template.ts` -- adopt `DealScrapeOutcome` -- registry contract change
- [x] `server/utils/runScrapers.ts` -- consume `.deals` -- keep legacy path compiling+tested
- [x] `server/scripts/ingestRun.ts` -- set `entry.confirmedEmpty = outcome.confirmedEmpty && normalized.length === 0`; treat `'empty'` like `'ok'`/`'stale'` for exit code -- carry the flag to the POST + artifact
- [x] `server/routes/ingestRoute.ts` -- validate optional `confirmedEmpty` boolean (400 otherwise) -- fail closed
- [x] `server/utils/applyIngest.ts` -- confirmed-empty branch: `deals=[]`, `lastFetchedAt=now`, `stale=false`, `'empty'`, `accepted++` -- the actual fix
- [x] tests: `_dutchie.test.ts`, `scraperClient.test.ts` (new detailed fn), `ingestRun.test.ts`, `ingestRoute.test.ts`, `applyIngest.test.ts`, `runScrapers.test.ts`, `integration/ingestFreshness.test.ts` -- cover the I/O matrix rows -- regression + new behavior
- [x] `ADR.md` -- ADR-083 (contract change, evidence rule, supersedes the ADR-051 "empty is indistinguishable" note) + change log -- required by project rules

**Acceptance Criteria:**
- Given a store whose 3 attempts all return `menuCards: []` with service success, when the hourly ingest runs, then `/api/data` shows that store with `deals: []`, fresh `lastFetchedAt`, `stale: false`, status `ok`, and alertGate no longer counts it persistently stale.
- Given any attempt that fails or lacks the intercept, when ingest runs, then behavior is byte-identical to today (`'stale'`, data untouched).
- Given the refreshed seed artifact carries `confirmedEmpty: true`, when `commitBackSeed` merges, then the committed seed's store is cleared+fresh (no code change expected — verify via applyIngest test).
- Full suite green + `npm run build` clean (Render build parity rule).

## Design Notes

Per-attempt evidence, not per-run: `postScrapeDetailed().ok && intercepted.find(GetSpecialMenuCards)` with `Array.isArray(menuCards) && menuCards.length === 0`. The existing retry loop already re-runs empties 3×, so "all attempts confirmed-empty" is the investigation's confirmation rule with zero extra requests. `'empty'` is a distinct `IngestResult` (not `'ok'`) so run logs read honestly: `[ingestRun] happy-time-mt-vernon: empty`.

## Verification

**Commands:**
- `cd server && npx vitest run` -- expected: all green (incl. new matrix tests)
- `npm run build` (repo root) -- expected: clean (tsc -b + vite, the real Render build)
- Post-deploy: trigger `scrape-ingest` via `workflow_dispatch`, then `curl https://gmaslist.com/api/data` -- expected: happy-time-mt-vernon `deals: []`, fresh `lastFetchedAt`, `status: "ok"`; next alert-gate run green (barring unrelated reds)
