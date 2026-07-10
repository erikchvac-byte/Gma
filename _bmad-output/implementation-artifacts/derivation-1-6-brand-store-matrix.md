---
baseline_commit: d8c30355f5a27580b565fcc32b4ff3cfba392c8b
---

# Story derivation-1.6: Brand→store matrix (D5)

Status: done

## Story

As a **data consumer**,
I want a matrix of which stores carry each brand, at what weight tiers, and — only where a like-for-like same-product comparison exists — which store is cheapest,
so that brand availability and honest price positioning across stores is a queryable relational fact (FR12, D5), built purely by grouping fields already present on every record and reusing the shared brand-key normalizer from 1.5.

## Grounding (read before starting — real `products.db` state, story-creation time 2026-07-10)

Queried the live committed `server/data/products.db` directly (same discipline as 1.2.5 / 1.3 / 1.4 / 1.5) rather than trusting the epics doc's prose. **The single most important thing in this story is the "cheapest" honesty split in point 3 — read it before writing any code.**

1. **Live corpus: 5,219 products, 516 raw brand strings → 505 normalized brands, 826 (16%) null-brand.** These match 1.5 exactly (same DB, same day) because both facts read the same `products.db` and use the same `normalizeBrandKey`. Don't hardcode the day count or these totals in unit tests — the DB accrues daily; use small hand-built fixtures and treat these as the live-proof sanity target only.

