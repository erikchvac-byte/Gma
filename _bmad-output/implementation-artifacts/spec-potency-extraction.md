---
title: 'Potency extraction: THC/CBD/terpenes/effects/subcategory from the Dutchie products payload'
type: 'feature'
created: '2026-07-03'
status: 'done'
context: []
baseline_commit: 'eadd54ae818ef76507a83b6294c85a42b8ef7d14'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Dutchie FilteredProducts payload already carries potency (`THCContent`/`CBDContent` `{unit, range}`), `totalTerpenes`, an `effects` score map, and `subcategory` — but the extractor reads none of them, so every THC/CBD item in `data-collection-audit-2026-07-03.md` (area 8, THC-per-dollar, "strongest products", high-CBD search) is a hard No, and each un-captured day is lost data.

**Approach:** Extract these fields defensively in `_dutchieProducts.ts`, carry them through `RawProduct` → `normalizeProduct` → `ProductRecord` as **record-level descriptive identity** (refreshed each scrape like `brand`/`name` — NOT per-observation), so the existing identity-refresh merge backfills all live records on the next daily scrape with zero migration and minimal file growth.

## Boundaries & Constraints

**Always:**
- Additive only: no existing field changes shape or meaning; `/api/data`, the Deal pipeline, and the matcher (`crossStoreValue.ts`/`productMatchKey.ts`) stay byte-identical in behavior.
- Honest Math (ADR-007/009): store what the payload states, verbatim units, `null` when absent or malformed — never synthesize, never guess a unit, never convert PERCENTAGE↔MILLIGRAMS.
- Fail-soft extraction (existing posture): a malformed potency object degrades that field to `null`, never throws, never drops the product.
- TypeScript strict; tests for every new parse path.

**Ask First:**
- If implementation reveals the legacy scalar `THC`/`CBD` fields are the ONLY populated potency source for some stores (fixture has them `null`), ask before mapping them — their unit is undocumented.
- Any urge to also extract `cannabinoidsV2` or Weedmaps potency — out of this spec's scope.

