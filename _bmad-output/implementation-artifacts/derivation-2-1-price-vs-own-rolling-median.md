---
baseline_commit: 120bd6d2007a8a895d702d5650cbf7573564626c
---

# Story derivation-2.1: Price vs own rolling median (D6 / FR13) — the honest discount

Status: done

Epic: epic-derivation-2 (Accrual facts) — first story. Source: `_bmad-output/planning-artifacts/epics-derivation-engine.md` (Epic 2 — Stories), PRD `prds/prd-Happy-2026-07-06/prd.md` FR13/Gate 2.

## Story

As a data consumer,
I want each SKU's current effective price compared against its own rolling median from history,
So that the only honest discount (fix6 keystone) is surfaced, instead of the meaningless flat banner rate.

This is the fact that **reopens the fix6 gate**: banner/product-special discount % is a flat store/brand promo rate with no per-item signal (`investigations/fix6-basePrice-verdict.md`); the only honest discount magnitude is a price vs the product's OWN rolling history. Epic-3's flagship in-app value card ("how good is this deal vs its own history") is gated on this fact.

## Constants Erik ratifies at dev-start (AC: "named constants Erik ratifies")

Proposed defaults, grounded against live `products.db` 2026-07-11 (see Dev Notes §Grounding). **Dev MUST present these to Erik at dev-start and get explicit ratification before implementing; do not silently change them.**

| Constant | Proposed | Grounded rationale |
|---|---|---|
| `ROLLING_WINDOW_DAYS` | 30 | PRD offered 30 vs 60. History is 18 days (2026-06-24→07-11), so 30 covers all of it today (no data discarded) and becomes a true rolling window as accrual passes day 30. 60 would behave identically to 30 for another ~6 weeks. |
| `MIN_OBSERVED_DAYS` | 7 | Distinct-calendar-day floor per series (NOT product-days — 1.5-review fold-in). At 7: 3,055 option-series qualify, 2,058 comparable on the latest day → 207 below-median rows. At 10: drops to ~1,390 comparable products. At 5: 2,612 (noisier medians). 7 ≈ "one week of real presence." |
| Emit rule | movers only | Emit only rows where `pctVsMedian !== 0`; the 1,830 at-median series are counted (`atOwnMedian` in `excluded[]`), not emitted. Keeps the artifact bounded (~230 rows vs ~2,060). Flip to emit-all later if Epic-3 cards want per-SKU "this is its normal price" lookups. |

## Acceptance Criteria

(Verbatim from epics doc, with grounded implementation bindings in brackets.)

1. **Given** a SKU's observation history in `products.db`, **when** the fact computes, **then** it reads history via a **new SQLite time-range query** — the first real consumer of the `(product_key, observedAt)` indices designed into 1.0 (FR13) — **and** history is explicitly sorted on read before walking (1.3 fold-in; insertion order is never assumed). [New reader fn in `server/utils/productsDb.ts` with `WHERE observedAt >= ?` + `ORDER BY product_key, observedAt` in the SQL itself — the sort guarantee lives in the query, not in caller convention. The whole-file `readProductsFile` path is NOT used by this fact.]
2. **Given** the rolling window and minimum-observation floor, **then** both are named constants Erik ratifies at dev-start, **and** the floor counts DISTINCT CALENDAR DAYS with observations, not raw rows (1.5-review fold-in). [See Constants table above — ratification is a dev-start gate.]
3. **Given** a SKU below the floor, **then** it is suppressed and counted in `excluded[]` — with current history the artifact ships suppression-heavy by design. [Live: ~57% of products fall below a 7-day floor today; that is correct behavior, not a bug.]
4. **Given** gaps in the series, **then** the fact walks via the 1.2 helper (`walkPresenceAwareSeries`), gap-tolerant (Gate 3) — a missing day is never a fabricated "observed, unchanged" day and never enters the median.
5. **Given** Gate 2, **then** the banner/product-special % is not an input; the discount is computed only vs the SKU's own history. [Effective price = `specialPrice ?? basePrice`, single-reduced at the runner boundary — the base/special PAIR never reaches the fact module.]
6. **Given** the input type (FR16 cross-cutting gate), **then** potency fields and the flat banner rate are unreachable (decision F pattern) — the breach does not compile. [Narrowed input type + `@ts-expect-error` compile tests, pattern: `brandPersonas.test.ts`.]
7. **Given** the fact, **then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests covering gap, below-floor, unsorted-input, and window-boundary cases (NFR6).

