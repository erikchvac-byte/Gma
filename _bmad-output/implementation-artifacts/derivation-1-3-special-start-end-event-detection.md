---
baseline_commit: c93e9abfb6a40e2b48da14e0efa3f9b95e34c428
---

# Story derivation-1.3: Special start/end event detection (D1)

Status: done

## Story

As a **shopper-facing data consumer**,
I want per-SKU special-start and special-end events detected from the observation series,
so that "today's price change" is surfaced honestly as a special beginning or ending (list prices are sticky — 0% median drift — so all real movement is specials; FR8, Gate 3).

## Grounding (read before starting — real `products.db` numbers, story-creation time 2026-07-09)

Queried the live home-machine DB (`~/GmaS-data/products.db`, `node:sqlite`, read-only) directly rather than trusting the epics doc's AC text on faith — same discipline as 1.2.5.

- **16 calendar days of history**: 2026-06-24 → 2026-07-09. 5,392 products, 39,033 observations.
- **`ProductObservation.special` IS the correct signal — do not look at per-option `specialPrice` separately.** It is already a single boolean per observation, computed at scrape time from the source itself: Dutchie sets it straight from the source's own `p.special` flag (`_dutchieProducts.ts:169`, `special = Boolean(p.special)`; per-option `specialPrice` is only populated `special ? num(recSpecial[i]) : null` — gated BY this flag, not the other way around); Weedmaps computes it as `options.some(o => o.specialPrice !== null)` (`_weedmaps.ts:237`) — an OR across weight tiers. Both sources collapse to ONE boolean per observation. Treat `special` as "does this specialPrice exist" — it already is that, by construction, for both sources.
- **Gap-tolerance is not theoretical here — it is the dominant case.** On 2026-07-09 (today at story-creation time), 4,612 of 5,392 products (85%) had **no observation at all** — this is the real, currently-ongoing ~2-day Dutchie-scraper outage 1.2.5 already flagged to Erik. A naive "yesterday vs today" comparison would silently manufacture ~4,600 false special-end events today; the presence-aware walk correctly reports `'gap'` for every one of them (verified — see below).
- **Same-day duplicate observations are real and matter**: 2,245 of 5,392 products have ≥2 observations on the same calendar day at least once; 182 of those instances have a *different* `special` value across the same day's observations. The day-bucketing convention (`dayItems.at(-1)`, the `history.at(-1)`-is-latest convention already established by `productsDb.ts`/1.2/1.2.5) is not a formality — it changes the answer for real records.
- **Both directions fire robustly across the real range** (ran the actual gap-tolerant walk logic per product, `endDate = <day>`, `getValue: dayItems => dayItems.at(-1).special`): 2026-07-07 → 673 starts / 22 ends; 2026-06-25 → 0 starts / 337 ends; 2026-07-02 → 76 starts / 1 end; 2026-07-04 → 79 starts / 1 end. The 2026-06-25 spike matches the first-look investigation's own worked example almost exactly: `cannazone-old-hwy-99` ran a storewide ~50%-off day on 06-24, and "dozens of SKUs exactly doubled on 06-25" (`products-data-first-look-2026-07-03.md`, Finding 1) — that is special-*ending* (price snapping back up), which is precisely what the 337 end-events on 06-25 are. **This story needs no AC correction** (contrast 1.2.5, which did) — use **2026-07-07 as the live worked example for special-start** and **2026-06-25 as the live worked example for special-end** in the live-data proof task.
- **First-observed-day safety already matters in practice**: on 2026-07-01, 96 products had their first-ever observation land on that exact day with `special: true` — correctly NOT an event per the 1.2 helper's `'first'` status (AC4 of 1.2). Verify this in the live-data proof, not just synthetically.

## Acceptance Criteria