2. **Availability is dense; a real cross-store "cheapest" is sparse.** Live grouping by `normalizeBrandKey`:
   - **225 brands are carried at ≥2 stores; 280 are single-store.** Store-count distribution (stores → #brands): `1→280, 2→106, 3→39, 4→33, 5→16, 6→9, 7→10, 8→2, 9→3, 10→4, 12→1, 13→1, 14→1`.
   - Top brands by store footprint: `wyld` (14 stores, 7 weight tiers), `phat panda` (13 / 8), `full spec` (12 / 3), `ooowee` (10 / 7), `micro bar` (10 / 1), `journeyman` (10 / 5), `hot sugar` (10 / 5), `torus` (9 / 4), `plaid jacket` (9 / 3), `fire bros` (raw "Fire Bros.", 9 / 6).
   - **Like-for-like cells (brandKey × product-identity match-key × canonical weight): 4,438 total, but only 201 have ≥2 distinct stores** — i.e. only 201 cells support an honest cross-store cheapest winner. The other 4,237 are single-store (one store carries that exact product+weight), where **no cross-store cheapest claim can honestly be made.**

3. **THE "CHEAPEST" HONESTY SPLIT (Gate 1 / match-key precision) — binding.** The epics FR12 line says "who carries brand X, at what tiers, **cheapest**." A naive "cheapest store for brand X" is a lie: it would compare a store's $8 brand-X pre-roll against another store's $45 brand-X eighth and crown a "winner" across *different products*. The epics AC states it exactly: *"'cheapest' per cell rests on the same-product join key where a $/gram claim is made (Gate 1, match-key precision); grouping by brand alone never asserts a cross-product price winner."* So the fact has **two honesty tiers**, and the dev must keep them separate:
   - **Availability facet (pure grouping, no price claim):** brand → the set of stores carrying it, and the set of weight tiers it is offered at. This needs no join precision — "does store S stock brand B" is true regardless of which product. All matched *and* unmatched products count here.
   - **Cheapest facet (like-for-like only, Gate 1):** a cheapest winner is emitted **only** for a `(brandKey, product-identity match-key, canonical weight)` cell carried by **≥2 distinct stores** — the exact join the disparity engine (`crossStoreValue.ts`) already uses. Products with no usable match-key are **excluded from the cheapest facet and counted** (`unmatchedProductCount`); they still appear in availability. Single-store cells emit no winner. **Never assert a cheapest store from brand grouping alone.**

4. **Decision F still applies, but narrower than 1.5.** The epics AC for 1.6 says only *"the flat banner **rate** and potency fields are unreachable (decision F, Gates 2/5)."* It does **not** say all prices are unreachable — unlike 1.5 (a discount-*behavior* fact, where any price was hidden). 1.6 legitimately needs the **real price paid** to compute "cheapest." The honest price is the disparity engine's Gate 3 value: **a single reduced `specialPrice ?? basePrice`** — never the `basePrice`/`specialPrice` *pair* (from which a discount rate could be computed) and never potency (`thc`/`cbd`/`totalTerpenes`). So the narrowed input exposes **one `price: number` per option** (already reduced at the boundary), plus `weightGrams` and the product's `matchKey` — and the `@ts-expect-error` test proves `basePrice`/`specialPrice`/`thc`/`totalTerpenes` are unreachable. A discount *rate* needs the pair; with one collapsed price present, the rate literally does not compile (decision F holds).

5. **This is a CROSS-SECTIONAL snapshot, NOT a time series.** Unlike 1.2.5 / 1.3 / 1.5 (which walk history via the 1.2 helper), the matrix reads only the **latest observation** per product (`history.at(-1)`), exactly like `crossStoreValue.ts`. There is **no `walkPresenceAwareSeries`, no gap logic, no `today` parameter.** "At what tiers / cheapest" is a point-in-time question. Do not import the 1.2 helper here.

6. **Reuse the keystone identity functions — this IS their intended consumer.** `productMatchKey.ts`'s own header names "the cheapest-delivered index / **brand matrix** / AI-search surfacing" as what `deriveMatchKey` + `canonicalWeightGrams` compose into. The cheapest facet reuses **both unchanged** — no new weight parsing, no new identity logic ("requiring no new derivation," epics AC). Do **not** reverse-parse brand out of the disparity `matchKey` (`disparityRollups.ts` explicitly refused that — it leans on an internal key format never meant as a parse contract). Compute cells directly from records with the shared functions.

7. **Non-weight categories (Edible) naturally fall out of tiers/cheapest, honestly.** `canonicalWeightGrams` returns `null` for mg-labelled options, so an Edible option contributes no weight tier and no cheapest cell — the same honesty `crossStoreValue.ts` Gate 5 enforces, achieved here for free (no special-case code). An edible-only brand shows `storesCarrying` (it IS stocked) with empty `tiers` and no `cheapestCells` — honest: no weight-based claim is possible. `$/mg` is future derivation work, not this story.

8. **No route (mirrors 1.5 / 1.2.5 / 1.3).** FR12's story text calls this "a queryable fact (and a feed for personas)" — it does **not** use FR11's "served **consumer surface**" phrase that earned 1.4 its route. Precedent: brand-personas (1.5), extraction-health (1.2.5) and special-events (1.3) are internal-only derived artifacts with **no `/api/value/*` route**. So this story writes `server/data/derived/brand-store-matrix.json` (envelope-wrapped) and wires it into the runner, but adds **no route** to `valueRoute.ts` / `server/index.ts`. Flagged to Erik in the closing questions (a served surface, if ever wanted, is a separate story exactly as 1.4 was for FR11).

## Acceptance Criteria

1. **Shared brand normalizer reused unchanged (decision B).** `buildBrandStoreMatrix` groups brands via `normalizeBrandKey` imported from the existing `server/utils/brandKey.js` — **do not** inline or reimplement brand normalization (it is owned once, per 1.5). Null-key products (null/empty/punctuation-only brand) are excluded and counted in `nullBrandProductCount` (FR7), never bucketed under a fabricated `""` brand. Live effect: 826 null-brand products excluded, 505 normalized brands.

2. **Narrowed cross-sectional input type — decision F, Gates 2/5 (the rate/potency breach does not compile).** The pure function takes a **deliberately narrowed** input that exposes brand identity, store, the product's identity match-key, and per-option `{ weightGrams, price }` where `price` is the single already-reduced real price paid — NOT the `basePrice`/`specialPrice` pair (a discount *rate*, Gate 2/fix6) and NOT potency (`thc`/`cbd`/`totalTerpenes`, Gate 5). Define in `server/utils/brandStoreMatrix.ts`:
   ```ts
   export interface BrandStoreOption { weightGrams: number; price: number }
   export interface BrandStoreProduct {
     brand: string | null
     dispensaryId: string
     matchKey: string | null   // deriveMatchKey key, or null when the product carries no usable identity signal
     name: string              // a real product label, for cell displayName (descriptive, not a price)
     options: BrandStoreOption[]
   }
   ```
   The signature is `buildBrandStoreMatrix(products: BrandStoreProduct[]): BrandStoreMatrixReport`. It does NOT accept `ProductsFile`/`ProductRecord` (which carry the price pair + potency). A **compile-level negative test** (`brandStoreMatrix.test.ts`, `// @ts-expect-error`) asserts `basePrice`/`specialPrice` are unreachable on `BrandStoreOption` and `thc`/`totalTerpenes` are unreachable on `BrandStoreProduct` — proving the fix6-rate/potency breach does not compile (NFR6, decision F).

3. **Availability facet — pure grouping (Grounding §3).** For each normalized brand, aggregate across all its products (matched and unmatched alike): `storesCarrying` = the sorted distinct `dispensaryId` set; `tiers` = the sorted distinct `weightGrams` set across all options (naturally weight-only — Edible mg options contribute none, Grounding §7); `productCount`. This facet makes **no price claim** and needs no match-key. Live: 225 brands span ≥2 stores.

4. **Cheapest facet — like-for-like only, Gate 1 match-key precision (Grounding §3).** Within each brand, group option offers by `(matchKey, weightGrams)` into cells; per cell reduce to the cheapest `price` per distinct store. Emit a `CheapestCell` **only** for a cell carried by **≥2 distinct stores**, reporting `lowPrice`, the tied `cheapestStores` (dispensaryIds at `lowPrice`), and `storesCarrying` (distinct store count in the cell). A product whose `matchKey` is `null` contributes to availability (AC3) but is **excluded from all cells and counted** in `unmatchedProductCount` (FR7). A single-store cell emits **no** winner. Grouping by brand alone never crowns a cross-product winner. Live: 4,438 cells, 201 with ≥2 stores.

5. **Honest naming — availability vs. like-for-like, no discount magnitude anywhere.** `lowPrice`/`price` are the real absolute price paid (the disparity Gate 3 value), never a discount %/rate/depth. There is NO `discountPct`/`basePrice`/`specialPrice`/`avgDiscount`/potency field anywhere in the output — decision F's input type makes that structurally impossible. A module header comment states plainly: availability is pure grouping (no price claim); "cheapest" is a same-product+same-weight like-for-like fact only (Gate 1); brand grouping alone never asserts a price winner; honest discount *magnitude* (price vs the product's own rolling median) is Epic 2 / D6 / FR13, not here.

