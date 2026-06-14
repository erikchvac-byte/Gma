---
title: 'Story 4.3: Dutchie/iFrame Dispensary Support'
type: 'feature'
created: '2026-06-13'
baseline_commit: '1737292'
status: 'done'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Three seeded dispensaries (`the-joint-everett`, `jet-cannabis-everett`, `kush21-everett-evergreen`) serve menus through Dutchie iFrames — JS-rendered, invisible to Axios+Cheerio. They have no scraper, so `runScrapers` logs `error: no scraper registered` and they never reach the feed.

**Approach:** Add `server/utils/scraperClient.ts`, a typed wrapper that POSTs to the existing Python Scraper microservice (`http://localhost:8000/scrape`, ADR-017) and returns raw `intercepted[]` GraphQL (or `[]` on any failure). Add a store-agnostic transform mapping Dutchie `GetSpecialMenuCards` → `Deal[]`. Add one thin scraper per store that supplies its embed URL and delegates to client + transform; register all three; unit-test client and transform against fixtures. Live end-to-end verification against the running service is **deferred** (Erik, 2026-06-13).

## Boundaries & Constraints

**Always:**
- Honor the scraper contract: `export default async function scrape(): Promise<Deal[]>`, never throws, `[]` on any error. `runScrapers` (Story 4.1) owns all stale/storage/log behavior — do not touch it.
- `daysValid` uses full lowercase day names or `'everyday'` (the vocabulary `filterActiveDeals.ts` matches; abbreviations silently never match → invisible data loss).
- The transform and the client never throw: optional-chain unknown fields, skip malformed cards, return `[]` when nothing usable is found.

**Ask First:**
- New runtime dependency; editing `runScrapers.ts`/`atomicWrite.ts`/`dataStore.ts`; changing the `Deal` type.
- If the live Dutchie GraphQL shape differs materially from the fixture, surface the delta before reworking the transform.

