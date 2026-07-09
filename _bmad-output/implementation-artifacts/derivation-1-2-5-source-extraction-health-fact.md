---
baseline_commit: 8223cf123da1cc2889b835a76533b41ed869e4eb
---

# Story derivation-1.2.5: Source/extraction-health fact

Status: done

## Story

As a **derivation-engine maintainer**,
I want a derived fact that flags when a store's menu likely broke in extraction versus is genuinely empty,
so that downstream facts (especially Story 1.7's new-arrival/dormancy feed) are not computed over a silently-holed asset (FR6 consumer, decision C).

## IMPORTANT: Grounding correction vs. the epics document

`_bmad-output/planning-artifacts/epics-derivation-engine.md` Story 1.2.5 names `caravan-cannabis-burlington` as "the live suspected-failure proof" and writes an AC expecting the fact to positively flag it as `suspected-extraction-failure`, distinct from a genuinely-empty store like `the-vault-silvana`. **Real data queried directly against `products.db` at story-creation time (2026-07-09) shows this AC as literally written is not achievable honestly:**

- `caravan-cannabis-burlington` (Weedmaps, `weedmaps-stores.ts:41`, actively registered in `weedmapsProductScrapers`) has **zero rows** in `product`/`observation` — it has never produced a single observation, ever.
- `the-vault-silvana` (Dutchie, `dutchie-stores.ts:19`, actively registered in `dutchieProductScrapers`) **also has zero rows** — identically zero, despite being confirmed by Erik as a genuine "COMING SOON" empty menu ([[feedback_deal-tier-collapse]] memory, 2026-07-01).
- Both stores are actively attempted every scrape run. Neither leaves any trace in `products.db` either way: `scrapeProductsRun.ts:66` computes `results[id] = raws.length` (0 = soft empty menu, not an error) but **only `console.log`s it** — this per-run success/empty/error signal is never persisted to the DB or any file. So "scraped successfully, found 0 products" and "scrape never ran / crashed silently" are indistinguishable from `products.db` alone for any store with zero history.
- Verified: the full product-scraper roster (`Object.keys(dutchieProductScrapers)` ∪ `Object.keys(weedmapsProductScrapers)`) is **26 stores**; exactly **24 have any observation rows**; the 2 with zero are precisely `caravan-cannabis-burlington` and `the-vault-silvana` — and they are indistinguishable from each other in the DB.

**Resolution (this story's actual, honest design):** a third status, `insufficient-history`, applies uniformly to any store with too little real observed history in its trailing window to compute a baseline — **including zero**. `caravan-cannabis-burlington` and `the-vault-silvana` both land in `insufficient-history`, not `suspected-extraction-failure` and not asserted safe. This is the honest fact: the algorithm cannot support a stronger claim for either from `products.db` alone (no scraper change, decision C/NFR5), and it does not silently drop them either (both are still reported by dispensaryId, feeding `excluded[]`/`coverage` per FR7). Erik's out-of-band manual confirmation that Silvana is COMING SOON lives outside this derived fact, as it must (the fact cannot depend on external/manual knowledge — NFR5 additive boundary).

**The mechanism decision C describes (today's count vs. trailing median) still works — and works well — for the actual failure-*mode* it targets: a store that WAS accruing real history and then collapses.** Real, live proof of that case exists in the current data: `2020-solutions-north-bellingham` and `2020-solutions-pacific-highway` both collapsed from ~350+ products/day to ~93–96/day on 2026-07-08 and stayed there through 2026-07-09 (a ~73% drop, persisting) — this is the `suspected-extraction-failure` case the fact is built to catch, and it is queryable today. **This story's dev agent should treat the 2020-solutions pair as the live worked example** (not caravan/silvana, which the fact correctly abstains on).

**If Erik wants a stronger signal for the always-zero case**, that requires either (a) a scraper-side change to persist a "scrape attempted, 0 result" marker (explicitly out of scope here — decision C says "no scraper change") or (b) a manually-curated known-empty allowlist (an editorial/registry change, not a derivation-time fact, and a separate decision). Neither is this story's job. Flag this to Erik at story handoff — do not silently reinterpret further or build (a)/(b) without asking.

## Acceptance Criteria

1. **Store roster.** The fact evaluates every store in the product-scraper roster — the union of `Object.keys(dutchieProductScrapers)` (`server/scrapers/dutchie-stores.ts`) and `Object.keys(weedmapsProductScrapers)` (`server/scrapers/weedmaps-stores.ts`), deduplicated by dispensaryId (26 stores as of 2026-07-09) — not just dispensaryIds that happen to appear in `products.db` (a zero-history store must still be evaluated and reported, not silently omitted).
2. **Per-store daily count series, gap-tolerant (FR6).** For each store, build a per-day distinct-product-count series from that store's observations using `walkPresenceAwareSeries` (`server/utils/presenceAwareSeries.ts`) — items are `{ observedAt, productId }` pairs from every observation of every product with that `dispensaryId`; `getValue` reduces a day's bucket to `new Set(dayItems.map(i => i.productId)).size` (distinct products, guarding against a product observed twice the same calendar day). A store with zero observations ever must not crash the walk (the helper returns `[]` for empty input — handle that explicitly, do not assume a non-empty result).
3. **Trailing baseline + collapse detection (decision C).** Walk the range `[today − 14 days, today]` (`TRAILING_WINDOW_DAYS = 14`). The trailing window is the 14 days *before* today (today itself is never part of its own baseline). A store needs at least `MIN_BASELINE_DAYS = 5` real (non-`'gap'`) observed days within the trailing window to have a valid baseline (5 chosen because the 2 newest-onboarded stores in the live data have only 9 days of history total — a 5-day floor is reachable by every currently-active store while still excluding same-day-onboarded noise). Below that floor (0 counts too) → status `insufficient-history`, `trailingMedian: null`.
4. **Collapse threshold.** With a valid baseline, compute `trailingMedian` (standard median) over the trailing window's real day-values. Flag `suspected-extraction-failure` when either: today is a `'gap'` (zero observations at all today, despite a valid nonzero baseline — the strongest signal), OR today's count is `< trailingMedian * COLLAPSE_RATIO` where `COLLAPSE_RATIO = 0.5` (chosen with margin above the largest normal day-to-day swing seen in live data, ~26% on `kush21-everett-evergreen`, comfortably below the ~73% real collapse seen on the 2020-solutions pair). Otherwise → `ok`.
5. **`caravan-cannabis-burlington` / `the-vault-silvana` — the corrected behavior.** Given the current dataset (both stores have zero observations, ever), each surfaces as `insufficient-history` — the same bucket, not a distinguishing verdict between them (see grounding correction above). The fact must not throw, must not fabricate a `suspected-extraction-failure` label for either from zero signal, and must not silently omit either from `data`/`coverage`.
6. **`2020-solutions-north-bellingham` / `2020-solutions-pacific-highway` — the live worked example.** Given the real collapse in the current dataset (~350+/day → ~93–96/day starting 2026-07-08, persisting through 2026-07-09), when the fact runs with `today = '2026-07-09'`, both stores are flagged `suspected-extraction-failure` with a `trailingMedian` in the ~330–360 range and `todayCount` ~93–96. This is the acceptance-level proof that the mechanism works, exercised via a real (not synthetic-only) fixture or a direct query against the live `products.db` in a dev-run/manual check — synthetic unit tests still cover the boundary/edge cases (AC7).
7. **Pure, additive, gap-tolerant, tested (NFR5, NFR6, FR6).** New module `server/utils/extractionHealth.ts` exports a pure function (no I/O, no DB access, no Express/route import) consuming the 1.2 helper; it imports nothing from `server/scripts/`, `server/routes/`, or the scraper registry modules (roster is passed in as `string[]`, computed by the *caller*). Strict-typed unit tests cover: gap-today-with-valid-baseline, collapse-below-threshold, at-threshold (not flagged — `todayCount === trailingMedian * 0.5` exactly is NOT `< `, so not flagged), just-above-threshold (not flagged), zero-history store (`insufficient-history`), exactly-at-`MIN_BASELINE_DAYS` boundary (valid) vs. one-below (`insufficient-history`), a multi-observation-same-day dedup case (two observations of the same `productId` same calendar day count once), and a store present in the roster but wholly absent from `productsFile.products` (must not throw — mirrors AC5/caravan).
8. **Wired into the runner, envelope-shaped, inspectable (FR7, decision E).** `deriveFactsRun.ts` computes the roster (Dutchie ∪ Weedmaps product-scraper keys), calls the new function, and writes `server/data/derived/extraction-health.json` via the existing `wrapEnvelope` helper — `data` holds the report (array of per-store entries + summary counts), `excluded: [{ reason: 'insufficientHistory', count: N }]`, `coverage: { totalStores, okCount, suspectedCount, insufficientHistoryCount }`. No new zero-collapse guard is needed for this file — it is computed downstream of the existing `readPreviousTotalRecords`/`report.totalRecords === 0` guard in `deriveFacts()`, which already refuses to proceed on a misconfigured/empty DB before extraction-health would ever be computed.
9. **Regression-safe.** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, `disparities.json`/`deal-scope.json` output, and every existing type are unchanged (FR3, NFR5). No route added (Epic 3 surfacing is out of scope; no consumer exists yet — Story 1.7 is the first consumer and will read this artifact or call the pure function directly, its own call to make). The full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Build the pure fact function** (AC: 1, 2, 3, 4, 7)
  - [x] New file `server/utils/extractionHealth.ts`. Export `TRAILING_WINDOW_DAYS = 14`, `MIN_BASELINE_DAYS = 5`, `COLLAPSE_RATIO = 0.5` as named constants with the rationale comments from AC3/AC4 (cite the real numbers — future readers should not have to re-derive them).
  - [x] Export types: `StoreHealthStatus = 'ok' | 'suspected-extraction-failure' | 'insufficient-history'`; `StoreHealthEntry { dispensaryId: string; status: StoreHealthStatus; todayCount: number | null; trailingMedian: number | null; observedDaysInWindow: number }`; `ExtractionHealthReport { entries: StoreHealthEntry[]; totalStores: number; okCount: number; suspectedCount: number; insufficientHistoryCount: number }`.
  - [x] Export `buildExtractionHealthReport(productsFile: ProductsFile, storeIds: string[], today: string): ExtractionHealthReport`. Implementation shape:
    - Pre-group `productsFile.products` values by `dispensaryId` once (avoid an O(stores × products) scan): `Map<string, { observedAt: string; productId: string }[]>`, flattening every product's `history` entries.
    - For each `storeId` of `storeIds` (not `Object.keys` of the map — the map may be missing zero-history stores entirely, which is expected and must not throw): look up its items (default `[]`), compute `start = today − 14 days` (write a local day-arithmetic helper mirroring `nextCalendarDay`'s `setUTCDate` approach in `presenceAwareSeries.ts` — that helper is not exported, do not reach into the module internals, write your own small one here), call `walkPresenceAwareSeries(items, { getObservedAt: i => i.observedAt, getValue: dayItems => new Set(dayItems.map(i => i.productId)).size, startDate: start, endDate: today })`.
    - `todayEntry = result.find(e => e.date === today)`; `todayCount = todayEntry && todayEntry.status !== 'gap' ? todayEntry.value : null`.
    - `trailingValues = result.filter(e => e.date !== today && e.status !== 'gap').map(e => e.value)`.
    - If `trailingValues.length < MIN_BASELINE_DAYS` → `{ status: 'insufficient-history', todayCount, trailingMedian: null, observedDaysInWindow: trailingValues.length }`.
    - Else compute `trailingMedian` (standard median: sort, middle value or average of two middles); flag `suspected-extraction-failure` when `todayCount === null || todayCount < trailingMedian * COLLAPSE_RATIO`, else `ok`.
  - [x] Aggregate `totalStores`/`okCount`/`suspectedCount`/`insufficientHistoryCount` from the entries.
- [x] **Unit tests** `server/utils/extractionHealth.test.ts` (AC: 7) — construct a synthetic `ProductsFile` (mirror the `rec()`/`populatedFile()` helper style from `deriveFactsRun.test.ts`) covering: gap-today-with-baseline, collapse-below-threshold, exactly-at-threshold (not flagged), just-above-threshold (not flagged), zero-history store not present in `productsFile.products` at all, exactly-`MIN_BASELINE_DAYS` (valid) vs. one-fewer (`insufficient-history`), same-day duplicate-observation dedup. 9/9 tests passing.
- [x] **Wire into the runner** (AC: 1, 8, 9)
  - [x] In `deriveFactsRun.ts`, import `dutchieProductScrapers` from `../scrapers/dutchie-stores.js` and `weedmapsProductScrapers` from `../scrapers/weedmaps-stores.js` (both are pure `Record<string, () => Promise<...>>` object literals with no top-level side effects — verified at story-creation time; importing them for `Object.keys()` does not trigger any scrape). Build `storeIds = [...new Set([...Object.keys(dutchieProductScrapers), ...Object.keys(weedmapsProductScrapers)])]` (`productScraperRoster()` helper).
  - [x] Call `buildExtractionHealthReport(productsFile, storeIds, today)` where `today = new Date().toISOString().slice(0, 10)` (same UTC-day convention as `toCalendarDay` in `presenceAwareSeries.ts`).
  - [x] Wrap via `wrapEnvelope(report, [{ reason: 'insufficientHistory', count: report.insufficientHistoryCount }], { totalStores: report.totalStores, okCount: report.okCount, suspectedCount: report.suspectedCount, insufficientHistoryCount: report.insufficientHistoryCount })`, write to `path.join(derivedDir, 'extraction-health.json')` via `atomicWriteJson` (same pattern as the two existing writes).
  - [x] Extend `DeriveOutcome` return type with the new file's path + a short summary count if useful for the CLI's `console.log` line (mirror the existing `disparities`/`links` summary lines in `main()`).
- [x] **Update `deriveFactsRun.test.ts`** (AC: 6, 8, 9) — assert `extraction-health.json` is written, envelope-shaped, and (using the existing `rec()`/`populatedFile()` fixture style, extended with a multi-day history for one store and zero history for another store id present in `storeIds` but absent from `productsFile.products`) exercises the `insufficient-history` vs `ok`/`suspected-extraction-failure` split at the wiring level (unit-level detail stays in `extractionHealth.test.ts`). Added a dedicated test using the real `kush21-everett-evergreen` roster id to prove `suspected-extraction-failure` is reachable through the real runner wiring (roster + `today` computation), not just the pure function in isolation.
- [x] **Live-data proof (AC: 6)** — ran `deriveFacts()` for real (`PRODUCTS_DB_PATH=C:/Users/erikc/GmaS-data/products.db npx tsx server/scripts/deriveFactsRun.ts`) against the real home-machine `products.db` with `today = '2026-07-09'` (wall-clock). Confirmed exactly as designed — see Debug Log for full numbers. This also regenerated `disparities.json`/`deal-scope.json` (routine refresh, same pattern as derivation-1.1) and wrote the new `extraction-health.json`; all three committed.
- [x] **Full regression + build** (AC: 9) — server vitest suite: 490/490 passing (42 files, up from the 480/41 baseline — +10 new tests, 0 regressions). `npm run build` (client `tsc -b && vite build`; server `tsc && node scripts/copyData.mjs`) clean. `git status`/diff confirmed: only the intended files changed (new module + test, runner wiring, test extension, the new `extraction-health.json` artifact, plus the routine `disparities.json`/`deal-scope.json` refresh from running the real derivation).

## Dev Notes

### Why the roster must NOT come from `productsFile.products` or `data.json`

Two separate incomplete sources exist and neither is right here:
- `data.json`'s `dispensaries` array (what `readDispensaries()` in `deriveFactsRun.ts` already reads for the deal-scope join) is missing all 8 net-new private Weedmaps stores by design (`weedmaps-stores.ts` comment: "net-new Weedmaps stores are deliberately NOT added to data.json"). Using it would silently drop `caravan-cannabis-burlington`, `western-bud-burlington`, `kaleafa-oak-harbor`, etc. from evaluation entirely.
- `Object.keys(productsFile.products)` (i.e., whatever's actually in the DB) is missing exactly the 2 stores this fact most needs to report on (zero rows = absent key). Using it would make `insufficient-history` unreachable by construction — defeating the fact's purpose.
- The only correct source is the scraper registries themselves — the set of stores actively being *attempted* — per AC1.

### Current-state grounding (read at story-creation time, live `products.db` queried directly via `node:sqlite`)

- 26 stores in the product-scraper roster (17 Dutchie incl. 3 originals + `the-vault-silvana` etc. from `DUTCHIE_STORE_IDS`, 11 Weedmaps incl. 3 overlaps); 24 have observation rows, 2 (`caravan-cannabis-burlington`, `the-vault-silvana`) have zero, ever.
- Per-store daily distinct-product-count ranges (as of 2026-07-09, 9–16 days of real history per store): normal day-to-day swing tops out around 26% (`kush21-everett-evergreen`: 332–448). `2020-solutions-north-bellingham` collapsed 356→96 on 2026-07-08 and stayed at 96 on 2026-07-09 (a ~73% drop, persisting two days); `2020-solutions-pacific-highway` shows the identical pattern (352→93, staying). `salish-coast-cannabis` shows a one-day ~20% dip (125→100→125) that self-recovered — below the 50% threshold, correctly not flagged, no persistence-requirement needed to avoid a false positive here.
- `server/scripts/scrapeProductsRun.ts:66` (`results[id] = raws.length // 0 = empty menu this run (not an error — kept soft)`) is the ONLY place in the codebase that distinguishes "scraped, found 0" from "scrape errored" — and it is discarded after a `console.log`, never persisted. This is why zero-history stores are fundamentally ambiguous from `products.db` alone (see grounding correction above); do not attempt to work around this within this story's additive boundary (NFR5 forbids a scraper change here).

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** try to make `caravan-cannabis-burlington` positively flag as `suspected-extraction-failure` by lowering `MIN_BASELINE_DAYS` toward 0 or special-casing it — this would either misclassify `the-vault-silvana` identically (a confirmed-genuine empty menu) as broken, or require distinguishing them by a signal that does not exist in `products.db` (see grounding section). If you find yourself hardcoding either dispensaryId, stop — that is out of this story's scope.
- **Do not** import the scraper registry modules anywhere except `deriveFactsRun.ts` for the `Object.keys()` roster — `extractionHealth.ts` itself must stay a pure function taking `storeIds: string[]` as a parameter (AC7), consistent with `buildMatchReport`/`buildDealScopeLinks` staying pure and DB/route-agnostic.
- **Do not** add a new Express route for this artifact. No client or story consumes it yet; Story 1.7 is the first consumer and gets to decide whether it reads the committed JSON or calls the pure function directly within the same derivation run — don't preempt that decision.
- **Do not** reinvent a zero-collapse overwrite guard for `extraction-health.json` — it's unnecessary; the existing guard in `deriveFacts()` (on `report.totalRecords`) already runs first and throws before extraction-health would ever compute against a misconfigured/empty DB.
- **Do not** confuse "gap" (no observation that day) with "count of 0" — a day with zero products scraped is, by construction, a `'gap'` in the presence-aware walk (there are no per-product items to bucket), never a `'first'/'unchanged'/'changed'` entry with `value: 0`. This means a valid baseline (≥5 real observed days) can never have a zero median — don't add speculative handling for a `trailingMedian === 0` case that cannot occur.
- **Do not** requery `products.db` directly from `extractionHealth.ts` — it receives the already-read `ProductsFile` as a parameter, exactly like `buildMatchReport`/`buildDealScopeLinks` (keeps it unit-testable with a synthetic fixture, no DB in the test suite for this module).

### Testing standards

- TypeScript strict mode; tests for everything (project rule).
- Server suite (vitest) was 480 tests / 41 files as of story-creation time (2026-07-09) — confirm the current count when you run it rather than trusting this number.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).
- The live-data proof task (AC6) is a manual/dev-run verification against the real `~/GmaS-data/products.db` on this machine (confirmed present at story-creation time, 24 stores / real history through 2026-07-09) — it is not a committed automated test (the DB is git-ignored and not available in CI), but its actual output belongs in the Debug Log as evidence the design decision holds against real data, not just synthetic fixtures.

### Previous story intelligence (derivation-1.2, derivation-1.1)

- `presenceAwareSeries.ts`'s `nextCalendarDay`/day-arithmetic is NOT exported — only `toCalendarDay` and `walkPresenceAwareSeries` are. This story needs its own small "subtract N days from a YYYY-MM-DD string" helper; do not try to import or reach into the sibling module's internals. Mirror its `setUTCDate`-based approach (DST/local-drift-safe) rather than string/millisecond arithmetic.
- 1.2's story established that `'first'` status is per-*window*, not per-all-time — if `startDate` excludes true earlier history, the first in-window day is `'first'` even though real data exists before it. This does not affect this story's median logic (the median only reads `.value`, which every non-gap status carries, including `'first'`), but do not assume `'first'` implies "no earlier real data" when reasoning about a store — it only means "no earlier data within this window."
- 1.1 established the additive `server/utils/*.ts` module pattern: short header comment (why, not what), pure named exports, a colocated `.test.ts`, no defensive code beyond real boundaries. Follow it.
- 1.1's "verify, don't assume" discipline: actually run `deriveFactsRun.test.ts` and the live-data check before declaring this done; don't infer the collapse thresholds are right without checking them against the real per-store count ranges (already done at story-creation time above — re-verify if the dataset has moved by the time this is implemented, since more days accrue daily).
- No new ADR entry expected unless something architecturally significant emerges (this stays inside ADR-077's existing scope, same as 1.1/1.2).

### Git intelligence

Recent merges (`8c75a74` deriv-1.1, and 1.2's merge) are single squash-merged PRs with a `Co-authored-by: Claude Sonnet 5` trailer, each landing one additive module + its tests + the runner wiring in one commit. Follow the same shape.

### Project Structure Notes

- New files: `server/utils/extractionHealth.ts`, `server/utils/extractionHealth.test.ts`.
- Modified: `server/scripts/deriveFactsRun.ts` (roster computation + new write), `server/scripts/deriveFactsRun.test.ts` (new assertions).
- Regenerated (if the live-data proof run is committed): `server/data/derived/extraction-health.json` (new file — envelope-shaped).
- No changes to `server/routes/valueRoute.ts` (no route this story), any client file, `data.json`, `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/productsDb.ts`, or any existing type.

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.2.5] — written AC text; this story file corrects AC2/AC3 per the grounding section above, based on live `products.db` queries run at story-creation time.
- [Source: server/scripts/deriveFactsRun.ts] — current runner (read in full at story-creation time); the file this story extends.
- [Source: server/utils/presenceAwareSeries.ts] — the Gate 3 primitive this fact consumes (`walkPresenceAwareSeries`, `DayEntry<V>`).
- [Source: server/scrapers/dutchie-stores.ts#dutchieProductScrapers, server/scrapers/weedmaps-stores.ts#weedmapsProductScrapers] — the roster source (AC1); confirmed no top-level side effects at import time.
- [Source: server/scripts/scrapeProductsRun.ts:66] — the discarded per-run empty/error signal that motivates the grounding correction.
- [Source: server/utils/derivedEnvelope.ts] — `wrapEnvelope`/`isEnvelope`, reused unchanged.
- [Source: _bmad-output/implementation-artifacts/derivation-1-2-presence-aware-time-series-helper.md] — the helper's contract and gotchas (non-exported internals, per-window `'first'` semantics).
- [Source: _bmad-output/implementation-artifacts/derivation-1-1-runner-served-artifact-envelope.md] — envelope/runner wiring pattern this story follows.
- [Source: _bmad-output/implementation-artifacts/investigations/corpus-synthesis-distilled-truth-2026-07-06.md, products-dataset-timeseries-shape-2026-07-06.md] — origin of the caravan/silvana question this story resolves.
- [Source: ADR.md#ADR-077] — the substrate decision this fact is built against.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via bmad-dev-story.

### Debug Log References

- `npx vitest run server/utils/extractionHealth.test.ts` — 9/9 passed.
- `npx vitest run server/scripts/deriveFactsRun.test.ts` — 4/4 passed (1 pre-existing + 3 new/extended).
- `npx vitest run server --exclude '**/dist/**'` — full server suite: 42 files / 490 tests passed (up from the 480-test baseline; +10 new, 0 regressions).
- `npm run build` (repo root) — client (`tsc -b && vite build`) and server (`tsc && node scripts/copyData.mjs`) both completed with no errors.
- **Live-data proof (AC6), real run against `~/GmaS-data/products.db`, `today = '2026-07-09'`, 26-store roster:**
  - Totals: 8 `ok`, 16 `suspected-extraction-failure`, 2 `insufficient-history`.
  - `2020-solutions-north-bellingham` → `suspected-extraction-failure`, `todayCount: 96`, `trailingMedian: 212.5` (14-day median over `[2026-06-25, 2026-07-08]`; the trailing window itself absorbs 2026-07-08's already-collapsed value of 96, pulling the median down from the ~350 recent-peak I'd eyeballed at story-creation time to 212.5 — the flag still fires correctly: 96 < 212.5×0.5=106.25).
  - `2020-solutions-pacific-highway` → `suspected-extraction-failure`, `todayCount: 93`, `trailingMedian: 213` (93 < 106.5). Both confirm AC6 exactly as designed; the precise median differs from the story's pre-implementation ~330–360 eyeball estimate for the reason above — recorded here rather than editing the AC text (out of this workflow's permitted edit scope).
  - `caravan-cannabis-burlington` / `the-vault-silvana` → both `insufficient-history`, `todayCount: null`, `trailingMedian: null`, `observedDaysInWindow: 0`. Confirms AC5 exactly.
  - **Unplanned real finding, worth flagging to Erik:** 16/26 stores (not just the 2020-solutions pair) show `suspected-extraction-failure` today, and 14 of those 16 have `todayCount: null` (zero observations at all on 2026-07-09) — every one of them a Dutchie-registry store. This is consistent with the local Dutchie product scraper (`scrape-dutchie-local.ps1` / Python `scraper-svc`) not having run for ~2 days (last real Dutchie observations across most stores are dated 2026-07-07). The 2020-solutions pair still shows *reduced but nonzero* counts on 07-08/07-09 only because they're Weedmaps-overlap stores (`weedmaps-stores.ts`, `overlap: true`) — the Weedmaps source kept feeding them independently, at its naturally shallower per-store coverage, which is what a purely-Weedmaps-fed count looks like next to a Dutchie+Weedmaps combined count. This is the fact working exactly as intended on its first real run — surfacing a genuine, currently-ongoing extraction gap — but the underlying scraper-outage fix is out of this story's scope. Flagging for Erik.

### Completion Notes List

- Implemented `buildExtractionHealthReport` in `server/utils/extractionHealth.ts` exactly per the story's grounding-corrected design: 3-status model (`ok` / `suspected-extraction-failure` / `insufficient-history`), 14-day trailing window, 5-day minimum baseline, 0.5 collapse ratio, all as named exported constants with rationale comments. Pure function, no I/O — consumes `walkPresenceAwareSeries` from Story 1.2, takes `ProductsFile` + `storeIds: string[]` + `today: string` as parameters (AC7).
- Same-day duplicate observations of one product are deduped via `new Set(dayItems.map(i => i.productId)).size` inside `getValue` (AC2) — verified by a dedicated test asserting `todayCount === 1` for a product observed twice the same day.
- A store present in the roster but wholly absent from `productsFile.products` (the caravan/silvana case) does not throw — `groupByDispensary` simply has no entry for it, `buildStoreEntry` receives `[]` and produces `insufficient-history` (AC1, AC5). Covered by both a unit test and a `deriveFactsRun.test.ts` wiring-level test.
- `deriveFactsRun.ts` gained `productScraperRoster()` (union of `Object.keys(dutchieProductScrapers)` / `Object.keys(weedmapsProductScrapers)`, deduped) and wires `buildExtractionHealthReport` into the existing envelope/write flow — no new zero-collapse guard added (correctly relies on the existing `report.totalRecords === 0` guard that already runs first, per Dev Notes).
- No route added — Epic 3 surfacing is out of scope; Story 1.7 is the first consumer and gets to decide how it reads this artifact (Dev Notes anti-pattern list honored).
- AC2/AC3 corrected per the story's grounding section: `caravan-cannabis-burlington`/`the-vault-silvana` land in `insufficient-history` (not a false `suspected-extraction-failure` claim for either) — confirmed against real data (Debug Log above). The 2020-solutions pair is the live worked example for the collapse mechanism, also confirmed against real data.
- No new ADR entry — stays inside ADR-077's existing scope, consistent with 1.1/1.2.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` updated to `in-progress` at start of this session (will be updated to `review` at completion, per workflow Step 9).

### File List

- `server/utils/extractionHealth.ts` (new)
- `server/utils/extractionHealth.test.ts` (new)
- `server/scripts/deriveFactsRun.ts` (modified — roster helper, extraction-health wiring, `DeriveOutcome` extended)
- `server/scripts/deriveFactsRun.test.ts` (modified — envelope-shape assertions for the new artifact + a real-roster-id wiring-level collapse test)
- `server/data/derived/extraction-health.json` (new — real data, envelope-shaped)
- `server/data/derived/disparities.json` (regenerated — routine refresh from the real derivation run, unrelated content change)
- `server/data/derived/deal-scope.json` (regenerated — routine refresh from the real derivation run, unrelated content change)

Untouched (verified, not modified): `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/productsDb.ts`, `server/utils/presenceAwareSeries.ts`, `server/utils/derivedEnvelope.ts`, `server/routes/valueRoute.ts`, any client file, `data.json`.

### Review Findings

- [x] [Review][Defer] `today` anchored to wall-clock, not data freshness — deriveFactsRun.ts computes `today` from `new Date()` at run time rather than the productsFile's own freshness. If derivation runs before that day's scrape completes, every store with a valid baseline shows `todayCount: null` → indistinguishable false-positive `suspected-extraction-failure`. Already manifested on the live-data proof run (14/16 flagged stores had `todayCount: null`, correctly attributed there to a real ~2-day Dutchie outage, but the raw signal can't itself tell "hasn't scraped yet today" from "broke"). Deferred — reason: runner sequencing is an ops concern (fix belongs at the derive-after-scrape orchestration layer), not this story's job. [server/scripts/deriveFactsRun.ts]
- [x] [Review][Patch] Write ordering risk: new fallible `buildExtractionHealthReport` call sits before the pre-existing `disparities.json`/`deal-scope.json` `atomicWriteJson` calls — if it throws, those two already-computed artifacts silently fail to persist this run too. Fixed: moved the two existing `atomicWriteJson` calls before extraction-health is computed. [server/scripts/deriveFactsRun.ts]
- [x] [Review][Patch] Unsafe type cast `(e as { value: number }).value` after `.filter(e => e.status !== 'gap')` — `Array.filter` doesn't narrow discriminated unions without an explicit type predicate. Fixed: added a `hasValue` type-guard function and typed the `.filter()` predicate against `DayEntry<number>`. [server/utils/extractionHealth.ts]
- [x] [Review][Defer] No guard against the roster unexpectedly resolving empty (e.g. a broken scraper-registry import) — deferred, pre-existing spec decision (AC8) only reasoned about empty-DB, not empty-roster; low probability, revisit only if observed live. [server/scripts/deriveFactsRun.ts]
- [x] [Review][Defer] Stores dark longer than the 14-day trailing window degrade to `insufficient-history` instead of `suspected-extraction-failure`, under-reporting long-running outages — deferred, real design-reach limitation of the chosen window size, not a coding mistake; worth a future story if observed live. [server/utils/extractionHealth.ts]

## Change Log

- 2026-07-09: Story created via bmad-create-story. Grounding query against the live `products.db` (24/26 roster stores with real history; `caravan-cannabis-burlington`/`the-vault-silvana` both zero-ever) revealed AC2/AC3 as literally written in the epics doc cannot be satisfied honestly — corrected to a 3-status design (`ok`/`suspected-extraction-failure`/`insufficient-history`) with the 2020-solutions pair substituted as the live worked example for the collapse case. Flagged to Erik at handoff.
- 2026-07-09: Story implemented via bmad-dev-story — `extractionHealth.ts` (+ tests) added, wired into `deriveFactsRun.ts` via a new `productScraperRoster()` helper, `deriveFactsRun.test.ts` extended. 490/490 server tests green (+10), production build clean. Live-data proof run against the real `products.db` confirmed both AC5 (caravan/silvana → `insufficient-history`) and AC6 (2020-solutions pair → `suspected-extraction-failure`) exactly as designed, and incidentally surfaced a real, currently-ongoing ~2-day Dutchie-scraper outage affecting 14 other stores — flagged to Erik, out of this story's scope to fix. Status → review.