6. **Report shape + honesty envelope (FR7, NFR6).** `buildBrandStoreMatrix` returns:
   ```ts
   export interface CheapestCell {
     matchKey: string
     displayName: string       // a real product name from the cell (NOT the match-key, never fabricated)
     weightGrams: number
     lowPrice: number
     cheapestStores: string[]  // dispensaryIds tied at lowPrice (sorted)
     storesCarrying: number    // distinct stores in the cell (>= 2)
   }
   export interface BrandStoreRow {
     brandKey: string          // normalized key (normalizeBrandKey)
     displayBrand: string      // a real raw brand label from the group (NOT the key, never fabricated)
     productCount: number
     storesCarrying: string[]  // sorted distinct dispensaryIds
     tiers: number[]           // sorted distinct canonical weights offered
     cheapestCells: CheapestCell[]  // like-for-like >= 2-store cells (Gate 1); [] when none
   }
   export interface BrandStoreMatrixReport {
     brands: BrandStoreRow[]           // sorted by brandKey ascending
     totalBrands: number               // normalized non-null brands
     multiStoreBrandCount: number      // brands carried at >= 2 stores
     cheapestCellCount: number         // total >= 2-store cheapest cells across all brands
     nullBrandProductCount: number     // products excluded for null/empty brand (counted, FR7)
     unmatchedProductCount: number     // products with null match-key, excluded from cheapest (counted, FR7)
   }
   ```
   `displayBrand` is a representative *raw* label observed in the group (e.g. the raw brand carried by the most products, `.trim()`-ed — the live `"Hustler's Ambition "` trailing-space case must not surface a ragged label), never the lowercased key and never invented — mirror `brandPersonas.pickDisplayBrand`. `cheapestCells` sorted deterministically (by `weightGrams` then `matchKey`). In `deriveFactsRun.ts` the report is wrapped via `wrapEnvelope`: `excluded[]` = `[{ reason: 'nullBrand', count: nullBrandProductCount }, { reason: 'unmatchedProduct', count: unmatchedProductCount }]`; `coverage` = `{ totalBrands, multiStoreBrandCount, cheapestCellCount }`.

7. **Wired into the runner (FR1, write-ordering discipline).** In `deriveFactsRun.ts`, **after** the existing `brand-personas.json` write (the current last write — **append after it, never insert earlier**, preserving the ordering discipline from 1.2.5's review: a new fallible step ahead of existing writes can silently drop them on a throw), project the already-read `productsFile` into `BrandStoreProduct[]` at the call boundary. **The projection is the ONLY place prices/potency are dropped and the reductions happen:** for each record compute `deriveMatchKey(rec)` → `matchKey` (its `.key`, or `null` when `unmatched`), take `rec.history.at(-1)` and for each option compute `canonicalWeightGrams(opt.option)` (skip `null`), drop reported sold-out (`quantityAvailable !== null && <= 0`, matching `crossStoreValue.ts` Gate 4), reduce `price = opt.specialPrice ?? opt.basePrice` (skip non-finite/`<= 0`), yielding `{ weightGrams, price }`. Call `buildBrandStoreMatrix(...)`, `wrapEnvelope`, write `brand-store-matrix.json` via the same `atomicWriteJson` pattern as the six existing writes. Reuse the already-read `productsFile` — do **not** re-read the DB. Extend `DeriveOutcome` (`brandStoreMatrixPath`, `matrixTotalBrands`, `multiStoreBrandCount`, `cheapestCellCount`, `matrixNullBrandProductCount`, `unmatchedProductCount` — new names to avoid collision with 1.5's `nullBrandProductCount`) and add a matching `main()` `console.log` line.

8. **No route (see Grounding §8).** Internal-only derived artifact, mirroring brand-personas / extraction-health / special-events. Do **NOT** add a route to `valueRoute.ts` / `server/index.ts`, and do not add an `EMPTY_*_ENVELOPE` constant.

