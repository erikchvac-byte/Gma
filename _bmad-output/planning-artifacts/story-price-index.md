---
baseline_commit: 4cf84a46723115e0a35e4219f950b0b425e4aed7
---

# Story: WA Cannabis Price Index — flagship citable asset + distribution

**Source:** `prfaq-Happy.md`, `prfaq-Happy-distillate.md`, `price-index-execution-plan.md` (2026-08-08)
**Status:** ready for dev (Phase 1a); Phase 1b/2/3 sequenced behind it
**Strategic frame:** reach is the binding constraint (STRATEGY.md). This is the keystone reach play.

## Why this scope (read first)

Investigation of the live code found the `/compare` surface (`server/routes/compareRoute.ts`) ALREADY provides: SSR HTML, `Dataset` JSON-LD, request-time reads of committed derived JSON via `readDerived` fail-soft envelopes, the `asOf`/staleness posture (ADR-111), the WAC 314-55-155 age notice, and the positioning disclaimer. The sitemap + llms.txt (`server/routes/sitemapRoute.ts`) already enumerate from the same derived source.

Critically: `/compare` already answers ~6 of the 8 questions the citation monitor scores (`server/scripts/citation-questions.json`) — and the baseline is still **0/8**. So the gap is NOT "we lack pages that answer the questions." The gap is (a) no single flagship asset built around the dramatic, quotable hook, formatted the way 2026 engines cite, and (b) no active distribution. Phase 1a builds (a); Phases 2–3 do (b).

**Consequence:** Phase 1a reads the EXISTING committed derived JSON at request time. It needs **no change to `scripts/derive-facts-local.ps1`, no new entry in `$derivedFiles`, no new committed data file.** The weekly refresh already happens (pipeline re-derives → commits → Render redeploys). This is the smallest possible first step to a live, unique, citable asset.

---

## Phase 1a — The flagship `/price-index` page (CODE — do first)

### Goal
One server-rendered page that leads with the provable hook ("the same product can cost several times more one store over"), answers the 8 monitored questions in on-page + `FAQPage` schema form, and is dated + staleness-safe. Reuses `/compare` primitives; reads existing derived JSON at request time.

### Tasks

1. **Extract shared SSR primitives** (reuse pattern already used for `searchEngines.ts`). Move these from `compareRoute.ts` into a new `server/utils/ssrPage.ts` and re-export from `compareRoute.ts` (no behavior change to `/compare`): `page()`, `escapeHtml`, `escapeAttr`, `jsonLdScript`, `formatUsd`, `datasetJsonLd`, `asOfPhrase`, `EPOCH_GENERATED_AT`, `isRenderableDisparity`, `storeName`. Keep the existing `compareRoute.test.ts` green (proves the extraction is behavior-preserving).

2. **New route `server/routes/priceIndexRoute.ts`** — `GET /price-index`. Read at request time (mirror `compareIndexRoute`):
   - `disparities.json` via `readDerived(..., EMPTY_DISPARITIES_ENVELOPE)`
   - `disparity-rollups.json` via `readDerived(..., EMPTY_DISPARITY_ROLLUPS_ENVELOPE)`
   Compose the body from existing data, reusing the helpers above:
   - **Hook section — "Biggest same-product price gaps right now":** top N (e.g. 15) rows from `disparities.json`, filtered by `isRenderableDisparity`, sorted by `spread` desc, rendered with the SAME cheapest/priciest `.reduce` pattern as `renderCategoryHtml` (pull the price from the same store object you name, so number and store can never disagree). This surfaces the "$14.40 at X to $84 at Y" fact. Skip rows where `highPrice === lowPrice` (no spread).
   - **Category summary table:** from `rollups.byCategory` — `avgSpreadPct` per category ("On average, Pre-Rolls vary 24% store-to-store across N stores"). Reuse the defensive `Number.isFinite` filters from `renderIndexHtml`.
   - **"Stores most often cheapest":** reuse the `byStore.timesCheapest` block from `renderIndexHtml`.
   - **Navigation into the long-tail:** links to `/compare` and to the region pages (`/compare/<region>`) so the flagship funnels crawlers into the existing geo pages.
   - **Accounting line + `asOf`:** reuse `asOfPhrase(rollups.generatedAt)`; reuse the `allStale`/epoch caveat pattern so a stale or never-derived artifact is never presented as fresh.