1. **Special-start / special-end detection (FR8).** For each `ProductRecord` in `productsFile.products`, walk `history` through `walkPresenceAwareSeries` (`server/utils/presenceAwareSeries.ts`) with `getObservedAt: o => o.observedAt`, `getValue: dayItems => dayItems.at(-1).special` (latest observation of the day wins, per the established `history.at(-1)` convention — AC6 of 1.2), `endDate: today` (no `startDate` — default to that product's own earliest observed day). When the entry for `today` has `status: 'changed'` and `value === true`, emit a `special-start` event; when `value === false`, emit a `special-end` event.
2. **Gap preserves ambiguity (Gate 3).** When today's entry has `status: 'gap'` (no observation today — the dominant real case per Grounding), no event is emitted for that product; it is counted (not silently dropped) under `excluded[{ reason: 'noObservationToday' }]`.
3. **First-observed-day safety.** When today's entry has `status: 'first'` (this product's first-ever observation lands today — real example: 96 products on 2026-07-01), no event is emitted regardless of `value` — a brand-new SKU cannot be said to have "started" or "ended" a special with nothing to compare against. Counted under `excluded[{ reason: 'firstObservation' }]`.
4. **Unchanged is not an event.** When today's entry has `status: 'unchanged'`, no event is emitted. Counted in `coverage.unchangedCount` (not an exclusion — this is an expected, healthy majority case, not a gap in coverage).
5. **No magnitude/value-signal claim (Gate 2).** The emitted `SpecialEvent` type carries only identity (`dispensaryId`, `productId`, `name`, `category`), `type: 'special-start' | 'special-end'`, and `date`. It MUST NOT carry `basePrice`, `specialPrice`, or any discount percentage/depth field — the fact reports that a special started/ended, never how good a deal it is (fix6/Gate 2; the banner/product-special discount % carries no signal).
6. **Envelope-shaped, inspectable (FR7, decision E).** `deriveFactsRun.ts` calls the new pure function, wraps the result via the existing `wrapEnvelope` helper, and writes `server/data/derived/special-events.json`. `excluded[]` = `[{ reason: 'noObservationToday', count }, { reason: 'firstObservation', count }]`; `coverage` = `{ totalProducts, startCount, endCount, unchangedCount, gapCount, firstObservationCount }`.
7. **Pure, additive, gap-tolerant, tested (NFR5, NFR6, FR6).** New module `server/utils/specialEvents.ts` exports a pure function — no I/O, no DB access, no Express/route import, no scraper-registry import (unlike 1.2.5, this fact needs no store roster — it walks `productsFile.products` directly, since it is per-SKU not per-store). Strict-typed unit tests cover: special-start (`false`→`true`), special-end (`true`→`false`), gap-today-no-event, first-observed-day-no-event (even when `value: true`), unchanged-no-event, same-day-duplicate-dedup (latest observation of the day wins when two same-day observations disagree), and a changed-after-gap case (a special starts/ends on the first real observation following one or more gap days — proves the comparison correctly skips the gap rather than comparing to a stale value or fabricating a gap-day event).
8. **Wired into the runner (FR7, decision E).** `deriveFactsRun.ts` computes `today` (already computed once for the extraction-health call — reuse the same variable, do not recompute), calls `buildSpecialEventsReport(productsFile, today)`, writes via `atomicWriteJson` following the exact same envelope pattern as `disparities.json`/`deal-scope.json`/`extraction-health.json`. Extend `DeriveOutcome` with the new file's path + a short summary (mirror the existing `console.log` lines in `main()`).
9. **Live-data proof (Grounding).** Run `deriveFacts()` for real against `~/GmaS-data/products.db` (or query `buildSpecialEventsReport` directly against the real DB read) with `today = '2026-07-07'`: confirm ~673 `special-start` events fire (real spike day). Separately confirm `today = '2026-06-25'` yields ~337 `special-end` events (the `cannazone-old-hwy-99` snap-back example, Grounding section). Record the exact counts obtained (they may differ slightly from the pre-implementation grounding numbers above — record the real numbers, don't edit this AC's text to match).
10. **Regression-safe.** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, `buildExtractionHealthReport`, `disparities.json`/`deal-scope.json`/`extraction-health.json` output, and every existing type are unchanged (FR3, NFR5). No new route (no consumer yet — Epic 3 is out of scope). Full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Build the pure fact function** (AC: 1, 2, 3, 4, 5, 7)
  - [x] New file `server/utils/specialEvents.ts`. Export types: `SpecialEventType = 'special-start' | 'special-end'`; `SpecialEvent { dispensaryId: string; productId: string; name: string; category: string; type: SpecialEventType; date: string }` (deliberately NO price/discount field — AC5/Gate 2); `SpecialEventsReport { events: SpecialEvent[]; totalProducts: number; startCount: number; endCount: number; unchangedCount: number; gapCount: number; firstObservationCount: number }`.
  - [x] Export `buildSpecialEventsReport(productsFile: ProductsFile, today: string): SpecialEventsReport`. For each `rec` of `Object.values(productsFile.products)`: call `walkPresenceAwareSeries(rec.history, { getObservedAt: o => o.observedAt, getValue: dayItems => dayItems.at(-1).special, endDate: today })`; find `todayEntry = walk.find(e => e.date === today)`. If no `todayEntry` or `status === 'gap'` → `gapCount++`. If `status === 'first'` → `firstObservationCount++`. If `status === 'unchanged'` → `unchangedCount++`. If `status === 'changed'`: push a `SpecialEvent` with `type: value ? 'special-start' : 'special-end'`, `date: today`, and increment `startCount`/`endCount` accordingly.
  - [x] `dayItems.at(-1)!.special` — non-null assertion is safe here: `walkPresenceAwareSeries` only calls `getValue` on a non-empty bucket array (verified in `presenceAwareSeries.ts`'s bucketing logic — a day only reaches `getValue` if `byDay.get(day)` returned a populated array).
- [x] **Unit tests** `server/utils/specialEvents.test.ts` (AC: 7) — mirror the `rec()`/`populatedFile()`-style synthetic-fixture pattern from `extractionHealth.test.ts`/`deriveFactsRun.test.ts`. Cover every case in AC7's list. Assert the emitted `SpecialEvent` object shape has exactly the AC5-mandated fields (no stray price field leaking in from a spread of the underlying option data). 10/10 passing.
- [x] **Wire into the runner** (AC: 6, 8, 10)
  - [x] In `deriveFactsRun.ts`, call `buildSpecialEventsReport(productsFile, today)` using the SAME `today` variable already computed for the extraction-health call (currently computed right before that call — hoist it slightly earlier if needed, do not recompute a second `new Date()` call which could theoretically return a different day if the process straddles UTC midnight mid-run).
  - [x] Wrap via `wrapEnvelope(report, [{ reason: 'noObservationToday', count: report.gapCount }, { reason: 'firstObservation', count: report.firstObservationCount }], { totalProducts: report.totalProducts, startCount: report.startCount, endCount: report.endCount, unchangedCount: report.unchangedCount, gapCount: report.gapCount, firstObservationCount: report.firstObservationCount })`, write to `path.join(derivedDir, 'special-events.json')` via `atomicWriteJson` (same pattern as the three existing writes).
  - [x] Extend `DeriveOutcome` with `specialEventsPath: string` + `startCount`/`endCount` (or reuse the report's own fields) for the CLI summary line; add a matching `console.log` in `main()` mirroring the existing three.
  - [x] No new zero-collapse guard needed — same reasoning as 1.2.5: this write sits downstream of the existing `report.totalRecords === 0` guard in `deriveFacts()`, which already throws before this would ever compute against a misconfigured/empty DB.
- [x] **Update `deriveFactsRun.test.ts`** (AC: 6, 8, 10) — assert `special-events.json` is written, envelope-shaped, and exercises start/end/gap/first/unchanged via the existing fixture style extended with a multi-day, multi-transition history for at least one product. 5/5 passing (1 pre-existing extended + 1 new dedicated wiring test for start/end).
- [x] **Live-data proof (AC: 9)** — called `buildSpecialEventsReport` directly against the real DB (via a throwaway proof script, deleted after use — not part of the File List) with explicit historical `today` values. `2026-07-07` → **673 special-start / 22 special-end** (exact match to the pre-implementation grounding estimate). `2026-06-25` → **0 special-start / 337 special-end**, with the top sample events landing on `cannazone-old-hwy-99` products exactly as the first-look investigation's worked example predicted (storewide ~50%-off day 06-24, snapped back 06-25). Also ran the real current-day `deriveFacts()` CLI (wall-clock `today = 2026-07-09`) to produce the commit-worthy `special-events.json`: 0 started / 24 ended (consistent with the ongoing ~2-day Dutchie-scraper outage 1.2.5 already flagged — most products show `gapCount` today, not an event).
- [x] **Full regression + build** (AC: 10) — server vitest suite: 501/501 passing (43 files, up from the 490-test baseline — +11 new, 0 regressions). `npm run build` (client `tsc -b && vite build`; server `tsc && node scripts/copyData.mjs`) exits 0. `git status` confirmed: only the intended files changed (new module + test, runner wiring, test extension, the new `special-events.json` artifact, plus the routine `disparities.json`/`deal-scope.json`/`extraction-health.json` refresh from running the real derivation).

### Review Findings

- [x] [Review][Decision] Unguarded per-product day-range can throw and abort the entire derive run [server/utils/specialEvents.ts:43-56] — Resolved: fold into `gapCount`. Wrapped the per-product `walkPresenceAwareSeries` call in try/catch; a thrown range error (product's entire history postdates `today`) is now counted the same as a genuine gap rather than aborting the run. New unit test added covering this path; 16/16 passing.
- [x] [Review][Patch] Gate-2 no-price-field test only asserts on `events[0]` [server/utils/specialEvents.test.ts] — Fixed: test now builds one special-start and one special-end event and asserts the field-shape check over both.
- [x] [Review][Patch] Wiring test doesn't assert exact event count [server/scripts/deriveFactsRun.test.ts] — Fixed: added `expect(written.data.events).toHaveLength(2)` before the `arrayContaining` check.
- [x] [Review][Defer] "Latest observation of the day wins" assumes `ProductRecord.history` is stored in true chronological order [server/utils/specialEvents.ts:45] — deferred, pre-existing (convention established by 1.2/1.2.5; this story only reuses it, doesn't introduce it)

## Dev Notes

### Why no store roster is needed here (unlike 1.2.5)

1.2.5's extraction-health fact is per-*store* and needed the scraper-registry roster (`dutchieProductScrapers`/`weedmapsProductScrapers` keys) specifically because a zero-history store is invisible in `productsFile.products` — the roster was the only way to still evaluate and report it. This story is per-*SKU*: every product this fact needs to reason about is, by definition, already a key in `productsFile.products` (a product with zero observations ever cannot exist as a `ProductRecord` — the DB schema only creates a `product` row alongside its first `observation` insert, per ADR-077's schema). So `Object.values(productsFile.products)` is the complete and correct iteration set — do not import either scraper registry into this module or `deriveFactsRun.ts`'s call site for this fact.

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** inspect `ProductOptionObservation.specialPrice` per-option to decide if a special started/ended. `ProductObservation.special` is already the correct, pre-computed single-boolean-per-observation signal for both sources (see Grounding) — reaching into `options[].specialPrice` would be reinventing logic that both scrapers already do, and risks disagreeing with it (e.g. a Dutchie product where `special: true` but a specific option's `recSpecial[i]` happens to be null — `special` is still the source of truth the rest of the codebase treats it as).
- **Do not** compare "today" against "yesterday" directly (naive prior-calendar-day lookup). Given that 85% of products had zero observations on 2026-07-09 at story-creation time (real, ongoing scraper gap), a naive adjacent-day diff would fabricate thousands of false special-end events. Always route through `walkPresenceAwareSeries`, which already skips gaps correctly.
- **Do not** add a `specialPrice`, `basePrice`, or `discountPct`/`discountDepth` field to `SpecialEvent` — this is Gate 2 (fix6): the banner/special discount magnitude carries no honest signal. The event is "a special started/ended," never "here's how much you're saving."
- **Do not** import `dutchieProductScrapers`/`weedmapsProductScrapers` into this module or its call site — see "Why no store roster" above; this is a pure per-SKU fact over `productsFile.products` only.
- **Do not** recompute `today` a second time with a fresh `new Date()` call inside this fact's wiring — reuse the exact same `today` string already computed once in `deriveFactsRun.ts` for the extraction-health call, so both facts agree on "today" within a single run.
- **Do not** treat `'first'` status as an implicit special-start even when its `value` is `true` — a product whose first-ever observation happens to be on-special did not "start" a special today from this fact's point of view; there is nothing earlier to have transitioned from (AC3, mirrors 1.2's own AC4 discipline).
- **Do not** run the live-data-proof task through the CLI's wall-clock `main()` for a historical `today` (e.g. 2026-06-25) — that would commit a `special-events.json` dated with a fabricated `generatedAt` mismatched to the data. Call `buildSpecialEventsReport` directly with the historical `today` argument for the proof; only run the full `main()`/`deriveFacts()` CLI for the current-day commit-worthy artifact.

### Testing standards

- TypeScript strict mode; tests for everything (project rule).
- Server suite (vitest) was 490 tests / 42 files as of the 1.2.5 story-creation baseline — confirm the current count when you run it rather than trusting this number.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).
- The live-data-proof task is a manual/dev-run verification against the real `~/GmaS-data/products.db` (confirmed present at story-creation time, 5,392 products / 39,033 observations through 2026-07-09) — not a committed automated test (the DB is git-ignored, unavailable in CI) — but its actual output belongs in the Debug Log as evidence against real data, not just synthetic fixtures.

### Previous story intelligence (derivation-1.2.5, derivation-1.2, derivation-1.1)

- `walkPresenceAwareSeries`'s day-arithmetic helpers (`toCalendarDay`, `nextCalendarDay`) — only `toCalendarDay` is exported; `nextCalendarDay` is not. This story doesn't need its own day-arithmetic (unlike 1.2.5, which needed to subtract N days for a trailing window) — it only needs a single `endDate`, no `startDate` computation, so no helper needs to be duplicated here.
- 1.2.5 established the `hasValue`-type-guard pattern for narrowing `DayEntry<V>` past a `.filter()` (`Array.filter` doesn't narrow discriminated unions without an explicit predicate) — not needed here since this story only inspects one specific day's entry via `.find()`, not a filtered array, so a simple `if (todayEntry.status === 'changed')` narrows fine without a separate type guard.
- 1.2.5's review found and fixed a write-ordering risk: a new fallible fact-computation step placed before pre-existing `atomicWriteJson` calls could silently drop those writes on a throw. `deriveFactsRun.ts` was already reordered so `disparities.json`/`deal-scope.json` write BEFORE extraction-health computes — this story's new call should be added AFTER the extraction-health write (i.e., append to the end of the existing sequence), not inserted earlier, to preserve that ordering discipline.
- 1.1 established the additive `server/utils/*.ts` module pattern: short header comment (why, not what), pure named exports, a colocated `.test.ts`, no defensive code beyond real boundaries. Follow it.
- "Verify, don't assume" discipline (every prior derivation story): actually run the suite and the live-data proof before declaring done; the grounding numbers above are real but may have shifted slightly by implementation time since the dataset accrues daily — re-verify against the current `products.db` state if it's materially newer.
- No new ADR entry expected — same as 1.1/1.2/1.2.5, this stays inside ADR-077's existing scope (an additive fact-producing module).

### Git intelligence

Recent merges (`c93e9ab` deriv-1.2.5, and 1.1/1.2's prior merges) are single squash-merged PRs with a `Co-authored-by: Claude Sonnet 5` trailer, each landing one additive module + its tests + the runner wiring in one commit. Follow the same shape.

### Project Structure Notes

- New files: `server/utils/specialEvents.ts`, `server/utils/specialEvents.test.ts`.
- Modified: `server/scripts/deriveFactsRun.ts` (new call + write, `DeriveOutcome` extended, `main()` log line), `server/scripts/deriveFactsRun.test.ts` (new assertions).
- Regenerated (if the live-data proof run commits the current-day artifact): `server/data/derived/special-events.json` (new file — envelope-shaped). Do NOT commit an artifact generated with a historical `today` override used only for the proof task.
- No changes to `server/routes/valueRoute.ts` (no route this story — no consumer exists yet), any client file, `data.json`, `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/extractionHealth.ts`, `server/utils/productsDb.ts`, `server/scrapers/dutchie-stores.ts`, `server/scrapers/weedmaps-stores.ts`, or any existing type.

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.3] — written AC text; confirmed buildable as-written against live data (see Grounding section — no correction needed, contrast 1.2.5).
- [Source: _bmad-output/implementation-artifacts/investigations/products-data-first-look-2026-07-03.md#Finding 1] — the `cannazone-old-hwy-99` 06-24→06-25 snap-back example this story's live-data proof cites; origin of "daily price change = special start/end" framing.
- [Source: server/utils/presenceAwareSeries.ts] — the Gate 3 primitive this fact consumes (`walkPresenceAwareSeries`, `DayEntry<V>`), unmodified.
- [Source: server/utils/extractionHealth.ts] — sibling 1.2.5 fact; mirrors its module style, `wrapEnvelope` usage, and the `hasValue`-guard lesson (not needed here, see Dev Notes).
- [Source: server/scrapers/_dutchieProducts.ts:169,177] — `special = Boolean(p.special)`; `specialPrice: special ? num(recSpecial[i]) : null` — proves `special` is the pre-computed source-of-truth, not something to re-derive from `specialPrice`.
- [Source: server/scrapers/_weedmaps.ts:237] — `special = options.some(o => o.specialPrice !== null)` — the Weedmaps-side equivalent construction.
- [Source: server/types/index.ts#ProductObservation, #ProductOptionObservation, #ProductRecord, #ProductsFile] — shapes this fact reads (does not modify).
- [Source: server/utils/derivedEnvelope.ts] — `wrapEnvelope`/`isEnvelope`, reused unchanged.
- [Source: server/scripts/deriveFactsRun.ts] — current runner (read in full at story-creation time); the file this story extends. Note the existing write-ordering discipline from the 1.2.5 review (Dev Notes above).
- [Source: _bmad-output/implementation-artifacts/derivation-1-2-5-source-extraction-health-fact.md] — sibling fact story; pattern for grounding-first story creation, module style, write-ordering lesson from its own code review.
- [Source: _bmad-output/implementation-artifacts/derivation-1-2-presence-aware-time-series-helper.md] — the helper's contract and gotchas (per-window `'first'` semantics, non-exported day-arithmetic internals).
- [Source: ADR.md#ADR-077] — the substrate decision this fact is built against.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via bmad-dev-story.

### Debug Log References

- `npx vitest run server/utils/specialEvents.test.ts` — 10/10 passed.
- `npx vitest run server/scripts/deriveFactsRun.test.ts server/utils/specialEvents.test.ts` — 15/15 passed (5 in deriveFactsRun.test.ts incl. 1 pre-existing extended + 1 new dedicated wiring test, 10 in specialEvents.test.ts).
- `npx vitest run server --exclude '**/dist/**'` — full server suite: 43 files / 501 tests passed (up from the 490-test baseline; +11 new, 0 regressions).
- `npm run build` (repo root) — client (`tsc -b && vite build`) and server (`tsc && node scripts/copyData.mjs`) both completed with exit code 0.
- **Post-review fixes (code-review workflow, 2026-07-09):** added a per-product try/catch around the `walkPresenceAwareSeries` call in `specialEvents.ts` (folds a future-dated-history product into `gapCount` instead of throwing and aborting the whole derive run — Erik's call: fold into gapCount, not a new exclusion reason); extended the Gate-2 field-shape test to cover both a special-start and special-end event; added an exact-length assertion to the dedicated wiring test. `npx vitest run server --exclude '**/dist/**'` — 43 files / 502 tests passed (+1 from the new gap-safety test). `npm run build` re-run clean, exit 0.
- **Live-data proof (AC9), real run against `~/GmaS-data/products.db` via a throwaway proof script (deleted after use, not in File List):**
  - `today = '2026-07-07'` → `startCount: 673`, `endCount: 22` — exact match to the pre-implementation grounding estimate (673 starts). Sample start events landed on `cannazone-old-hwy-99` Pre-Rolls/Vaporizers products.
  - `today = '2026-06-25'` → `startCount: 0`, `endCount: 337` — exact match to the pre-implementation grounding estimate (337 ends). Sample end events again landed on `cannazone-old-hwy-99` products, confirming the first-look investigation's worked example (storewide ~50%-off day 06-24, snapped back 06-25 — that snap-back IS the special-end).
  - Real current-day run via `deriveFacts()` CLI (wall-clock `today = 2026-07-09`): `startCount: 0`, `endCount: 24` — consistent with the ongoing ~2-day Dutchie-scraper outage 1.2.5 already flagged to Erik (most products show `gapCount` today, not an event; matches the earlier grounding's naive count of 24 end events for this exact day).

### Completion Notes List

- Implemented `buildSpecialEventsReport` in `server/utils/specialEvents.ts` exactly per the story's design: walks each `ProductRecord.history` through the 1.2 helper (`walkPresenceAwareSeries`) with `getValue: dayItems => dayItems.at(-1).special` (latest-observation-of-the-day wins, matching the established `history.at(-1)` convention), `endDate: today`, no explicit `startDate` (defaults to each product's own earliest day). `changed` → `false→true` emits `special-start`, `true→false` emits `special-end`; `gap`/`first`/`unchanged` emit no event and are counted instead (AC1–4).
- `SpecialEvent` carries only identity + `type` + `date` — no price/discount field, honoring Gate 2 (AC5); verified by a dedicated test asserting the exact key set on an emitted event.
- No store roster needed (unlike 1.2.5) — this is a pure per-SKU fact over `productsFile.products`; a zero-observation product cannot exist as a `ProductRecord` (DB schema invariant), so no scraper-registry import was added to this module or its call site (Dev Notes anti-pattern honored).
- `deriveFactsRun.ts` wired the new call AFTER the extraction-health write (preserving the write-ordering discipline from 1.2.5's own code review) and reused the SAME `today` variable already computed for extraction-health — no second `new Date()` call added.
- Same-day duplicate-observation dedup (latest wins) verified by two dedicated tests (both directions: false-then-true-same-day resolves to the later value, and vice versa).
- Changed-after-gap verified by a dedicated test proving the comparison skips the gap day rather than fabricating an event on it or missing the real transition.
- Live-data proof (AC9) confirmed BOTH pre-implementation grounding estimates exactly: 2026-07-07 → 673 starts / 22 ends; 2026-06-25 → 0 starts / 337 ends, with the `cannazone-old-hwy-99` worked example landing in the sample output as predicted. No AC correction was needed (contrast 1.2.5).
- Real current-day derivation run committed `special-events.json` (envelope-shaped, 0 started / 24 ended for 2026-07-09) alongside the routine `disparities.json`/`deal-scope.json`/`extraction-health.json` refresh from the same run.
- No new ADR entry — stays inside ADR-077's existing scope, consistent with 1.1/1.2/1.2.5.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` updated to `in-progress` at start of this session; updated to `review` at completion (Step 9).

### File List

- `server/utils/specialEvents.ts` (new; post-review — per-product try/catch guard added around `walkPresenceAwareSeries`)
- `server/utils/specialEvents.test.ts` (new; post-review — added future-dated-history gap-safety test, strengthened Gate-2 field-shape test to cover both event types)
- `server/scripts/deriveFactsRun.ts` (modified — new call + write, `DeriveOutcome` extended, `main()` log line)
- `server/scripts/deriveFactsRun.test.ts` (modified — envelope-shape assertions for the new artifact + a dedicated real-transition wiring-level test; post-review — added exact event-count assertion)
- `server/data/derived/special-events.json` (new — real data, envelope-shaped)
- `server/data/derived/disparities.json` (regenerated — routine refresh from the real derivation run, unrelated content change)
- `server/data/derived/deal-scope.json` (regenerated — routine refresh from the real derivation run, unrelated content change)
- `server/data/derived/extraction-health.json` (regenerated — routine refresh from the real derivation run, unrelated content change)

Untouched (verified, not modified): `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/extractionHealth.ts`, `server/utils/productsDb.ts`, `server/utils/presenceAwareSeries.ts`, `server/utils/derivedEnvelope.ts`, `server/routes/valueRoute.ts`, `server/scrapers/dutchie-stores.ts`, `server/scrapers/weedmaps-stores.ts`, any client file, `data.json`.

## Change Log

- 2026-07-09: Story created via bmad-create-story. Grounding query against the live `products.db` confirmed the epics doc's AC text as written (no correction needed, unlike 1.2.5) — 2026-07-07 and 2026-06-25 identified as the live worked examples for special-start/special-end respectively.
- 2026-07-09: Story implemented via bmad-dev-story — `specialEvents.ts` (+ tests) added, wired into `deriveFactsRun.ts` (appended after the extraction-health write, reusing its `today`), `deriveFactsRun.test.ts` extended with a dedicated real-transition test. 501/501 server tests green (+11), production build clean. Live-data proof against the real `products.db` confirmed both grounding estimates exactly (2026-07-07: 673 starts/22 ends; 2026-06-25: 0 starts/337 ends, matching the `cannazone-old-hwy-99` snap-back worked example) and the current-day run (0 starts/24 ends) is consistent with the ongoing Dutchie-scraper outage already flagged by 1.2.5. Status → review.
- 2026-07-09: 3-layer adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 1 decision-needed, 2 patch, 1 defer, 11 dismissed as noise. Erik resolved the decision (fold a future-dated-history product into `gapCount` rather than a new exclusion reason) and approved applying both patches. All 3 fixed: per-product try/catch guard in `specialEvents.ts`, strengthened Gate-2 test, exact event-count assertion in the wiring test. 502/502 server tests green (+1), production build re-verified clean. One item deferred to `deferred-work.md` (pre-existing chronological-order assumption inherited from 1.2/1.2.5). Status → done.