## Tasks / Subtasks

- [x] Task 0 — Dev-start ratification (AC: 2): present the Constants table to Erik; record his ruling (window, floor, emit rule) in this file's Dev Agent Record before writing code.
- [x] Task 1 — New SQLite time-range reader (AC: 1)
  - [x] Add to `server/utils/productsDb.ts`: a windowed-read function (e.g. `readWindowedObservations(dbPath, sinceIso)`) — `SELECT o.product_key, o.dispensaryId, p.productId, p.name, p.category, o.observedAt, o.options_json FROM observation o JOIN product p ON p.product_key = o.product_key WHERE o.observedAt >= ? ORDER BY o.product_key, o.observedAt`. Deliberately do NOT select `thc`/`cbd`/`totalTerpenes`/`effects` (SQL-level reinforcement of decision F) and do NOT select `flags` (not needed — see Dev Notes §Semantics: no weight/$-per-gram claim is made).
  - [x] Open/close discipline mirrors `readProductsFromDbPath` (NOT fail-soft — same rationale comment: this feeds committed output).
  - [x] Unit tests against an in-memory DB (`:memory:` pattern already used by productsDb tests): boundary row exactly at `sinceIso` included, row before excluded; ORDER BY verified against deliberately out-of-order inserts (insert day 3, day 1, day 2 → rows come back day-sorted; this IS the AC-1 sorted-on-read test at the reader level).