9. **Regression-safe (FR3, NFR5).** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, `buildExtractionHealthReport`, `buildSpecialEventsReport`, `buildDisparityRollups`, `buildBrandPersonas`, every existing derived artifact's shape/content, and every existing type are unchanged — this story only *reads* `productsFile` and adds one new `server/utils/brandStoreMatrix.ts` (+ test) plus runner wiring. `brandKey.ts`, `productMatchKey.ts` (`deriveMatchKey`/`canonicalWeightGrams`), `derivedEnvelope.ts`, `atomicWrite.ts` are reused **unchanged**. Full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Pure matrix fact** (AC: 1, 2, 3, 4, 5, 6)
  - [x] New `server/utils/brandStoreMatrix.ts` — narrowed input types (`BrandStoreOption`, `BrandStoreProduct`), report types (`CheapestCell`, `BrandStoreRow`, `BrandStoreMatrixReport`), `buildBrandStoreMatrix(products: BrandStoreProduct[]): BrandStoreMatrixReport`. Imports `normalizeBrandKey` from `./brandKey.js` only (no price/potency/domain-record import; no 1.2 helper — cross-sectional).
  - [x] Availability roll-up: per normalized brand, distinct `storesCarrying` (sorted), distinct `tiers` (sorted), `productCount`; null-key → `nullBrandProductCount`.
  - [x] Cheapest roll-up: per brand, cells keyed `(matchKey, weightGrams)`, per-store cheapest, emit `CheapestCell` only at ≥2 distinct stores (tied `cheapestStores`); null-matchKey products counted in `unmatchedProductCount`, excluded from cells; `displayName` a real product name, `displayBrand` a trimmed real raw label (mirror `pickDisplayBrand`).
  - [x] Deterministic sorts: `brands` by `brandKey`; each `cheapestCells` by `weightGrams` then `matchKey`; `storesCarrying`/`tiers`/`cheapestStores` sorted.
  - [x] Module header comment: availability-vs-like-for-like honesty split (Gate 1), no discount magnitude, magnitude deferred to Epic 2 / D6 / FR13 (AC5).
- [x] **Unit tests** `server/utils/brandStoreMatrix.test.ts` (AC: 2, 3, 4, 5, 6)
  - [x] Compile-level `// @ts-expect-error` negative test: `basePrice`/`specialPrice` unreachable on `BrandStoreOption`, `thc`/`totalTerpenes` unreachable on `BrandStoreProduct` (decision F).
  - [x] Availability: two raw spellings normalizing to one key roll up into ONE brand row with the union of stores/tiers; `displayBrand` a real raw label.
  - [x] Cheapest: a `(matchKey, weight)` cell at 2 stores emits one winner with correct `lowPrice`/`cheapestStores`; a tie surfaces both stores in `cheapestStores`; a single-store cell emits NO cell; a different-weight offer of the same product does NOT merge into the cell.
  - [x] Gate 1 / honesty: a null-`matchKey` product is counted in `unmatchedProductCount` and absent from every `cheapestCells`, yet its store/tier still appear in the availability facet.
  - [x] Accounting: null/whitespace-brand products excluded + counted in `nullBrandProductCount`; empty-input → fully-zeroed report; an Edible-style option (no parseable weight — represented as a product with `options: []` after boundary reduction) yields a store in availability but no tier/cell.
- [x] **Wire into the runner** (AC: 7, 9)
  - [x] `deriveFactsRun.ts`: projects `productsFile` → `BrandStoreProduct[]` at the boundary (compute `deriveMatchKey`, take `history.at(-1)`, per-option `canonicalWeightGrams` + sold-out drop + `specialPrice ?? basePrice` reduction), calls `buildBrandStoreMatrix`, `wrapEnvelope`, `atomicWriteJson('brand-store-matrix.json')` **appended after** the brand-personas write. `DeriveOutcome` extended (new non-colliding field names) + `main()` log line added.
  - [x] `server/scripts/deriveFactsRun.test.ts`: extend the main regression test with brand-store-matrix envelope-shape + count assertions against `populatedFile()` (brand `acme`, two stores `store-a`/`store-b` carrying the same product `bd` — a natural ≥2-store cheapest cell to assert on).
