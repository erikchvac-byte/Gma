---
baseline_commit: b688a1b98c54575a0ff8d1e8c8f5fe43f0a19984
---

# Story derivation-2.2: Cheapest-delivered input fact (D7 / FR14)

Status: done

Epic: epic-derivation-2 (Accrual facts) — second story. Source: `_bmad-output/planning-artifacts/epics-derivation-engine.md` (Epic 2 — Story 2.2), PRD `prds/prd-Happy-2026-07-06/prd.md` FR14/Gate 1.

## Story

As a data consumer,
I want a per-match-key fact of effective price (`specialPrice ?? basePrice`) plus store lat/lng,
So that delivered cost composes user-relatively downstream via the existing `roundTripGasCost` — never from a baked-in origin.

The point of this fact is the ADR-057 user-relative rule: **cheapest-*delivered* depends on where the shopper is** (a farther store with a lower shelf price may or may not win once gas is added), so the derivation layer MUST NOT pre-pick a winner or bake in any origin/distance/gas. It emits the *inputs* — every qualifying store's real price + that store's committed coordinates, per like-for-like cell — and the client composes the delivered comparison with the existing `roundTripGasCost` against the user's own location. Epic-3's delivered-value card is the consumer.

## Design decision (bound — do not re-derive)

**This fact is the structural twin of Story 1.4 (`disparityRollups.ts`): a pure function of `(Disparity[], StoreGeoLookup)`.** Both consume the already-computed `report.disparities` (the buildMatchReport oracle) and the already-built `geoLookup`. You are NOT re-grouping products, NOT re-reading the DB, and NOT re-parsing weights.

Why this is the honest AND minimal design:

- **Gate 1, weight gates, sold-out, ≥2-store cells are all INHERITED, not re-implemented.** Every AC gate this story lists (`WEIGHT_BASED_CATEGORIES`, `EXCLUDED_FLAGS`, `canonicalWeightGrams` mg-parse protection, same-product match-key, reported-sold-out drop, ≥2 distinct stores) already ran inside `buildMatchReport` (`crossStoreValue.ts` header gates 1–5) to produce `Disparity[]`. A `Disparity` is BY CONSTRUCTION a same-product, same-canonical-weight, ≥2-store cell whose per-store `price` is the reduced `specialPrice ?? basePrice` with sold-out already excluded. Consuming that output means the gates hold by inheritance.
- **Do NOT import `canonicalWeightGrams` in this module.** This is the exact inverse of 2.1's "don't touch the weight parser" reasoning: 2.1 avoided it because it made no weight claim; 2.2 relies on it but only through the *already-gated* `weightGrams` field on `Disparity`. Re-parsing option labels here would re-introduce the `"100mg"→0.1g` mg-bogosity the upstream gates already screened out (the exact lie Gate 1/5 forbid). `Disparity.weightGrams` is trustworthy precisely because it survived the upstream gate.
- **FR16 type-gate is satisfied structurally by the shared type.** `Disparity` / `DisparityStore` carry NO base/special pair, NO discount %, NO potency — the decision-F narrowing was done once, upstream. Reusing that type IS the decision-F posture; a compile-level `@ts-expect-error` test asserts a potency/discount/pair field is not assignable to `DisparityStore`.

## Acceptance Criteria

(Verbatim from epics doc, with grounded implementation bindings in brackets.)