**Never:**
- No per-observation potency history (record-level only — renegotiate if batch-level tracking is ever wanted).
- No UI, no route changes, no new endpoints, no matcher changes, no category expansion (deferred #2), no deal-history snapshot (deferred #3).
- No products.json data migration — absent fields on old records are acceptable until the next scrape refreshes them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `THCContent: {unit:'PERCENTAGE', range:[21,22]}` | `thc: {unit:'PERCENTAGE', low:21, high:22}` | N/A |
| Single-point range | `range:[18]` | `{unit, low:18, high:18}` | N/A |
| Missing potency | `THCContent: null` / absent | `thc: null` | no flag, no throw |
| Malformed range | `range: ['high', null]` / empty / non-array | `thc: null` (a unit without numbers is unusable) | degrade silently |
| Missing unit with valid range | `{range:[20,21]}`, no `unit` | `thc: null` — a number without its unit lies | degrade silently |
| Effects map | `effects: {relaxed:9, sleepy:8}` | stored verbatim, non-finite values dropped; empty result → `null` | degrade silently |
| totalTerpenes / subcategory | number / non-empty string | stored; anything else → `null` | degrade silently |
| Weedmaps source | `transformWeedmapsProducts` output | all new RawProduct fields explicitly `null` | N/A |
| Existing record merged | old record lacks new fields; new scrape carries them | identity refresh (`applyProductObservations` spread) backfills them | N/A |

</frozen-after-approval>

## Code Map

- `server/types/index.ts` -- add `PotencyRange` (`{unit: string; low: number; high: number}`); add `thc`, `cbd`, `totalTerpenes`, `effects`, `subcategory` to `RawProduct` (required `| null`) and `ProductRecord` (OPTIONAL `?: … | null` — committed pre-potency records lack the keys; the backfill test depends on the `undefined` vs `null` distinction)
- `server/scrapers/_dutchieProducts.ts` -- extend `RawDutchieProduct` (`THCContent`/`CBDContent` `{unit?, range?}`, `totalTerpenes?`, `effects?`, `subcategory?`); new `potency()` helper + extraction in `transformProducts`
- `server/utils/normalizeProduct.ts` -- pass the five fields through to the returned `ProductRecord`
- `server/scrapers/_weedmaps.ts` -- set the five new `RawProduct` fields to explicit `null` in `transformWeedmapsProducts` (strict-mode compile requirement; Weedmaps potency out of scope)
- `server/utils/productsStore.ts` -- NO change (identity refresh via `...rec` spread already carries new fields); assert via test only
- `server/scrapers/__fixtures__/dutchie-products.json` -- already contains populated `THCContent`/`CBDContent`/`effects`/`subcategory` for the transform test

## Tasks & Acceptance

**Execution:**
- [x] `server/types/index.ts` -- add `PotencyRange` + five nullable fields to `RawProduct`/`ProductRecord` -- the shared contract everything else compiles against
- [x] `server/scrapers/_dutchieProducts.ts` -- implement `potency(raw)` (unit string + finite-number range → `{unit, low, high}`, else `null`; 1-element range → low=high), `effectsMap()` (finite-valued entries only, else/empty → `null`), extract `totalTerpenes` via existing `num()`, `subcategory` as trimmed non-empty string else `null`; wire into `transformProducts` output -- single extraction chokepoint
- [x] `server/utils/normalizeProduct.ts` -- carry the five fields from `RawProduct` onto the returned `ProductRecord` -- pure pass-through, no flag logic
- [x] `server/scrapers/_weedmaps.ts` -- add explicit `null`s for the five fields in the built `RawProduct` -- keeps strict compile, no behavior change
- [x] `server/scrapers/_dutchieProducts.test.ts` -- cover the full I/O matrix rows for extraction (happy, single-point, missing, malformed range, unit-less range, effects junk-filtering, subcategory/terpenes coercion)
- [x] `server/utils/normalizeProduct.test.ts` -- assert pass-through onto `ProductRecord` (+ nulls-stay-null)
- [x] `server/utils/productsStore.test.ts` -- assert an existing record WITHOUT the fields gains them via identity refresh on merge (the zero-migration guarantee)
- [x] (surfaced by tsc, not vitest) five existing `RawProduct` literal sites updated with explicit nulls: `normalizeProduct.test.ts` ×2, `_weedmaps.test.ts`, `integration/weedmapsMatcher.test.ts`, `scripts/scrapeWeedmapsRun.test.ts`, `scripts/scrapeProductsRun.test.ts`

**Acceptance Criteria:**
- Given the committed fixture, when `transformProducts` runs, then the product carries `thc {unit:'PERCENTAGE', low:21, high:22}`, `cbd {unit:'PERCENTAGE', low:0.04, high:0.05}`, `effects` verbatim, `subcategory 'singles'`, `totalTerpenes null`.
- Given a full pipeline run (`transformProducts` → `normalizeProduct` → `applyProductObservations` over a prior file lacking the fields), when merged, then the stored `ProductRecord` carries the new fields and its prior observation history is intact and unchanged.
- Given the existing server test suite and matcher audit tests, when run, then all pass with zero modifications to matcher/deal tests (proves additivity).

## Spec Change Log

## Design Notes

- **Record-level, not per-observation:** potency is listing-stable (per-batch drift exists but the payload describes the listing); putting it on `ProductRecord` reuses the existing identity-refresh semantics, adds ~5 small fields × 3.6k records instead of × 23k+ observations on a file that grows daily via commit-back, and still answers every audit-area-8 question. Deliberate trade: old potency values are overwritten on refresh (same as `name`/`brand` today).
- Fixture evidence (verified 2026-07-03): `THCContent {unit:'PERCENTAGE', range:[21,22], __typename:'ProductPotency'}`; `effects {relaxed:9, painRelief:7, sleepy:8, happy:8, euphoric:8}`; `subcategory 'singles'`; legacy `THC`/`CBD` scalars `null`; `cannabinoidsV2 []`. Fixture holds ONE product — extraction must stay defensive against live variance (e.g. `unit:'MILLIGRAMS'` is stored verbatim, never converted).

## Verification

**Commands:**
- `cd server && npx vitest run` -- expected: all suites green (389+ tests), new parse-path tests included
- `npm run build` (repo root) -- expected: client+server production build clean (Render-parity check, per standing feedback)

**Manual checks (if no CLI):**
- After the next daily `scrape-products` run post-merge: spot-check `server/data/products.json` for populated `thc` on a known flower record and confirm observation history lengths did not reset.

## Suggested Review Order

**Potency parsing (the honesty gates)**

- Entry point: unit-required, trimmed, negatives-rejected — the whole Honest Math posture in one function
  [`_dutchieProducts.ts:105`](../../server/scrapers/_dutchieProducts.ts#L105)

- `Object.fromEntries` so a JSON-sourced `__proto__` effect key is stored, not silently swallowed
  [`_dutchieProducts.ts:121`](../../server/scrapers/_dutchieProducts.ts#L121)

- Why the legacy scalar `THC`/`CBD` fields are deliberately NOT read (undocumented unit)
  [`_dutchieProducts.ts:72`](../../server/scrapers/_dutchieProducts.ts#L72)

- Wiring into the extraction chokepoint — five fields, all fail-soft to null
  [`_dutchieProducts.ts:190`](../../server/scrapers/_dutchieProducts.ts#L190)

**Data-model contract**

- `PotencyRange`: verbatim unit, never converted; single-point range collapses to low === high
  [`types/index.ts:42`](../../server/types/index.ts#L42)

- Record-level (`?` optional) — the zero-migration backfill design and its deliberate overwrite trade
  [`types/index.ts:113`](../../server/types/index.ts#L113)

- `totalTerpenes` caveat: unit undocumented by the source, collected verbatim (review decision)
  [`types/index.ts:66`](../../server/types/index.ts#L66)

**Pipeline pass-through**

- Pure pass-through in normalize — no parsing, no flags; validation stays in the scraper
  [`normalizeProduct.ts:157`](../../server/utils/normalizeProduct.ts#L157)

- Weedmaps states null explicitly — potency extraction is Dutchie-only this spec
  [`_weedmaps.ts:242`](../../server/scrapers/_weedmaps.ts#L242)

**Tests (peripherals)**

- Parse-path matrix: happy/single-point/reversed/verbatim-mg/missing/unit-less/malformed/trim/negative
  [`_dutchieProducts.test.ts:173`](../../server/scrapers/_dutchieProducts.test.ts#L173)

- End-to-end chain (AC2): fixture → transform → normalize → merge, history intact
  [`_dutchieProducts.test.ts:291`](../../server/scrapers/_dutchieProducts.test.ts#L291)

- The zero-migration guarantee: pre-potency record gains fields via identity refresh
  [`productsStore.test.ts:92`](../../server/utils/productsStore.test.ts#L92)

- Pass-through + nulls-stay-null assertions on the normalized record
  [`normalizeProduct.test.ts:59`](../../server/utils/normalizeProduct.test.ts#L59)