**Never:**
- Build/modify the Python service (exists at `C:\Users\erikc\Dev\Scraper`).
- Live network/headless calls in tests — fixtures only, offline, deterministic.
- Navigate a dispensary's own site; the embed URL is `https://dutchie.com/embedded-menu/<storeId>`.
- Timezone math in the transform (store raw 24h strings; `filterActiveDeals` evaluates in `America/Los_Angeles`); `FilteredProducts` pagination / product scraping (deals only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Client happy path | `{ success: true, intercepted: [...] }` | returns `intercepted[]` | N/A |
| Service down | POST throws `ECONNREFUSED` | `[]` | catch + `console.error` |
| Non-200 / `success:false` | 500 or `{ success:false }` | `[]` | logged |
| Timeout | request exceeds client timeout | `[]` | axios timeout → catch |
| Daily % special | card, percent discount, no time window | one `daily` Deal, `discountPct` number, times `null`, `daysValid` mapped/`everyday` | N/A |
| Timed special | card with recurring time-of-day window | `happy_hour` Deal, 24h `startTime`/`endTime`, full-name `daysValid` | N/A |
| Non-percent discount | dollar-off / unparseable | Deal, `discountPct: null` | N/A |
| No specials | `intercepted[]` lacks `GetSpecialMenuCards`, or empty | `[]` | N/A |
| Malformed card | missing/wrong-typed fields | skip that card; never throw | optional-chaining |
| Store scrape fail | client returns `[]` | `[]` → `runScrapers` marks `stale:true` | N/A |

</frozen-after-approval>

## Code Map

- `server/utils/scraperClient.ts` -- NEW. `postScrape(req)` over `POST :8000/scrape`; returns `intercepted[]` or `[]`. Owns `ScrapeRequest`/`ScrapeResponse`/`Intercepted` types.
- `server/scrapers/_dutchie.ts` -- NEW. Shared helpers: `dutchieEmbedUrl(storeId)`, intercept/wait patterns, `pickSpecials(intercepted)`, `transformSpecials(intercepted): Deal[]`. `_` prefix = non-store helper (like `_template.ts`).
- `server/scrapers/the-joint-everett.ts` -- NEW. Embed store ID `689cd028ea84b6a605458416` (confirmed in `__fixtures__/joint-everett-menu.html`).
- `server/scrapers/jet-cannabis-everett.ts`, `server/scrapers/kush21-everett-evergreen.ts` -- NEW. Same thin pattern; embed store ID resolved in the deferred live pass (documented placeholder until then).
- `server/scrapers/index.ts` -- MODIFY. Register the three, keyed by `data.json` id.
- `server/scrapers/__fixtures__/dutchie-specials.json` -- NEW. Representative `/scrape` response synthesized from the documented `GetSpecialMenuCards` schema; the reconciliation point for live data.
- `server/scrapers/_dutchie.test.ts`, `server/utils/scraperClient.test.ts` -- NEW. Cover the I/O matrix.
- READ-ONLY: `runScrapers.ts`, `_template.ts` + `remedy-tulalip.ts` (contract/style), `filterActiveDeals.ts` (`daysValid`/24h consumer), `client/src/types/index.ts` (`Deal`), `C:\Users\erikc\Dev\Scraper\HANDOFF.md` (API).

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/scraperClient.ts` -- `postScrape(req): Promise<Intercepted[]>` via `axios.post('http://localhost:8000/scrape', req, { timeout: 50000 })`; return `res.data.intercepted ?? []` only when `res.data.success === true`, else `[]`; whole body in try/catch → `[]` + `console.error('[scraperClient]', err)`. (Timeout above the service's 45000ms.)
- [x] `server/scrapers/_dutchie.ts` -- `dutchieEmbedUrl`, intercept (`dutchie\.com.*(graphql|api-0)`) + wait (`dutchie\.com/graphql`) patterns, `pickSpecials`, `transformSpecials` applying the classification rules.
- [x] `the-joint-everett.ts` + `jet-cannabis-everett.ts` + `kush21-everett-evergreen.ts` -- each: const embed store ID + `scrape()` calling `postScrape` then `transformSpecials`, try/catch → `[]` + `[scraper:<id>]` log. (jet + kush21 carry an unresolved-id guard that returns `[]` until the deferred live pass.)
- [x] `server/scrapers/index.ts` -- register all three under their `data.json` ids.
- [x] `__fixtures__/dutchie-specials.json` + `_dutchie.test.ts` + `scraperClient.test.ts` -- cover every I/O-matrix row offline (mock `axios` for the client; transform reads the fixture).

**Acceptance Criteria:**
- Given a Dutchie dispensary, when `runScrapers` calls its scraper, then it routes through `scraperClient.ts` POSTing to `http://localhost:8000/scrape`.
- Given a successful intercepted `GetSpecialMenuCards`, when transformed, then a `Deal[]` follows the shared rules (`happy_hour` vs `daily`, 24h strings, `discountPct` number-or-null, full-name `daysValid`).
- Given the service unreachable, when the scraper runs, then it returns `[]`, the source is marked `stale:true`, and the server does not crash.
- Given the codebase, when inspected, then `scraperClient.ts` is in `server/utils/`, the three scrapers are in `server/scrapers/` per the `_template.ts` contract, and all three are registered.
- Given `npx tsc --noEmit` and `vitest` in `server/`, then types are clean and all new tests pass.

## Design Notes

**Service request (per HANDOFF):**
```ts
postScrape({
  url: `https://dutchie.com/embedded-menu/${storeId}`,
  intercept_pattern: 'dutchie\\.com.*(graphql|api-0)',
  wait_for_pattern: 'dutchie\\.com/graphql',
  tier: 'browser', headless: true, timeout: 45000,
})
// → res.data.intercepted: { url, status, data }[]  (5–10 GraphQL ops)
```
`transformSpecials` finds the `GetSpecialMenuCards` entry, reads its special cards, maps each: name→`description`; percent field (else parse `"NN%"` from name, else `null`)→`discountPct`; recurring weekday set→`daysValid` (full lowercase) else `'everyday'`; recurring time-of-day window→`happy_hour` + 24h times, otherwise `daily` + nulls. Dutchie specials are mostly all-day → `daily` is common; calendar start/end **dates** (sale validity) are NOT time-of-day windows — never treat them as `happy_hour`.

**Fixture is the live contract.** No real GraphQL capture exists yet (needs the running service, deferred). `dutchie-specials.json` is synthesized from the documented schema and is the single place to reconcile during the live pass. Keep field access defensive so a shape delta degrades to skipped cards / `[]`, not a throw.

**Deferred to the live pass (Erik, 2026-06-13):** (1) resolve embed store IDs for `jet-cannabis-everett` (THC Connection) and `kush21-everett-evergreen` (`everettshop.kush21.com`) via the service's `/discover` endpoint or host-page lookup; (2) start the service and confirm real deals flow into `data.json` + `GET /api/data`; (3) reconcile the fixture against a real capture. Until then those two stores report `stale` (graceful degradation by design); `the-joint-everett` ships with its confirmed embed ID.

## Verification

**Commands:**
- `cd server && npx tsc --noEmit` -- expected: no type errors.
- `cd server && npm test` -- expected: existing 53 tests still pass + new `scraperClient`/`_dutchie` tests pass (every matrix row green).

**Manual checks:**
- `server/scrapers/index.ts` ids match `server/data/data.json` exactly.
- No live network call in any `*.test.ts` (grep tests for `dutchie.com` / the service URL → none).

## Suggested Review Order

**The service boundary (start here)**

- Entry point: the one HTTP call to the Python service — every failure mode collapses to `[]`.
  [`scraperClient.ts:37`](../../server/utils/scraperClient.ts#L37)
- The success gate — only `success:true` + a real array passes; everything else degrades to stale.
  [`scraperClient.ts:43`](../../server/utils/scraperClient.ts#L43)

**The Dutchie transform (the real logic)**

- `GetSpecialMenuCards` → `Deal[]`: window→happy_hour else daily, percent + full-name days.
  [`_dutchie.ts:73`](../../server/scrapers/_dutchie.ts#L73)
- Locates the specials intercept among 5–10 GraphQL ops; defensive path access.
  [`_dutchie.ts:43`](../../server/scrapers/_dutchie.ts#L43)
- Embed URL + browser-tier request preset shared by all three stores.
  [`_dutchie.ts:18`](../../server/scrapers/_dutchie.ts#L18)

**Per-store wiring**

- Confirmed embed id — the only store that returns live deals today.
  [`the-joint-everett.ts:7`](../../server/scrapers/the-joint-everett.ts#L7)
- Unresolved-id guard → `[]`/stale until the deferred live pass (jet + kush21 identical).
  [`jet-cannabis-everett.ts:14`](../../server/scrapers/jet-cannabis-everett.ts#L14)
- Registry: all three keyed exactly to `data.json` ids.
  [`index.ts:8`](../../server/scrapers/index.ts#L8)

**Tests (peripheral)**

- Transform vs synthesized fixture — every classification branch + malformed-card skip.
  [`_dutchie.test.ts:60`](../../server/scrapers/_dutchie.test.ts#L60)
- Client failure matrix — down / non-200 / success:false / timeout / malformed → `[]`.
  [`scraperClient.test.ts:30`](../../server/utils/scraperClient.test.ts#L30)

## Live Pass — Spec Reference (added 2026-06-13)

The deferred live pass is now formalized as a spec: **`_bmad-output/specs/spec-4-3-live-pass/`** (`SPEC.md` + `live-pass-runbook.md`). Erik's shaping decisions: done bar = **all three stores live** (an unresolvable embed ID BLOCKS + escalates, not silently re-deferred); on any material live-vs-fixture shape delta, **surface and stop** (this frozen contract is not silently reworked); evidence-fixture relocation stays out of scope; executor = a dev agent.

**Assumptions the spec proceeds under:**
- Python service runs locally on `:8000` for the pass; production deployment is out of scope.
- `the-joint-everett`'s committed embed ID (`689cd028ea84b6a605458416`) is still valid; if stale, treated like the two unresolved IDs.
- All three stores have ≥1 active special during the pass. Confirmed against `runScrapers.ts:42`: an empty/normalized-away return maps to `stale:true` + `error: scraper returned no deals`, so a store with genuinely zero specials is indistinguishable from a scrape failure in `data.json` (only `logs.json` tells them apart) → escalate to Erik, not counted as done.

**Confirmed entrypoint:** `runScrapers` has **no standalone CLI trigger**; it runs on server boot (`server/index.ts:32`) and hourly. The live run is triggered via `cd server && npm run dev` (boot scrape). A one-off `scrape` script is out of scope unless Erik approves.

**Open question:** if an embed ID is undiscoverable via `/discover` or host-page lookup, is a manual browser inspection by Erik an acceptable fallback, or does that store BLOCK the pass? (Spec default: BLOCK + escalate.)