1. **Given** each match-key cell, **when** the fact computes, **then** it emits effective price = `specialPrice ?? basePrice` and the store's committed lat/lng, **and** NO origin, distance, or gas cost is baked in at derivation time (ADR-057 user-relative rule); composition happens downstream with `roundTripGasCost` (verified reusable). [Each cell emits ALL its qualifying store offers — `{ dispensaryId, price, lat, lng }` — not just the low store, because the delivered winner is user-location-dependent (that is the whole fact). `price` comes verbatim from `DisparityStore.price` (already `specialPrice ?? basePrice`). lat/lng come from `StoreGeoLookup`; a store with no resolvable geo emits `lat:null, lng:null` and is counted in `missingGeoCount` (1.4 precedent). `roundTripGasCost` lives in `client/src/utils/gasCost.ts` — this fact NEVER imports or calls it; "verified reusable" means the downstream composition surface already exists client-side.]
2. **Given** any $/gram dimension, **then** it is gated by `WEIGHT_BASED_CATEGORIES` + `EXCLUDED_FLAGS` (the mg/count parse lesson: `"100mg"→0.1g` must not leak) **and** cells rest on the same-product match-key, ≥2-store cells only (Gate 1). [INHERITED from `buildMatchReport` — see Design decision. `pricePerGram = price / weightGrams` is honest here ONLY because `weightGrams` already passed the upstream category/flag/`canonicalWeightGrams` gates. This module computes no weight and imports no weight parser.]
3. **Given** the input type (FR16 gate), **then** potency fields and the flat banner rate are unreachable. [Structural: the input is the shared `Disparity`/`DisparityStore` type, which has no potency/pair/discount fields. Assert with `@ts-expect-error` compile tests (pattern: `brandStoreMatrix.test.ts:170-178`).]
4. **Given** the fact, **then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests including the mg-parse exclusion case (NFR6). [The mg-parse exclusion is proven at the SEAM: a fixture Edible/mg-labelled record fed to `buildMatchReport` never reaches a `Disparity` (it is `nonComparableCategory`), so it never reaches this fact — assert via the runner integration test (Edible product in → not present in cheapest-delivered out), mirroring how 2.1 proved its sold-out exclusion at the runner boundary. The pure-fn unit tests cover geo attach, null-geo counting, multi-store cells, and the `@ts-expect-error` gate.]

## Tasks / Subtasks

- [x] Task 1 — Pure fact module `server/utils/cheapestDelivered.ts` (AC: 1, 2, 3, 4)
  - [x] Input types: consume the shared `Disparity[]` (from `crossStoreValue.ts` / `types/index.ts`) and `StoreGeoLookup` (from `disparityRollups.ts`) — do NOT define a bespoke narrowed input; `Disparity` is already the decision-F-narrowed honest type. Import `type { Disparity } from '../types/index.js'` and `type StoreGeoLookup` (re-export from `disparityRollups.js` if not already exported, or import from there). [`StoreGeoLookup` already exported at disparityRollups.ts:47 — plain `import type` used, no change to that module.]
  - [x] Export `buildCheapestDeliveredReport(disparities: Disparity[], geoLookup: StoreGeoLookup): CheapestDeliveredReport`.
  - [x] Per `Disparity`, emit ONE delivered cell `{ matchKey, displayName, category, weightGrams, storeOffers: DeliveredStoreOffer[] }` where each offer = `{ dispensaryId, price, pricePerGram, lat, lng }`. `price` = `DisparityStore.price` verbatim; `pricePerGram` = `r4(price / weightGrams)`; `lat`/`lng` from `geoLookup.get(dispensaryId)` (`null` when absent or mapped to `null`).
  - [x] Count every store-offer whose geo did not resolve in `missingGeoCount` (mirror 1.4 — never omit the offer, never default coords to 0,0; still emitted with null coords). A cell whose stores ALL lack geo is still emitted.
  - [x] Report shape (mirror siblings): `{ cells, totalCells, totalStoreOffers, offersWithGeo, missingGeoCount }`. Stable sort: cells by `matchKey` then `weightGrams`; `storeOffers` by `price` asc then `dispensaryId` (convenience only, NOT a delivered-winner claim — noted in header).
  - [x] Local `r4` rounding helper for `pricePerGram` (4dp); `price` passed through unchanged (reconciles byte-for-byte with `disparities.json`).
  - [x] Module header (sibling style): pure consumer of oracle + geo (FR14), emits INPUTS not a baked-in origin (ADR-057), gates inherited from `buildMatchReport`, `pricePerGram` honest via upstream-gated `weightGrams`.
  - [x] Tests (strict-typed, NFR6) in `cheapestDelivered.test.ts`: geo attach; null-geo (absent + null-mapped) + `missingGeoCount`; all-stores-null cell still emitted; multi-store all-offers sorted by price then dispensaryId; `pricePerGram` 4dp with `price` unrounded; cell sort by matchKey/weightGrams; empty input; `@ts-expect-error` gates (`thc`/`discountPct`/base+special pair not assignable). 8 tests green.