3. **`FAQPage` JSON-LD (the new GEO element).** Add a second `<script type="application/ld+json">` with a `FAQPage` whose questions are the 8 from `citation-questions.json`, each answered in 1–2 factual sentences. HARD INVARIANT (already enforced elsewhere in this codebase, compareRoute lines ~57–59): the schema answer text MUST appear verbatim as on-page text — render a visible "Common questions" `<section>` with the same Q/A strings the schema uses, built from one shared array. No `& < >` in those strings so the verbatim match survives escaping.

4. **Honesty / legal invariants (non-negotiable, mirror `/compare`):**
   - Publish COMPUTED RELATIONAL FACTS only (same-product cross-store ranges) — never a store's full menu, no discount %, no potency, no category leaderboard.
   - `spatialCoverage` = Washington only; copy says "the Washington dispensaries Gmas List tracks," never "statewide" (PRFAQ crack #1 fix).
   - Render `AGE_NOTICE` (from `renderShellBody.ts` / keep the server literal in sync) and `positioningDisclaimerHtml('disclaimer')`.
   - `Cache-Control: public, max-age=3600`; `res.type('html')`. Fail-soft: a missing/malformed artifact degrades to a safe "check back later" page, never a 500 (the `readDerived` envelope already gives this).

5. **Register the route** in `server/index.ts` BEFORE the SPA catch-all (`/^(?!\/api).*/`), next to the `/compare` and `/about` registrations (~line 88).

6. **Make it discoverable** in `server/routes/sitemapRoute.ts`:
   - Add `'/price-index'` to `STATIC_PATHS` (stamp its `lastmod` with `rollups.generatedAt`, like `/compare`).
   - Add a `/price-index` line to `buildLlmsTxt`'s `## Pages` section.

7. **Tests** (`server/routes/priceIndexRoute.test.ts`, mirror `compareRoute.test.ts`): renders the hook rows sorted by spread; number always matches the named store; empty/epoch/malformed envelope → safe page, no throw; `allStale` → freshness caveat, never a fabricated fresh date; FAQ schema answer text is present verbatim in the page body (guards the schema==on-page invariant); no "statewide" string; age notice + disclaimer present. Update `sitemapRoute.test.ts` for the new static URL. TypeScript strict; `npm run build` (the real Render build `tsc -b && vite build`) must pass before push.

### Acceptance criteria (Phase 1a)
- `GET /price-index` returns SSR HTML leading with the biggest same-product gaps, dated via `asOf`, with `Dataset` + `FAQPage` JSON-LD, age notice, disclaimer, WA-only, no "statewide."
- Reads only committed derived JSON at request time; no change to `derive-facts-local.ps1` / `$derivedFiles`; no new committed data file.
- `/price-index` is in `sitemap.xml` and `llms.txt`.
- Fail-soft verified; all tests + real build green.
- Verified in the running app (per /verify): load the page, confirm the hook rows render real numbers and the FAQ section matches the schema.

---

## Phase 1b — Weekly dated archive (CODE — optional fast-follow, deferrable)

Adds the "keeps score over time" credibility + a "this week vs last week" press hook. Deferred because Phase 1a already yields a live citable asset.

- On each derive run, `deriveFactsRun.ts` writes a compact dated snapshot (top gaps + category summary) to `server/data/derived/price-index/<YYYY-MM-DD>.json` via the existing `atomicWrite`.
- Serve `GET /price-index/:date` from the snapshot; `/price-index` continues to render the latest.
- PIPELINE GOTCHA (load-bearing): `$derivedFiles` in `derive-facts-local.ps1` is an EXPLICIT no-glob list by design (transient `*.tmp.json` must never be committed). A weekly-growing archive dir breaks that. Resolution before building 1b: either (a) add the archive dir with a `.gitignore` `*.tmp.json` guard and a directory-scoped `git add`, or (b) keep a single rolling `price-index-latest.json` in the explicit list and store history elsewhere. Decide at 1b kickoff; do NOT silently add a glob.
- Not required for the citation thesis. Build only if Phase 1a shows traction or a press opportunity wants the historical angle.

---

## Phase 2 — Findability + email press (OPS/light — after 1a is live)

- Confirm `/price-index` indexed in Google Search Console + Bing Webmaster Tools; confirm it appears in `/sitemap.xml` and `/llms.txt` live.
- Watch the existing weekly citation monitor (baseline 0/8). **Success metric: ≥2/8 monitored queries cite gmaslist.com within 12 weeks.**
- Email press via the free HARO stack (familiar, not Reddit): Source of Sources, Qwoted/Featured free tiers, #journorequest on X/Bluesky for WA / cannabis / cost-of-living. Pitch as "one-person WA site tracking real dispensary price gaps." (Optional cheap attorney read of RCW 69.50 scope before a BIG press push — not a blocker; WAC 314-55-155 confirmed licensee-scoped, does not bind Gmaslist.)

## Phase 3 — Reddit (OPTIONAL, deferred, hand-held — only after 1a/2)

Not gated on anything; skippable with no loss to the thesis. Erik has never used Reddit → treat as a low-commitment toe-dip walked through together: read-only first to learn the culture; then answer only genuine "cheapest X near [WA town]" questions with a real derived number + link, disclosing ownership on first mention (90/10 rule, no marketing language, no sockpuppets). Decide weekly hours only if the toe-dip feels worthwhile.

---

## Kill-switch
If the monitor is still ~0/8 after 8–12 weeks of `/price-index` live + Phase-2 distribution, the citation thesis is falsified — pivot. Cost to reach that verdict is low because Phase 1a + 2 are mostly automated.

## What this freezes
Engine-first expansion (more Layer-2 derived facts) pauses while the reach bet runs — except adding WA stores (directly improves coverage/credibility).

---

## Readiness-review resolutions (2026-08-08)

Ran `/bmad-check-implementation-readiness` on this story (report: `implementation-readiness-report-2026-08-08.md`). Verdict: **READY** for Phase 1a — 0 critical, 0 major, 6 minor. The findings below supersede the ambiguous parts of the tasks above; apply them at build time.

1. **Data foundation VERIFIED (was the top risk).** Confirmed live against `server/data/derived/disparities.json`: rows live at `data.disparities[]` and each row carries `storesCarrying[{ dispensaryId, price, quantityAvailable }]` alongside `lowPrice/highPrice/spread/spreadPct`. The Donny Burger row resolves to `2020-solutions-north-bellingham $14.40 → 2020-solutions-pacific-highway $84`. The reduce-over-`storesCarrying` pattern (name the store you pull the price from) is fully supported.
2. **Data access precision (supersedes Task 2 shorthand).** Do NOT index the envelope's `.data` directly. Read exactly like `compareRoute.ts:344`: `const all = Array.isArray(disparitiesEnv.data?.disparities) ? disparitiesEnv.data.disparities : []`. Resolve store labels via the extracted `storeName(dispensaryId)`.
3. **Sort key (product decision — resolve before writing Task 2).** The table sorts by absolute `spread` ($), but the PRFAQ sells the "5×" multiple (`spreadPct`). Decision: **render BOTH a `$` spread and a `×` (spreadPct) column, sort by `spread` desc, and lead the prose/headline with the `×`** so the copy matches the PRFAQ hook while the ranking stays big-ticket-first. The top row ($14→$84) wins on both regardless.
4. **Freshness posture (supersedes the `allStale` language in Task 2/NFR1).** `disparities.json` rows have NO per-row `stale` flag (unlike region floors). Freshness here is whole-file: use `asOfPhrase(disparitiesEnv.data?.generatedAt ?? rollups.generatedAt)` plus an age check, and the epoch/never-derived caveat. Do not look for a per-row stale mark — it doesn't exist in this dataset. (`coverage.staleRecords` is a build-time count, not a per-row signal, and must not be presented as one.)
5. **FR8 Dataset JSON-LD is now an explicit task, not just an AC.** Task 2 must emit a `Dataset` `<script type="application/ld+json">` via the extracted `datasetJsonLd` helper (mirroring `/compare`), in addition to the `FAQPage` schema in Task 3. Keep the schema-text == on-page-text invariant for both.
6. **Refactor sequencing (Task 1 is the only regression risk).** Extracting shared primitives touches the LIVE `/compare` route. Do Task 1 first, then run `compareRoute.test.ts` immediately to prove no `/compare` regression, BEFORE writing `priceIndexRoute.ts`.
7. **Human discoverability (deferred, not Phase 1a).** Nothing in the app links a human to `/price-index` (bots reach it via sitemap + llms.txt, which is sufficient for the citation thesis). If human traffic is ever wanted, add an in-app entry point later.
8. **Tracking note.** Phases 2–3 are ops/human work, not buildable code stories — track them separately so only Phase 1a reads as "ready for dev."

---

## Status

**review** (Phase 1a implemented 2026-08-08; Phase 1b/2/3 remain backlog per their own tracking keys)

## Tasks / Subtasks (Phase 1a)

- [x] Task 1 — Extract shared SSR primitives to `server/utils/ssrPage.ts`, import + re-export from `compareRoute.ts` (behavior-preserving; `compareRoute.test.ts` + `compareRegionRoute.test.ts` green).
- [x] Task 2 — `server/routes/priceIndexRoute.ts` `GET /price-index`: hook rows (top-15 by `spread` desc, `$` + `×` per readiness #3, price pulled from the named store), `byCategory.avgSpreadPct` table, "stores most often cheapest," region funnel, `Dataset` JSON-LD, whole-file freshness (readiness #4), fail-soft.
- [x] Task 3 — `FAQPage` JSON-LD + visible "Common questions" section from one shared array mirroring `citation-questions.json` verbatim (schema-text == on-page-text, no `& < >`).
- [x] Task 4 — Honesty/legal invariants: `AGE_NOTICE` + positioning disclaimer, WA-only (never "statewide"), no discount %/potency/leaderboard, `Cache-Control: public, max-age=3600`, `res.type('html')`, fail-soft (never a 500).
- [x] Task 5 — Registered `GET /price-index` in `server/index.ts` before the SPA catch-all.
- [x] Task 6 — `/price-index` added to sitemap `STATIC_PATHS` (data-backed `lastmod`) + `buildLlmsTxt` Pages.
- [x] Task 7 — `priceIndexRoute.test.ts` (+18) + `sitemapRoute.test.ts` (+3); full server suite 984/984 green; real `npm run build` clean; live-verified in the running app.

## Dev Agent Record

### Implementation Plan / Decisions
- **Readiness #6 (refactor first):** Did Task 1 first, ran `compareRoute.test.ts` before writing the route — extraction proven behavior-preserving.
- **`page()` generalization:** taught `page()` to accept a single JSON-LD object OR an array. A single object still emits exactly one `<script>` block, so `/compare` output is byte-identical; the array form lets `/price-index` carry both `Dataset` and `FAQPage`.
- **Readiness #3 (sort key):** rows sorted by `spread` desc; each renders both the `$` spread and the `spreadPct` `×`, worded as "N× the lowest price" (`spread = spreadPct × lowPrice`, so this is rigorously exact and avoids "× more" ambiguity). The prose lede leads with the top row's `×`.
- **Readiness #4 (freshness):** whole-file — `generatedAt` (envelope-level, not `data.generatedAt`, which doesn't exist) + a 14-day age check → "freshness currently unverified"; epoch/never-derived → safe empty page, never a 1970 date. No per-row stale flag on this dataset.
- **FAQ single-sourcing:** questions are a server-side literal mirroring `citation-questions.json` (no `resolveJsonModule` added); a guard test asserts every monitor question is present so the mirror can't silently drift. Answers are honesty-safe (WA-only, no discount %, no crowned "best store").
- **Region funnel:** `renderPriceIndexHtml` takes an optional `regionLinks` (default `[]`, keeps it pure/testable); the route passes live `readRegions()` results (itself fail-soft).

### Completion Notes
- All 7 Phase-1a tasks + all Phase-1a acceptance criteria satisfied.
- Confirmed: **no change to `scripts/derive-facts-local.ps1` / `$derivedFiles`, no new committed data file.** Reads existing committed derived JSON at request time only.
- Live end-to-end verification on the built production server (`NODE_ENV=production node server/dist/server/index.js`): `GET /price-index` → 200, `Cache-Control: public, max-age=3600`, Dataset + FAQPage JSON-LD, hook row #1 = Donny Burger (DOH) 7g `$14.40 at 2020 Solutions North Bellingham to $84.00 at 2020 Solutions Pacific Highway — a $69.60 gap, 4.8× the lowest price, across 2 stores`, category table 24%/20%/14%, region funnel Bellingham/Everett/Mount Vernon, 0 "statewide", age notice + disclaimer, "Prices observed as of August 8, 2026".

### File List
- `server/utils/ssrPage.ts` (new) — extracted shared SSR primitives.
- `server/routes/priceIndexRoute.ts` (new) — `/price-index` render + handler.
- `server/routes/priceIndexRoute.test.ts` (new) — 18 tests.
- `server/routes/compareRoute.ts` (modified) — import + re-export the extracted primitives; remove local copies; keep `categorySlug`.
- `server/index.ts` (modified) — register `GET /price-index` before the SPA catch-all.
- `server/routes/sitemapRoute.ts` (modified) — `/price-index` in `STATIC_PATHS` (data-backed `lastmod`) + `buildLlmsTxt` Pages line.
- `server/routes/sitemapRoute.test.ts` (modified) — +3 assertions for the new URL/line.
- `ADR.md` (modified) — ADR-117 Proposed → Accepted + build outcome + change-log entry.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — `price-index-phase-1a` → review.
- `_bmad-output/planning-artifacts/story-price-index.md` (modified) — frontmatter `baseline_commit`, this record.

## Change Log
- 2026-08-08 — Phase 1a implemented (bmad-dev-story). ADR-117. 984/984 server tests green, real build clean, live-verified. Status → review.
- 2026-08-09 — Code review (`/code-review`, 8-angle) + fixes: guarded `spreadPct` (real 500 fix), rollups-missing accounting recovery, imported `categorySlug`, percent fallback for tiny multiples, sitemap epoch-lastmod guard, extracted shared `freshnessSentence`/`renderTopCheapest`/`disparityEndpoints` into `ssrPage.ts` (dedup /compare), `page()` JsonLd typing, simplifications; plus lede now leads with the biggest MULTIPLE (the 4.8× hook) not the top-by-$ row. 989/989 green, build clean, live-verified. File List additions: `server/utils/ssrPage.ts` (3 new shared helpers + JsonLd type + spreadPct guard), `server/routes/sitemapRoute.ts` (epoch-lastmod guard), `server/routes/compareRoute.ts` (now consumes the shared helpers). Still `review`, uncommitted.