- [x] Task 2 — Pure fact module `server/utils/priceVsOwnMedian.ts` (AC: 3, 4, 5, 6, 7)
  - [x] Narrowed input types (decision F): per-product `{ productId, dispensaryId, name, category, entries: { observedAt, option, effectivePrice }[] }` — NO basePrice/specialPrice pair, NO discount %, NO potency fields, NO flags. Export `buildPriceVsOwnMedianReport(products, today)`.
  - [x] Series key = `(product, option label verbatim)`. Per series per day: last observation of the day wins (`dayItems.at(-1)`, sibling convention — correct because input is sorted). Walk each series with `walkPresenceAwareSeries` (`getValue` = that day's effective price, `endDate: today`, explicit `startDate` = window start day); wrap the walk in try/catch like `specialEvents.ts`/`brandPersonas.ts` (malformed `observedAt` → treat series as fully-gapped, never abort the run).
  - [x] Median = sort observed-day values ascending; odd count → middle; even count → mean of the two middle values. Median is over ALL observed days in the window INCLUDING today (today's price is part of its own window — simplest, stable; note in module header).
  - [x] Compare only series with (a) an observed value on `today` and (b) ≥ `MIN_OBSERVED_DAYS` distinct observed days in the window. Emit per ratified emit rule. Row shape: `{ dispensaryId, productId, name, category, option, currentPrice, medianPrice, pctVsMedian, observedDays }` where `pctVsMedian = (current − median) / median` (negative = below own median = the honest discount; positive = above = premium). Round to 4 decimals (r2-style helper at 4dp) for diff-stable output.
  - [x] Report shape mirrors siblings: `{ rows, totalProducts, totalSeries, comparedCount, belowMedianCount, aboveMedianCount, atMedianCount, belowFloorCount, noObservationTodayCount, noUsablePriceCount }`. Stable sort for clean daily diffs (by `pctVsMedian` ascending — deepest honest discount first — then dispensaryId/productId/option).
  - [x] Tests (strict-typed, NFR6): gap day excluded from median; below-floor suppressed + counted; window-boundary (obs on window-start day counts, day before doesn't); unsorted input at the PURE-FN level (shuffled entries → same output); multi-option product produces independent series; today-at-median counted not emitted; even-count median; unusable-price accounting; `@ts-expect-error` compile tests that a basePrice/specialPrice pair, `discountPct`, and `thc` are not assignable to the input type (pattern: `brandPersonas.test.ts`). [Sold-out exclusion lives at the runner boundary — the pure-fn input type has no `quantityAvailable` by decision F — and is covered by the deriveFactsRun integration test.]
- [x] Task 3 — Runner wiring in `server/scripts/deriveFactsRun.ts` (AC: 1, 5, 7)
  - [x] Compute `sinceIso` = `` `${windowStartDay}T00:00:00.000Z` `` where `windowStartDay` = `today` minus (`ROLLING_WINDOW_DAYS` − 1) calendar days (window includes today). Call the new reader; group rows per product; project each parsed `ProductOptionObservation` DOWN at THIS boundary: skip reported sold-out (`quantityAvailable !== null && <= 0`, Gate-4 sibling precedent), `effectivePrice = specialPrice ?? basePrice`, pass through null/≤0 (the pure fn owns the `noUsablePriceCount` accounting the envelope restates). The pair dies here — mirror the 1.5/1.6 boundary-projection comments. [`windowStartDay` exported from `priceVsOwnMedian.ts` so reader lower-bound and walk lower-bound share one source of truth.]
  - [x] Wrap in envelope (`wrapEnvelope`) with `excluded[]` = `[belowFloor, noObservationToday, atOwnMedian, noUsablePrice]` and coverage = `{ totalProducts, totalSeries, comparedCount, belowMedianCount, aboveMedianCount }`. Write `server/data/derived/price-vs-own-median.json` via `atomicWriteJson`, **placed AFTER all pre-existing writes** (1.2.5 write-ordering discipline — a new fallible step must never gate the existing artifacts).
  - [x] Extend `DeriveOutcome` + `main()` console line (sibling format: `[derive] price-vs-own-median: N below / M above own median (K at-median, J below-floor) → path`).
- [x] Task 4 — Commit-list + docs (AC: 7; load-bearing ops lesson)
  - [x] **Append `'server/data/derived/price-vs-own-median.json'` to `$derivedFiles` in `scripts/derive-facts-local.ps1`** — the list is explicit-by-design; a missed append means the runner writes the file, never commits it, and the next `git reset --hard` silently wipes it (this exact incident stranded six facts once; see the comment block at `scripts/derive-facts-local.ps1:43-49`).
  - [x] NO new route, NO client change, NO `data.json` change (internal-only artifact, mirrors 1.5/1.6/1.7). 1.8 freshness alerting already covers it generically via the envelope — zero alerting work (Epic 2 notes).
  - [x] ADR.md entry (same session, per project ADR rules): ADR-084, decision = FR13 semantics (effective-price series per option, movers-only emit, window/floor as ratified), status Accepted, cross-ref ADR-077/fix6.
- [x] Task 5 — Verify (AC: all)
  - [x] Full server suite green (652 green, +21) + `npm run build` clean (real production build `tsc -b && vite build` + server `tsc` — the `@ts-expect-error` decision-F gates are enforced here, not by vitest/esbuild).
  - [x] Live-data proof (sibling pattern): ran `deriveFacts` against the real DB into a temp derived dir (committed facts untouched). Counts consistent + in the grounded ballpark (drifted one day). Actuals recorded in Dev Agent Record.

### Review Findings

Code review 2026-07-12 (bmad-code-review: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Auditor verdict: **7 ACs pass, 0 fail, 0 partial.**

- [x] [Review][Patch] Within-day value selection is input-order-dependent, and the shuffle-robustness comment overstates the guarantee [server/utils/priceVsOwnMedian.ts:~119-122] — `getValue: (dayItems) => dayItems.at(-1)!` picks the last entry in INPUT order within a day bucket (`walkPresenceAwareSeries` preserves caller order inside a day). Safe on the runner path (SQL ORDER BY), but duplicate option labels inside one observation's options array, or a direct caller with unordered same-day entries, pick an arbitrary price. The shuffled-input test only uses one entry per day, so it can't catch this. Fix: sort same-day entries by `observedAt` before taking the last, correct the comment (also: "last observation of the day" is really "last USABLE observation" — unusable prices are filtered before bucketing), add a multi-observation-same-day test. (blind+edge+auditor)
- [x] [Review][Patch] Integration test races its own `today` against the runner's internal `today` across UTC midnight [server/scripts/deriveFactsRun.test.ts:~369-371] — `today` is captured once but `dayStr()` calls `Date.now()` independently per invocation; a 00:00 UTC crossing mid-test desynchronizes the fixture's "today" row from `deriveFacts`' internal today → spurious failure. Fix: derive all day strings from the single captured `today` anchor. (blind+edge)
- [x] [Review][Patch] Test hygiene in priceVsOwnMedian.test.ts — abandoned drafting comments in the even-median test (~lines 102-104: "Use a 4-day run with floor lowered?…" describes a scenario the test doesn't run) and a duplicated local `round4` mirror (~227-230) that circularly re-implements the module's rounding; assert the literal (0.3333) instead. (blind+auditor)
- [x] [Review][Patch] Document the honesty-envelope unit semantics in the module header [server/utils/priceVsOwnMedian.ts] — (a) `noUsablePrice` counts ENTRIES while the other excluded[] reasons count SERIES, and a series whose every price is unusable never enters `totalSeries` (so `totalSeries = belowFloor + noObsToday + compared` holds by construction, but the asymmetry is undocumented); (b) classification/emit uses the ROUNDED pct, so sub-0.005% movers are counted `atOwnMedian` — an implicit deadband worth one comment line; (c) the `med === 0` guard is unreachable (`usablePrice` requires > 0) — annotate as defensive or remove. Comment-level only; no number changes. (blind)
- [x] [Review][Defer] UTC-day seam: a derive run just after 00:00 UTC (~5pm PDT) would honestly-but-wrongly publish an empty fact — every floor-clearing series becomes `noObservationToday` because no observation carries the new UTC day yet [server/scripts/deriveFactsRun.ts:196] — deferred, pre-existing: this is the known wall-clock caveat deferred from 1.2.5 that this story's spec explicitly says not to fix here; the scheduled ~03:30-local run sits ~10:30 UTC, far from the seam. (edge)

Dismissed as noise/spec-mandated (9): try/catch→fully-gapped→belowFloor is the spec's own Task-2 semantics (and the helper's only throw, start>end, is unreachable with explicit bounds); sold-out dropped uncounted at the runner is the spec's Gate-4 mandate; no SQL upper bound on observedAt (future dates implausible — writes are always `toISOString()` — and the walk's `endDate: today` bounds them anyway); lexicographic timestamp compare (same always-Z reason); `totalProducts = products.length` matches the spec's report shape; ADR-083 hunk is the other workstream in the shared tree; `as unknown as` sqlite cast is sibling convention; ADR-084 date = ratification date; sprint-status.yaml verified updated in the working tree.

## Dev Notes

### Grounding vs live products.db (run 2026-07-11, read-only)

- 6,143 products / 46,275 observations / 18 distinct days, span 2026-06-24 → 2026-07-11. DB at `~\GmaS-data\products.db` (27MB), fed nightly ~03:30 local.
- Distinct-day distribution (30-day window): ≥3 days 77.3%, ≥5 62.4%, **≥7 43.1%**, ≥10 28.4%, ≥14 15.4% of products.
- Option-level series at floor 7: **3,055 series; 2,058 with a latest-day observation → 207 below own median / 1,830 at median / 21 above.** Non-zero `pctVsMedian`: min −33.3%, median −19.1%, max +42.9%. Two conclusions: (a) the fact yields real, honest discount content on day 18 — not vaporware; (b) 89% at-median re-confirms sticky prices (first-look Finding 1) and motivates the movers-only emit rule.
- The ~2-day Dutchie outage (retro action item) is visible in the window: 2026-07-08/09 collapsed to 780 obs/day (Weedmaps-only), recovered 07-10. Gate-3 handling means those are per-series GAPS for Dutchie products — days absent from the median, never fabricated values. No special-casing needed; this is the design working.
- Option labels are fraction-style (`1/8oz`, `1/2oz`, `1oz`) and stable per product across days — verbatim-label series keys hold up live.

### Semantics decisions (bound here so dev doesn't re-derive)

- **Series key = (product_key, option label verbatim), NOT canonical weight.** This fact makes no $/gram and no cross-product claim — it compares one listing's price to ITSELF — so `canonicalWeightGrams` / `WEIGHT_BASED_CATEGORIES` / `EXCLUDED_FLAGS` gating is NOT needed and NOT wanted: pulling in the weight parser would import the exact mg-bogosity hazard (`"100mg"→0.1g`) this fact structurally avoids. Edibles/mg-labeled options are honestly comparable to their own history. (Contrast 2.2, whose AC explicitly requires the weight gates because it IS a cross-store $/gram fact.)
- **Effective price = `specialPrice ?? basePrice`** (Gate-3-of-crossStoreValue precedent, and exactly 2.2's AC formula). Consequence worth stating in the module header: an always-on-special SKU's median already reflects the special, so its "deal" honestly reads ≈ 0% vs own median — that is fix6's entire point, not an error.
- **Reported sold-out excluded** (`quantityAvailable !== null && <= 0`) from both history values and today's comparison — `crossStoreValue.ts` / brandStoreMatrix precedent (an unbuyable price is not a price paid). `null` qty = unknown = kept.
- **`today` param** is injected by the runner (same `new Date().toISOString().slice(0,10)` anchor as every sibling). Known wall-clock caveat (deferred from 1.2.5) applies unchanged: the scheduled ~03:30-local run maps to mid-morning UTC, same UTC day as the scrape — fine in ops; do not "fix" it here.
- **Why a time-range query when the runner already holds the whole ProductsFile in memory:** the AC demands it — this story establishes the bounded-read pattern (first real consumer of the 1.0 indices) that Phase-2 hardening extends, per the known whole-table-SELECT deferral (`deferred-work.md`, products-storage review). Redundancy with the in-memory file today is accepted and temporary. Do NOT refactor other facts onto the new reader in this story.

### Architecture compliance (guardrails)

- **Decision-F projection at the runner boundary** — copy the discipline (and comment style) of the 1.5/1.6 blocks in `deriveFactsRun.ts:236-300`: the pure module's input type is the gate; the runner is the only place the raw pair/potency exist.
- **Write-ordering discipline (1.2.5 review):** new artifact written LAST; never gate pre-existing `atomicWriteJson` calls on the new step.
- **Envelope everything** (`derivedEnvelope.ts`); `excluded[]` restates the pure fn's own counters — never invents numbers.
- **Additive only (NFR5):** new module + reader fn + runner block + ps1 list line. No change to `data.json`, deals pipeline, existing types' behavior, or existing facts' outputs (byte-identical artifacts for the other 8 files given the same DB).
- **Node-only rule:** `productsDb.ts` must never be reachable from a Render request path — the new reader stays inside the runner's import graph only. No `valueRoute.ts` change.
- **TypeScript strict, ESM `.js` import suffixes** (sibling convention throughout `server/utils/`).

### Previous-story intelligence (Epic 1 carry-ins baked into this spec)

- 1.3: defensive try/catch around the walk (all-future/malformed history must not abort the derive run); chronological-order assumption is now dissolved by AC-1's ORDER BY.
- 1.5: floor counts DISTINCT CALENDAR DAYS (the product-days floor earned a deferred-work entry; this story's AC hard-codes the lesson). Compile-level type-gate tests live in `brandPersonas.test.ts` — copy the `@ts-expect-error` pattern.
- 1.2.5: write-ordering; wall-clock `today` caveat (documented, not fixed).
- 1.0/ps1: explicit `$derivedFiles` append (six-facts-stranded incident) — Task 4 is load-bearing, not housekeeping.
- 1.8: no alerting work — the envelope's `generatedAt` makes the existing freshness check cover this artifact automatically.
- Process: PR closeout = push + `gh pr create` + self-merge (pre-authorized for Erik-directed work); verify the squash-merged fileset on origin/master (PR #53 incident); run the REAL `npm run build` before push.

### Project Structure Notes

- New: `server/utils/priceVsOwnMedian.ts`, `server/utils/priceVsOwnMedian.test.ts`, `server/data/derived/price-vs-own-median.json` (generated).
- Modified: `server/utils/productsDb.ts` (+ its test file), `server/scripts/deriveFactsRun.ts`, `scripts/derive-facts-local.ps1`, `ADR.md`.
- Naming mirrors siblings (`specialEvents.ts` / `brandPersonas.ts` / `newArrivalDormancy.ts`; artifacts kebab-case).

### References

- Epics: `_bmad-output/planning-artifacts/epics-derivation-engine.md` §Epic 2 — Story 2.1
- PRD: `prds/prd-Happy-2026-07-06/prd.md` §FR13, §3 Gate 2, §9 open item (window/floor deferred to Epic-2 start — resolved by Task 0 ratification)
- fix6 verdict: `investigations/fix6-basePrice-verdict.md`
- Substrate + indices: `server/utils/productsDb.ts:44-77` (schema/indices), ADR-077
- Gate-3 helper: `server/utils/presenceAwareSeries.ts`
- Sibling patterns: `server/utils/specialEvents.ts`, `server/utils/brandPersonas.ts`, `server/scripts/deriveFactsRun.ts:236-344`
- Runner ops: `scripts/derive-facts-local.ps1:43-59` (`$derivedFiles` lesson)
- Deferred-work carry-ins: `_bmad-output/implementation-artifacts/deferred-work.md` (1.5 floor entry; products-storage whole-table-SELECT entry)

## Questions for Erik (Task 0 — answer before code)

1. `ROLLING_WINDOW_DAYS` = 30? (vs 60 — identical behavior until ~mid-August; 30 proposed)
2. `MIN_OBSERVED_DAYS` = 7 distinct calendar days? (5 = more rows/noisier; 10 = sturdier/thinner)
3. Emit movers only (at-median counted in `excluded[]`, ~230-row artifact) — or emit all compared series (~2,060 rows) so Epic-3 cards can look up "this is its normal price" per SKU?

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Task 0 — Constants ratification (Erik, 2026-07-11)

Erik ratified all proposed defaults verbatim ("ratified, all defaults"):

- `ROLLING_WINDOW_DAYS` = **30**
- `MIN_OBSERVED_DAYS` = **7** (distinct calendar days)
- Emit rule = **movers only** (`pctVsMedian !== 0`; at-median counted in `excluded[]` as `atOwnMedian`)

### Debug Log References

- Live-data proof (2026-07-12, real `~\GmaS-data\products.db`, read into a temp derived dir so committed facts stayed byte-untouched):
  - coverage: `totalProducts 6311, totalSeries 6915, comparedCount 2002, belowMedianCount 255, aboveMedianCount 5`
  - excluded: `belowFloor 3892, noObservationToday 1021, atOwnMedian 1742, noUsablePrice 0`
  - emitted rows: 260 (= 255 below + 5 above; at-median NOT emitted — movers-only rule holds)
  - Internal consistency verified: belowFloor 3892 + noObservationToday 1021 + compared 2002 = 6915 (totalSeries); below 255 + above 5 + at 1742 = 2002 (compared).
  - pct range: min −0.30, max +0.1765; rows sorted deepest-discount-first. Deepest = 2020-solutions Vaporizer cartridges at −30% vs own 12-day median.
  - Drift vs §Grounding (floor 7, one day earlier): 207→255 below, 1830→1742 at, 21→5 above, 2058→2002 compared — within the "drifts with the data day" envelope the spec called out.

### Completion Notes List

- Implemented FR13 / D6 (the fix6 keystone) end-to-end: new bounded SQLite time-range reader (`readWindowedObservations` / `readWindowedObservationsFromDbPath`), pure fact `buildPriceVsOwnMedianReport`, runner wiring writing `price-vs-own-median.json` LAST, `$derivedFiles` append, ADR-084.
- Constants ratified by Erik at dev-start: `ROLLING_WINDOW_DAYS=30`, `MIN_OBSERVED_DAYS=7` (distinct calendar days), emit movers-only.
- Decision F is mechanical: the pure-fn input type carries only an already-reduced `effectivePrice` per option-day — no base/special pair, no discount %, no potency — enforced by `@ts-expect-error` compile gates that fail under `tsc` (the real production build), since vitest/esbuild strip types without checking.
- noUsablePrice accounting lives in the pure fn (the envelope restates it, never invents it); sold-out (`quantityAvailable !== null && <= 0`) is dropped at the runner boundary (Gate 4 sibling precedent) and covered by the runner integration test, because the pure-fn input has no `quantityAvailable` by decision F.
- Additive-only (NFR5): no route, no client, no `data.json`, no change to the other 8 facts' outputs; committed derived files verified untouched after the live run.

### File List

- Added: `server/utils/priceVsOwnMedian.ts`
- Added: `server/utils/priceVsOwnMedian.test.ts`
- Modified: `server/utils/productsDb.ts` (windowed time-range reader + path wrapper)
- Modified: `server/utils/productsDb.test.ts` (4 windowed-reader tests)
- Modified: `server/scripts/deriveFactsRun.ts` (runner wiring, DeriveOutcome fields, console line)
- Modified: `server/scripts/deriveFactsRun.test.ts` (2.1 runner integration test)
- Modified: `scripts/derive-facts-local.ps1` (`$derivedFiles` append — load-bearing)
- Modified: `ADR.md` (ADR-084 + change-log entry)
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` (status → in-progress → review)
- Generated (not committed here; produced by the runner): `server/data/derived/price-vs-own-median.json`

## Change Log

- 2026-07-11: Story created (create-story workflow). Grounded against live products.db (18-day history; 207/1,830/21 below/at/above own median at floor 7). Constants table pending Erik's dev-start ratification.
- 2026-07-11: Task 0 — Erik ratified all defaults (window 30, floor 7 distinct-days, movers-only emit).
- 2026-07-12: Implemented all tasks (bmad-dev-story). New windowed SQLite reader + pure `buildPriceVsOwnMedianReport` + runner wiring + `$derivedFiles` append + ADR-084. 652 server tests green (+21); `npm run build` clean; live-data proof consistent (255 below / 5 above / 1,742 at-median / 260 emitted movers, deepest −30%). Status → review.
- 2026-07-12: Code review (bmad-code-review, 3 layers). Auditor: 7/7 ACs pass. 4 patches applied: same-day time-latest tie-break in `walkSeries` (+ same-day shuffled test), integration-test day strings anchored to captured `today`, test-hygiene cleanup (drafting comments, round4 mirror → literal), envelope-unit/deadband/dead-guard documentation. 1 deferred (UTC-day seam, pre-existing 1.2.5 caveat → deferred-work.md); 9 dismissed. 653 server tests green; `tsc` build clean. Status → done.