- [x] Task 2 — Runner wiring in `server/scripts/deriveFactsRun.ts` (AC: 1, 2, 4)
  - [x] Reuse the EXISTING in-scope `report.disparities` + `geoLookup` (built for 1.4) — `buildCheapestDeliveredReport(report.disparities, geoLookup)`. Zero new DB access.
  - [x] Wrapped in `wrapEnvelope` (`excluded` = `[{missingGeo}]`, `coverage` = `{totalCells,totalStoreOffers,offersWithGeo}`); written via `atomicWriteJson` LAST, after the price-vs-own-median write.
  - [x] Added `cheapestDeliveredPath` + `deliveredCellCount`/`deliveredStoreOfferCount`/`deliveredMissingGeoCount` to `DeriveOutcome` + `main()` console line.
  - [x] Extended `deriveFactsRun.test.ts`: new artifact written + envelope-shaped (2-store cell, both offers, missingGeo 2); mg-parse exclusion proof (Edible → 0 cells at the seam).
- [x] Task 3 — Commit-list + docs (AC: 4; load-bearing ops lesson)
  - [x] **Appended `'server/data/derived/cheapest-delivered.json'` to `$derivedFiles` in `scripts/derive-facts-local.ps1`** (load-bearing — six-facts-stranded lesson).
  - [x] NO new route, NO client change, NO `data.json` change. 1.8 freshness covers it via the envelope's `generatedAt` — zero alerting work.
  - [x] ADR-085 added (Accepted, 2026-07-12), cross-ref ADR-057/ADR-084/ADR-077; change-log row added.