- [x] **Live-data proof** — run `npx tsx server/scripts/deriveFactsRun.ts` against `server/data/products.db`; expect ≈ `505 brands / 225 multi-store / 201 cheapest cells / 826 null-brand excluded` (Grounding §2, allowing daily drift). Verify the envelope top-level keys, `excluded[]`, `coverage`, and spot-check `wyld` (14 stores, 7 tiers) and a known ≥2-store cheapest cell. Record in Debug Log.
- [x] **Full regression + build** (AC: 9) — `npx vitest run --exclude '**/dist/**'` all green (confirm the current baseline count when you run it, don't trust a number here); `npm run build` (client + server, `tsc -b && vite build`) clean.

## Dev Notes

### The one thing that matters most (read Grounding §3 first)

"Cheapest" is the whole honesty risk. Availability (brand → stores → tiers) is safe pure grouping. But a **cheapest** claim is a price claim, and per Gate 1 it is honest **only** at the same-product + same-weight join — the exact cell the disparity engine already uses. Never emit "brand X is cheapest at store Y" from brand grouping alone; that compares different products and lies. Emit a cheapest winner only for a `(matchKey, weight)` cell at ≥2 stores; count and skip everything else. Live, that's only 201 real cheapest cells out of 4,438 — the sparsity is the honesty working.

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** crown a "cheapest store for brand X" across different products/weights. Cheapest is per like-for-like `(matchKey, weightGrams)` cell at ≥2 stores only (Gate 1). Brand grouping alone asserts no price winner.
- **Do not** expose `basePrice`/`specialPrice` as a pair, any discount %/rate/depth, or potency. Reduce to one `price = specialPrice ?? basePrice` at the runner boundary; the pure function's input type must make the rate/potency breach non-compilable (the `@ts-expect-error` test guards it). This is narrower than 1.5 — a single price IS allowed here (cheapest needs it); the *pair* and potency are not.
- **Do not** import or use `walkPresenceAwareSeries` / add a `today` param. This fact is cross-sectional — latest observation only (`history.at(-1)`), like `crossStoreValue.ts`. No gap logic.
- **Do not** reimplement weight parsing or identity — reuse `canonicalWeightGrams` and `deriveMatchKey` unchanged (their header names the brand matrix as an intended consumer). No new derivation.
- **Do not** reverse-parse brand (or anything) out of the disparity `matchKey` string, and do not consume `report.disparities` for the cells (it drops brand and single-store cells). Compute cells directly from records.
- **Do not** inline brand normalization — use shared `normalizeBrandKey` from `brandKey.js` (decision B; 1.5 owns it).
- **Do not** bucket null-brand under `""`/`'unknown'`, or silently drop unmatched-key products — exclude and **count** both (`nullBrandProductCount`, `unmatchedProductCount`, FR7). Unmatched still count toward availability.
- **Do not** insert the new `atomicWriteJson` before any existing write in `deriveFactsRun.ts` — append after the `brand-personas.json` write (write-ordering discipline from 1.2.5's review).
- **Do not** add a route, an `EMPTY_*_ENVELOPE` constant, or touch `valueRoute.ts` / `server/index.ts` (Grounding §8).
- **Do not** modify `brandKey.ts`, `productMatchKey.ts`, `presenceAwareSeries.ts`, `crossStoreValue.ts`, `dealScope.ts`, `extractionHealth.ts`, `specialEvents.ts`, `disparityRollups.ts`, `brandPersonas.ts`, `derivedEnvelope.ts`, `data.json`, any scraper registry, or any existing type.

### Testing standards

- TypeScript strict mode; tests for everything (project rule). Server suite is vitest.
- The 1.5 story shipped at **534 tests / 46 files**; confirm the current count when you run rather than trusting this number (the DB and suite drift daily).
- Use small hand-built fixtures for unit tests (not the live DB); the live-proof is a separate sanity check whose counts drift daily.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).

### Previous story intelligence (derivation-1.5, 1.4, 1.3, 1.2.5)

- **`normalizeBrandKey`** (`server/utils/brandKey.ts`, the 1.5 shared normalizer, decision B) — lowercase + collapse non-alphanumeric runs + trim; null/empty/punct-only → `null`. Reuse **unchanged**; 1.6 is the second consumer the module was written for. Live: 516 raw → 505 normalized, 826 null-brand.
- **`brandPersonas.pickDisplayBrand`** (`server/utils/brandPersonas.ts`) — the pattern for choosing a representative `displayBrand` (raw label carried by the most products, tie → lexicographically smallest, `.trim()`-ed). Mirror it (don't share — keep 1.6 self-contained), including the trailing-space `"Hustler's Ambition "` guard.
- **`crossStoreValue.ts` `buildMatchReport`** — the closest sibling for the cheapest facet: it groups by `(deriveMatchKey, canonicalWeightGrams)`, reduces to the cheapest offer per store, requires ≥2 distinct stores, and uses `price = specialPrice ?? basePrice` (Gate 3) with the sold-out drop (Gate 4, `quantityAvailable !== null && <= 0`). 1.6's cheapest facet is the same reduction re-grouped under `brandKey`. Reuse the *approach*; do **not** call `buildMatchReport` (it has no brand dimension and drops single-store cells you still need to count).
- **`deriveMatchKey`/`canonicalWeightGrams`** (`server/utils/productMatchKey.ts`) — the weight-free identity key + canonical weight, reused unchanged; the boundary projection calls both. `deriveMatchKey` returns `{ key } | { unmatched }`; `unmatched` → `matchKey: null`.
- **`disparityRollups.ts`** (1.4) — precedent for a caller-side pre-projection into a narrowed pure-function input (it takes a pre-built `geoLookup`); and for deliberately **excluding brand** there because "the shared brand-key normalizer belongs to Story 1.5/1.6." That deferral is exactly this story.
- **`wrapEnvelope`** (`server/utils/derivedEnvelope.ts`) — `wrapEnvelope(data, excluded[], coverage)`; `generatedAt` set inside. Reuse unchanged, same as every prior fact.
- **`atomicWriteJson`** (`server/utils/atomicWrite.ts`) — the write helper every artifact uses.
- **`deriveFactsRun.ts` current write order:** disparities → deal-scope → extraction-health → special-events → disparity-rollups → **brand-personas**. Append brand-store-matrix **after** brand-personas.
- **`DeriveOutcome` field-collision watch:** 1.5's review renamed a field to `brandInsufficientHistoryCount` to avoid a name collision on `DeriveOutcome`. `nullBrandProductCount` already exists there (1.5's). Use distinct names for 1.6 (`matrixNullBrandProductCount`, `matrixTotalBrands`, etc.) — do not reuse or overwrite 1.5's fields.
- **Git pattern:** recent derivation stories (`d8c3035`, `7c37603`, `297dc32`) are single squash-merged PRs (`feat(derivation): …`, `#NN`) with a `Co-authored-by` trailer — one additive module + tests + runner wiring. Self-merge of Erik-directed derivation PRs is pre-authorized ([[feedback_always-push-deploy-fixes]]).

### Project Structure Notes

- **New files:** `server/utils/brandStoreMatrix.ts`, `server/utils/brandStoreMatrix.test.ts`, `server/data/derived/brand-store-matrix.json` (produced by the live-proof run).
- **Modified:** `server/scripts/deriveFactsRun.ts` (projection + `buildBrandStoreMatrix` call + `brand-store-matrix.json` write appended after brand-personas, `DeriveOutcome` extended, `main()` log line), `server/scripts/deriveFactsRun.test.ts` (brand-store-matrix assertions in the main regression test). The six existing `server/data/derived/*.json` may routinely refresh if the full `deriveFacts()` CLI is run — unrelated content churn, fine (same note 1.4/1.5 made).
- **No changes to:** `valueRoute.ts`, `valueRoute.test.ts`, `server/index.ts` (no route — Grounding §8), `brandKey.ts`, `productMatchKey.ts`, `presenceAwareSeries.ts`, `crossStoreValue.ts`, `dealScope.ts`, `extractionHealth.ts`, `specialEvents.ts`, `disparityRollups.ts`, `brandPersonas.ts`, `derivedEnvelope.ts`, `productsDb.ts`, any scraper registry, `data.json`, any client file, any existing type in `server/types/index.ts`.
- **ADR:** no new ADR entry — stays inside ADR-077's existing scope, consistent with 1.2/1.2.5/1.3/1.4/1.5.

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.6] — the written AC (brand→stores→tiers→cheapest; Gate 1 cheapest-per-cell; decision F rate/potency unreachable; envelope + strict-typed tests).
- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Epic 1 design decisions] — decision B (shared brand normalizer owned once, so 1.5/1.6 order is free) and decision F (type-gate covers Gate 2 + Gate 5).
- [Source: server/utils/brandKey.ts] — `normalizeBrandKey`, reused unchanged (decision B).
- [Source: server/utils/productMatchKey.ts] — `deriveMatchKey` + `canonicalWeightGrams`; its header names the brand matrix as an intended consumer of the identity key.
- [Source: server/utils/crossStoreValue.ts] — the like-for-like cheapest reduction (Gate 1 same-weight, Gate 3 `specialPrice ?? basePrice`, Gate 4 sold-out drop, ≥2-store rule) the cheapest facet mirrors.
- [Source: server/utils/brandPersonas.ts] — sibling brand fact: `pickDisplayBrand` pattern, narrowed decision-F input type, envelope wiring, no-route decision.
- [Source: server/utils/disparityRollups.ts] — caller-side pre-projection into a narrowed pure input; and the explicit deferral of brand to Story 1.5/1.6.
- [Source: server/utils/derivedEnvelope.ts] — `wrapEnvelope`, reused unchanged.
- [Source: server/scripts/deriveFactsRun.ts] — current runner + write order (append after brand-personas); the projection boundary lives here.
- [Source: server/scripts/deriveFactsRun.test.ts] — `rec()`/`populatedFile()` fixtures (brand `Acme`; `store-a::bd` + `store-b::bd` — a natural ≥2-store cell) to extend.
- [Source: server/types/index.ts#ProductRecord, #ProductObservation, #ProductOptionObservation] — the full record (price pair + potency) the runner projects DOWN to `BrandStoreProduct` at the boundary.
- [Source: _bmad-output/implementation-artifacts/derivation-1-5-brand-discount-personas.md] — immediate predecessor: grounding discipline, decision-F type gate, envelope wiring, write-ordering, live-proof, no-route decision.
- [Source: ADR.md#ADR-077] — the substrate/derivation-engine decision this fact stays inside.
- [Reference: investigations/fix6-basePrice-verdict.md] — why the banner discount % (the flat rate) carries no signal — the basis for hiding the price *pair* while allowing the single reduced price.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-quick-dev / dev-story)

### Debug Log References

- Live-data proof (FINAL, after the review gate-fix below) — `npx tsx server/scripts/deriveFactsRun.ts` against `server/data/products.db`:
  `brand-store-matrix: 505 brands / 225 multi-store / 150 cheapest cells (826 null-brand, 0 unmatched excluded)`. Availability (505/225/826-null) matches Grounding §2 exactly. Cheapest cells are **150, not the Grounding-§2 figure of 201** — see the review correction below; 201 was computed on the same false premise the code originally shared. 0 unmatched because every non-null-brand product derives a match-key.
- Envelope spot-check (`brand-store-matrix.json`): top keys `data,excluded,coverage,generatedAt`; `excluded=[{nullBrand,826},{unmatchedProduct,0}]`; `coverage={totalBrands:505,multiStoreBrandCount:225,cheapestCellCount:150}`. `wyld` row = 14 stores / **0 tiers / 0 cheapest cells** (Wyld is an edibles/gummies brand — mg-labelled, so it honestly carries NO weight-based tier or cheapest claim; it still shows all 14 stores in availability). Zero tiers/cells below 0.3g remain (verified — a sub-gram tier would be the mg-as-grams leak the fix closes).
- **Review correction (edge-case hunter, HIGH → patched):** the projection originally trusted Grounding §7's claim that `canonicalWeightGrams` returns `null` for mg/count labels. It does NOT — `canonicalWeightGrams("100mg") === 0.1`, `"1ct" === 1`, etc. So Edibles (and flag-poisoned records) were leaking bogus "$/gram" tiers and cheapest cells — the exact dishonesty crossStoreValue.ts's category gate (`WEIGHT_BASED_CATEGORIES`) and flag gate (`EXCLUDED_FLAGS`) exist to block, which the projection had omitted. Fix: the boundary now only builds options for a **weight-comparable** record (`WEIGHT_BASED_CATEGORIES.has(category) && no EXCLUDED_FLAGS`); a non-comparable record still counts toward availability (its store stocks the brand) but contributes no tier/cell — exactly the edible-only-brand behaviour Grounding §7 intended. Effect: cheapest cells 201 → 150 (51 were dishonest); availability unchanged. New runner test `projection gates non-weight (Edible) and flag-poisoned records…` exercises the real projection with a `"100mg"` Edible and a `weight-mismatch` Flower.
- Server suite: 547 passed / 47 files (from 1.5's 534/46 — +12 `brandStoreMatrix` unit tests, +1 runner projection-gate test, runner regression extended). Client suite: 558 passed / 44 files (untouched). NOTE: running `npx vitest run` from the repo ROOT mixes both projects and the client React tests fail on a missing jsdom env — a root-invocation artifact, not a regression; each suite is green run from its own dir (`server/`, `client/`).
- Production build `npm run build` (client `tsc -b && vite build` + server `tsc`) clean. `tsc` compiling with the `@ts-expect-error` directives present proves `basePrice`/`specialPrice`/`thc`/`totalTerpenes` are genuinely unreachable (decision F holds at compile time, not by discipline).

### Completion Notes List

- Two-tier honesty split implemented exactly: availability (brand→stores→tiers) is pure grouping over every product (matched + unmatched); the cheapest facet emits a winner only for a `(matchKey, weightGrams)` cell at ≥2 distinct stores, mirroring `crossStoreValue.ts`'s Gate 1/3/4 reduction re-grouped under `brandKey`. Live: 201 of 4,438 cells survive — the sparsity is the honesty gate working.
- Decision F is narrower than 1.5: a single reduced `price = specialPrice ?? basePrice` IS exposed (cheapest needs it) while the price PAIR and potency are structurally absent from the input types. The boundary projection in `deriveFactsRun.ts` is the only place prices/potency are dropped and the per-option reductions (canonical weight, sold-out drop, price collapse) happen.
- No route (internal-only artifact, mirroring brand-personas / extraction-health / special-events). Reused `normalizeBrandKey`, `deriveMatchKey`, `canonicalWeightGrams`, `wrapEnvelope`, `atomicWriteJson` unchanged. No new ADR (stays inside ADR-077). `DeriveOutcome` extended with non-colliding names (`matrixTotalBrands`, `multiStoreBrandCount`, `cheapestCellCount`, `matrixNullBrandProductCount`, `unmatchedProductCount`).
- Three closing questions for Erik remain non-blocking and unchanged (no route; flat tiers vs store×tier grid; cheapest-cell sparsity by design).

### File List

- **New:** `server/utils/brandStoreMatrix.ts`
- **New:** `server/utils/brandStoreMatrix.test.ts`
- **New:** `server/data/derived/brand-store-matrix.json` (live-proof output)
- **Modified:** `server/scripts/deriveFactsRun.ts` (imports, path, projection + build + envelope + write appended after brand-personas, `DeriveOutcome` extended, `main()` log line)
- **Modified:** `server/scripts/deriveFactsRun.test.ts` (brand-store-matrix envelope + count assertions in the main regression test)
- **Modified (derived churn from the live-proof run):** the six pre-existing `server/data/derived/*.json` may refresh — unrelated content, expected (same note 1.4/1.5 made)

## Questions for Erik (saved from story-creation analysis — non-blocking)

1. **No served route (Grounding §8).** FR12 calls the matrix "a queryable fact (and a feed for personas)" but does not use FR11's "served consumer surface" phrase that earned 1.4 its `/api/value/*` route. So this ships as an internal-only `brand-store-matrix.json` (envelope-wrapped, wired into the runner), matching brand-personas / extraction-health / special-events — no route. If you want it queryable over HTTP now, that's a small separate add (exactly as 1.4 was for FR11). Flagging so the no-route call is conscious.
2. **"Tiers" is a flat weight list, not a store×tier cross-tab.** "At what tiers" is shipped as the sorted set of canonical weights a brand is offered at (availability), with the per-`(product, weight)` store detail living in `cheapestCells`. A full brand × store × tier cross-tab is richer but larger and, I think, beyond FR12's intent. Comfortable with the flat-tiers reading, or do you want the store×tier grid?
3. **Cheapest cells are sparse (201 live) by design.** Only same-product + same-weight cells carried at ≥2 stores get a cheapest winner (Gate 1). 280 of 505 brands are single-store and 4,237 of 4,438 cells are single-store, so most brands will have `cheapestCells: []` — that's the honesty gate working, not missing data. Confirming that's the intended shape.

## Change Log

- 2026-07-10: Implemented via bmad-quick-dev/dev-story. Three context-free adversarial reviewers ran (blind hunter, edge-case hunter, acceptance auditor). Acceptance auditor: no AC violations. Blind hunter: no material defect. **Edge-case hunter found a HIGH, real honesty defect (patched):** Grounding §7's premise that `canonicalWeightGrams` returns `null` for mg/count labels is factually WRONG (`"100mg"→0.1g`, `"1ct"→1g` — verified empirically). crossStoreValue.ts actually gates Edibles by `WEIGHT_BASED_CATEGORIES` (category gate) plus `EXCLUDED_FLAGS` (flag gate); the projection had omitted both, so Edibles priced by mg-THC and flag-poisoned records leaked bogus "$/gram" tiers/cheapest cells. Fix: the runner projection now only builds weight-bearing options for a weight-comparable record (`WEIGHT_BASED_CATEGORIES.has(category) && no EXCLUDED_FLAGS`); non-comparable records still count toward availability (store stocked) but yield no tier/cell — the edible-only-brand outcome Grounding §7 wanted, achieved by an explicit gate rather than the assumed free null. **Live effect: cheapest cells 201 → 150 (51 were dishonest); availability 505/225/826-null unchanged; `wyld` correctly drops from 7 bogus tiers to 0 (it is an edibles brand).** Added a runner projection-gate test. Also hardened (LOW, all three reviewers noted): the cheapest-cell grouping key uses `@`, which `deriveMatchKey`'s normalization can never emit, so `(matchKey, weightGrams)` pairs can't collide. Server suite 547 green, `npm run build` clean.
- 2026-07-10: Story created via bmad-create-story. Grounded against live `products.db` (5,219 products, 505 normalized brands, 826 null-brand — matching 1.5). Quantified the honesty split that is the crux of this fact: availability (brand→stores→tiers) is dense pure grouping (225 brands span ≥2 stores), but an honest cross-store "cheapest" is a like-for-like `(brandKey, match-key, weight)` claim (Gate 1) that exists for only 201 of 4,438 cells — brand grouping alone never crowns a winner. Narrowed decision-F input is looser than 1.5 (a single reduced `specialPrice ?? basePrice` IS allowed — cheapest needs it — while the price *pair*/rate and potency stay non-compilable). Confirmed cross-sectional (latest observation, no 1.2 helper/`today`), reusing `deriveMatchKey`/`canonicalWeightGrams`/`normalizeBrandKey` unchanged (no new derivation). Scoped OUT a served route (internal-only, mirroring 1.5). Status → ready-for-dev.

## Suggested Review Order

**The honesty split (design intent — start here)**

- Entry point: the two-tier split (availability = pure grouping; cheapest = like-for-like Gate 1 only).
  [`brandStoreMatrix.ts:6`](../../server/utils/brandStoreMatrix.ts#L6)

- Cheapest winner emitted ONLY at ≥2 distinct stores — the sparsity that IS the honesty gate.
  [`brandStoreMatrix.ts:176`](../../server/utils/brandStoreMatrix.ts#L176)

- Availability counts every product (matched + unmatched); null-matchKey excluded from cells but counted.
  [`brandStoreMatrix.ts:119`](../../server/utils/brandStoreMatrix.ts#L119)

**The projection boundary (where the review defect lived — highest risk)**

- The ONLY place prices/potency drop; applies crossStoreValue's category + flag gates (the patch).
  [`deriveFactsRun.ts:279`](../../server/scripts/deriveFactsRun.ts#L279)

- Full projection: deriveMatchKey, latest observation, sold-out drop, specialPrice ?? basePrice.
  [`deriveFactsRun.ts:266`](../../server/scripts/deriveFactsRun.ts#L266)

- Envelope wrap + write appended AFTER brand-personas (write-ordering discipline).
  [`deriveFactsRun.ts:297`](../../server/scripts/deriveFactsRun.ts#L297)

**Decision F (type-level honesty guarantee)**

- Narrowed input types — no price pair, no potency; the breach cannot compile.
  [`brandStoreMatrix.ts:36`](../../server/utils/brandStoreMatrix.ts#L36)

**Tests (peripherals)**

- Compile-level negative test proving basePrice/specialPrice/potency unreachable.
  [`brandStoreMatrix.test.ts:168`](../../server/utils/brandStoreMatrix.test.ts#L168)

- The gate regression: real "100mg" Edible + weight-mismatch record stay in availability, no tier/cell.
  [`deriveFactsRun.test.ts:164`](../../server/scripts/deriveFactsRun.test.ts#L164)