- [x] Task 4 — Verify (AC: all)
  - [x] Full server suite green (661 tests, +8 vs 2.1's 653) + `npm run build` clean (server `tsc` — the `@ts-expect-error` decision-F gates are enforced here — + client `vite build`).
  - [x] Live-data proof: the local `~/GmaS-data/products.db` is currently EMPTY (0 rows; scrape feeders haven't repopulated since a reset — 29MB file, unrelated to this story), so the faithful proof per Dev Notes is the pure fn over the **committed** `disparities.json` + real `geoLookup` (data.json + WEEDMAPS_STORES). Result matches grounding EXACTLY: **305 cells / 684 store-offers / 22 distinct stores / offersWithGeo 684 / missingGeoCount 0**; `price` reconciles byte-for-byte with `disparities.json` (MATCH); `pricePerGram` correct (28/3.5=$8, 40/3.5=$11.4286). Committed derived artifacts left byte-identical (only wrote to temp dirs; `git status server/data/derived/` clean).

### Review Findings

(bmad-code-review 2026-07-12 — 3 layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. All 4 ACs PASS per auditor; 8 findings dismissed as verified-handled/convention.)

- [x] [Review][Decision] `$derivedFiles` version-skew window — while the main checkout sits on this branch, the hourly publish task runs the branch ps1 (which lists `cheapest-delivered.json`) against a worktree reset to origin/master (whose runner doesn't write it); `git add` on the missing pathspec exits 128 and the whole publish run fails until merge. RESOLVED (Erik, 2026-07-12): no code change — the loud hard-fail on a missing listed artifact is the desired post-merge guard; merge promptly to close the window. [scripts/derive-facts-local.ps1:60 vs :134]
- [x] [Review][Patch] `canonicalWeightGrams` fallback can round a sub-5mg plain-unit label (e.g. "4mg" → 0.004g) to exactly 0 instead of null; a 0-weight Disparity would make `pricePerGram` = Infinity → JSON `null` in the published artifact. FIXED: fallback returns null when the 2dp rounding lands on 0, + "4mg" → null test. [server/utils/productMatchKey.ts:86]
- [x] [Review][Patch] Price pass-through test asserts a rounding fixed point (`price: 10`) — the assertion cannot detect accidental rounding. FIXED: fixture price 10.00005 (not a fixed point of r2/r4). [server/utils/cheapestDelivered.test.ts:98]
- [x] [Review][Patch] `outcome.deliveredMissingGeoCount` (feeds the console line) is never asserted in the integration test. FIXED: asserted `toBe(2)`. [server/scripts/deriveFactsRun.test.ts]

## Dev Notes

### Grounding vs the live committed artifacts (read 2026-07-12, the exact upstream 2.2 consumes)

2.2 consumes `report.disparities` — the identical object story 1.4 consumes — so its grounding is the committed `disparities.json` + `disparity-rollups.json`, read directly (no DB run needed):

- **`disparities.json`** (generatedAt 2026-07-12T11:00:03Z): **305 disparity cells**; `coverage` = `{ totalRecords:6311, placedRecords:4920, disparityCount:305 }`; `excluded` = `[nonComparableCategory:718, excludedFlag:672, unmatched:1]`. Across the 305 cells: **684 store-offers**, **22 distinct stores**, categories **Flower 138 / Vaporizers 111 / Concentrate 38 / Pre-Rolls 18** — all four are `WEIGHT_BASED_CATEGORIES`; zero Edible cells (Gate 5 working upstream, the mg-parse hazard is already screened out before 2.2 ever sees the data).
- **`disparity-rollups.json`**: `byStore` = 22 stores, **all 22 with resolvable geo** (`missingGeo:0`). So 2.2's live output will carry near-complete coordinates; `missingGeoCount` should be ~0 today (the 1.4 merge of data.json + WEEDMAPS_STORES already covers the 7 Weedmaps-only private-registry stores).
- **Expected 2.2 live output:** ~305 delivered cells / ~684 store-offers, each offer carrying `price`, `pricePerGram`, and (almost always) `lat`/`lng`; `missingGeoCount ≈ 0`. This is real content on day 18, not vaporware.

### Semantics decisions (bound here so dev doesn't re-derive)

- **Emit ALL store offers per cell, not just the cheapest.** The delivered winner is user-location-dependent (ADR-057) — a farther store at a lower shelf price can lose after round-trip gas — so pre-picking a "cheapest" store here would defeat the fact's entire purpose. The `storeOffers` array is sorted cheapest-shelf-first purely for deterministic diffs; that ordering carries NO delivered-winner claim.
- **`price` is passed through from `Disparity`, unrounded.** It is already the reduced `specialPrice ?? basePrice` (Gate 3, sold-out already excluded upstream). Do not re-reduce, re-round, or re-derive it — that keeps 2.2's numbers reconciling exactly against `disparities.json`.
- **`pricePerGram` is the only $/gram this fact computes**, and it is honest solely because `weightGrams` is the upstream canonical weight that already survived `WEIGHT_BASED_CATEGORIES` + `EXCLUDED_FLAGS` + `canonicalWeightGrams`. Do NOT import `canonicalWeightGrams` or re-parse option labels here (contrast 2.1, which avoided the parser for the opposite reason). If in doubt whether to emit `pricePerGram` at all: emit it — it is free, honest, and Epic-3's "$/g delivered" card will want it; it is a reversible additive field.
- **No `today`, no time-series, no 1.2 helper.** This is a cross-sectional point-in-time fact over the latest-observation disparities (exactly like 1.4/1.6). No gap logic, no windowed read, no DB access beyond what the runner already did for the disparity oracle.
- **Geo comes only from `StoreGeoLookup`** (the 1.4 merge of data.json dispensaries + `WEEDMAPS_STORES`). Never a second geo source, never a default of 0,0; an unresolved store emits null coords and is counted (`missingGeoCount`), mirroring 1.4.

### Architecture compliance (guardrails)

- **Pure consumer of the oracle (FR14 "not new derivation"):** the module takes `Disparity[]` + `StoreGeoLookup` and does grouping/attachment only — no product grouping, no match-key derivation, no weight parsing, no price reduction. All of that already happened in `buildMatchReport`.
- **Reuse, don't recompute, in the runner:** `report.disparities` and `geoLookup` are already in scope at the wiring point — pass them straight in (this is even lighter than 1.4, which at least builds a fresh aggregate; 2.2 just attaches geo and reshapes).
- **Write-ordering discipline (1.2.5 review):** new artifact written LAST, after the price-vs-own-median write; never gate a pre-existing `atomicWriteJson` on the new step.
- **Envelope everything** (`derivedEnvelope.ts`, `wrapEnvelope(data, excluded, coverage)`); `excluded[]`/`coverage` restate the pure fn's own counters — never invent numbers.
- **Additive only (NFR5):** new module + test + runner block + ps1 list line + ADR entry. No change to `data.json`, deals pipeline, existing types' behavior, or existing facts' outputs (the other 9 artifacts stay byte-identical given the same DB).
- **Node-only boundary:** `cheapestDelivered.ts` is a pure util with no I/O and no DB import — safe. It must not be pulled into a Render request path; the artifact is served as a committed file only, no `valueRoute.ts` change.
- **TypeScript strict, ESM `.js` import suffixes** (sibling convention throughout `server/utils/`).

### Previous-story intelligence (carry-ins)

- **1.4 (`disparityRollups.ts`) is the primary template** — same `(Disparity[], StoreGeoLookup)` signature, same `buildStoreGeoLookup` source, same `missingGeoCount` null-geo discipline, same "pre-built lookup passed in, not imported" testability pattern. Read it first; 2.2 is its sibling.
- **2.1 (`priceVsOwnMedian.ts`):** decision-F projection discipline, write-LAST ordering, `$derivedFiles` append as load-bearing, live-proof-into-temp-dir verification, the `@ts-expect-error` compile-gate pattern. Note the CONTRAST: 2.1 deliberately did NOT use the weight gates (self-comparison, no $/gram); 2.2 DOES rely on them but inherits them from the oracle rather than re-running them.
- **1.6 (`brandStoreMatrix.ts`):** the "cheapest is a Gate-1 same-product+same-weight claim, grouping alone never crowns a winner" reasoning and the `@ts-expect-error` test layout (`brandStoreMatrix.test.ts:170-178`).
- **1.2.5:** write-ordering (new fallible write goes last).
- **1.0/ps1:** explicit `$derivedFiles` append (six-facts-stranded incident) — Task 3 is load-bearing.
- **1.8:** no alerting work — the envelope's `generatedAt` makes the existing freshness check cover this artifact automatically.
- **Process:** PR closeout = push + `gh pr create` + self-merge (pre-authorized for Erik-directed work); verify the squash-merged fileset on origin/master (PR #53 incident); run the REAL `npm run build` before push.

### Project Structure Notes

- New: `server/utils/cheapestDelivered.ts`, `server/utils/cheapestDelivered.test.ts`, `server/data/derived/cheapest-delivered.json` (generated).
- Modified: `server/scripts/deriveFactsRun.ts` (runner wiring, `DeriveOutcome` fields, console line), `server/scripts/deriveFactsRun.test.ts` (integration + mg-parse-exclusion assertion), `scripts/derive-facts-local.ps1` (`$derivedFiles` append — load-bearing), `ADR.md` (ADR-085 + change-log). Possibly `server/utils/disparityRollups.ts` (export `StoreGeoLookup` if it isn't already importable — it is exported at line 47, so a plain `import type` suffices; no change needed).
- Naming mirrors siblings (`disparityRollups.ts` / `brandStoreMatrix.ts`; artifact kebab-case `cheapest-delivered.json`).

### References

- Epics: `_bmad-output/planning-artifacts/epics-derivation-engine.md` §Epic 2 — Story 2.2
- PRD: `prds/prd-Happy-2026-07-06/prd.md` §FR14, §3 Gate 1
- ADR-057 (user-relative distance, no baked-in origin): `ADR.md`
- Primary sibling (same signature): `server/utils/disparityRollups.ts` + `disparityRollups.test.ts`
- Disparity oracle + inherited gates: `server/utils/crossStoreValue.ts` (gates 1–5 in header), `Disparity`/`DisparityStore` in `server/types/index.ts:150-174`
- Geo merge: `buildStoreGeoLookup` in `disparityRollups.ts:59-75`; `WEEDMAPS_STORES` in `server/scrapers/weedmaps-stores.ts`
- Downstream composition surface (NOT called here): `roundTripGasCost` in `client/src/utils/gasCost.ts`
- Envelope: `server/utils/derivedEnvelope.ts`
- `@ts-expect-error` gate pattern: `server/utils/brandStoreMatrix.test.ts:170-178`
- Runner wiring precedent (reuse `report.disparities` + `geoLookup`): `server/scripts/deriveFactsRun.ts:232-249` (1.4 block)
- Runner ops: `scripts/derive-facts-local.ps1:43-60` (`$derivedFiles` lesson)

## Questions for Erik

None blocking. There is no dev-start constants ratification for this story (unlike 2.1 — no window/floor here). One low-stakes, reversible call already bound in the spec: emit a convenience `pricePerGram` per offer (default: yes — honest, free, Epic-3 will want it). Flag it in the PR if you'd prefer price-only.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References

- Live-data proof surfaced that `~/GmaS-data/products.db` is currently EMPTY (schema present — product/observation/meta tables — but 0 rows; 29MB file is SQLite not shrinking post-reset). This is a pre-existing environment condition (scrape feeders haven't repopulated), NOT caused by this story. Pivoted to the Dev-Notes-prescribed proof: pure fn over the committed `disparities.json` + real `geoLookup`. Flagged for Erik below.
- A stray empty SQLite file (`server/UserserikcGmaS-dataproducts.db`) was accidentally created by an ad-hoc probe script (node:sqlite path-mangling) and removed; not part of the change.

### Completion Notes List

- Implemented `buildCheapestDeliveredReport` as the structural twin of 1.4 (`disparityRollups.ts`): a pure fn of `(Disparity[], StoreGeoLookup)`, reusing the runner's already-computed disparity oracle + geo lookup. Zero new DB access, zero weight re-parse, zero price re-reduction — all honesty gates inherited from `buildMatchReport`.
- Emits EVERY qualifying store's offer per like-for-like cell (never a pre-picked winner — the delivered winner is user-location-dependent, ADR-057). `price` passed through verbatim; convenience `pricePerGram` at 4dp honest via the upstream-gated `weightGrams`; lat/lng from the geo lookup with null-geo counted in `missingGeoCount` (1.4 discipline). No origin/distance/gas baked in.
- FR16 type-gate satisfied structurally by reusing `Disparity`/`DisparityStore` (no pair/discount/potency) — enforced by `@ts-expect-error` compile tests under real `tsc`.
- Runner writes `cheapest-delivered.json` LAST (1.2.5 write-ordering); appended to `$derivedFiles` (load-bearing); ADR-085 recorded.
- Verification: 661 server tests green (+8 new pure-fn; 2 integration assertions extended existing tests), `npm run build` clean, live proof over committed artifacts matches grounding exactly (305/684/22, missingGeo 0, prices reconcile byte-for-byte).
- ⚠️ **For Erik:** the home `products.db` is empty right now — the next scheduled `derive-facts-local.ps1` run will write an empty `cheapest-delivered.json` and, because `previousTotalRecords>0 && report.totalRecords===0`, the runner's guard will actually THROW and refuse to overwrite (protecting the committed 305-cell facts). So no bad data ships. But fresh derivation is paused until the scrape feeders repopulate the DB. Worth a look (separate from this story).
- One reversible call already bound by the spec: emitted the convenience `pricePerGram` per offer (honest, free, Epic-3 "$/g delivered" will want it). Flag in PR if price-only preferred.

### File List

- `server/utils/cheapestDelivered.ts` (new — pure fact module)
- `server/utils/cheapestDelivered.test.ts` (new — 8 pure-fn tests incl. compile gates)
- `server/scripts/deriveFactsRun.ts` (modified — import, path, compute/write block, `DeriveOutcome` fields, `main()` console line)
- `server/scripts/deriveFactsRun.test.ts` (modified — new-artifact integration assertions + mg-parse exclusion proof)
- `scripts/derive-facts-local.ps1` (modified — `$derivedFiles` append, load-bearing)
- `ADR.md` (modified — ADR-085 + change-log row)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status tracking)

## Change Log

- 2026-07-12: Code review (bmad-code-review, 3 adversarial layers). All 4 ACs PASS; 1 decision resolved (ps1 skew window → no change, merge promptly), 3 patches applied (canonicalWeightGrams 0→null guard + test, non-fixed-point pass-through fixture, deliveredMissingGeoCount assertion), 8 findings dismissed as verified-handled/convention. 662 server tests green, production build clean. Status → done.
- 2026-07-12: Implemented (bmad-dev-story). New pure `cheapestDelivered.ts` (twin of 1.4), runner wiring writing `cheapest-delivered.json` LAST, `$derivedFiles` append, ADR-085. 661 server tests green, build clean, live proof over committed disparities matches grounding (305 cells / 684 offers / 22 stores / missingGeo 0, prices reconcile byte-for-byte). Status → review. Note: home products.db is currently empty (pre-existing env condition, flagged in Completion Notes).
- 2026-07-12: Story created (create-story workflow). Grounded against the live committed `disparities.json`/`disparity-rollups.json` (305 cells / 684 store-offers / 22 stores, all geo-resolved, missingGeo 0). Bound as the structural twin of 1.4: pure fn of `(Disparity[], StoreGeoLookup)`, all honesty gates inherited from the disparity oracle, emits per-cell store offers + committed geo for downstream user-relative delivered-cost composition (never a baked-in origin, ADR-057). No dev-start ratification gate.
