---
title: 'Category expansion — collect Edible + Concentrate products'
type: 'feature'
created: '2026-07-03'
status: 'done'
baseline_commit: '9e15c76'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Only Flower/Vaporizers/Pre-Rolls are collected (`DEFAULT_PRODUCT_CATEGORIES`); Edible and Concentrate products already arrive in every Dutchie FilteredProducts payload (confirmed live 2026-06-24: `type` values `Edible`, `Concentrate`) and are dropped at extraction — audit gap G2. The derivation engine (next PRD) needs this data accruing NOW.

**Approach:** Collection-first, derivation deferred. Widen the Dutchie + Weedmaps extraction vocabulary to include `Edible` and `Concentrate`. Concentrates are weight-based → full existing unit economics. Edibles are mg-THC-labeled — a "100mg" option is cannabinoid content, NOT product weight — so edibles get NO per-gram figures, no weight parse, and are excluded (counted) from the weight-keyed disparity matcher until an honest $/mg basis ships with the derivation engine.

## Boundaries & Constraints

**Always:**
- Category strings are Dutchie-verbatim: `Edible`, `Concentrate` (singular — matches live `type` values).
- Honest Math: never serve a $/gram figure whose denominator isn't a true product weight. Edible option labels are stored verbatim; nothing is lost by not parsing them.
- Absence-of-figure ≠ defect: edibles missing per-gram is n/a (mirrors "pricePerItem null for non-pre-rolls, not a flag"). Do NOT push `unparseable-weight` for Edible records.
- Matcher exclusions are counted, never silent (AC5 discipline).
- Single-source the weight-based category set; no duplicated literals across matcher/normalizer.

**Ask First:**
- Adding any category beyond `Edible`/`Concentrate` (Topicals/Tinctures/Drinks were NOT confirmed in the live capture).
- Any schema field addition to `ProductRecord`/options (e.g. a parsed-mg field).
- Any change to `EXCLUDED_FLAGS` membership.

**Never:**
- No edible disparity rows in this slice ($/mg basis is derivation-engine work).
- No dealScope banner-linking of Edible/Concentrate (`UNSUPPORTED_CUES`/`ScrapedCategory` behavior unchanged; comment updates only).
- No re-scrape/backfill mechanics — data accrues on the normal daily runs.
- Don't touch the deals pipeline (`_dutchie.ts`) or `/api/data`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dutchie edible | `type:'Edible'`, Options `["100mg"]`, price 25 | Record kept; option verbatim; `weightGrams`/`pricePerGram`/`specialPricePerGram` null; no `unparseable-weight` flag | N/A |
| Dutchie concentrate | `type:'Concentrate'`, Options `["1g"]`, price 30 | Record kept; `weightGrams:1`, `pricePerGram:30` — full existing math incl. weight-mismatch reconciliation | N/A |
| Edible in matcher | Two stores carry same-key Edible | No disparity row; both counted in new `nonComparableCategoryCount` | N/A |
| Concentrate in matcher | Two stores, same key + canonical weight | Normal disparity row | N/A |
| Weedmaps edible/concentrate | `edgeCategory` ancestors contain "edibles"/"concentrates" | Maps to `Edible`/`Concentrate`; existing 3-category rules keep priority (a "cartridge" under Concentrates stays Vaporizers) | out-of-vocab still dropped |
| Edible pack | Name "Gummies 10pk" | `packCount:10` parsed as today; `pricePerItem` stays null (pre-roll-only, unchanged) | N/A |
| Edible banner in dealScope | "20% off all edibles" | Still `unsupported-category` (unchanged) | N/A |

</frozen-after-approval>

## Code Map

- `server/scrapers/_dutchieProducts.ts:18` -- `DEFAULT_PRODUCT_CATEGORIES` allowlist; header comment (l.16-17) states the old launch scope
- `server/utils/normalizeProduct.ts` -- unit-economics chokepoint: `parseGrams` per-option, `unparseable-weight` flag (l.99), weight-mismatch reconciliation (l.124) — all need category awareness; home for exported `WEIGHT_BASED_CATEGORIES`
- `server/utils/crossStoreValue.ts` -- `buildMatchReport` gates (l.65-105); matcher parses labels itself via `canonicalWeightGrams`, so it needs its own category gate + report count
- `server/scrapers/_weedmaps.ts` -- `CATEGORY_RULES` (l.128), `LaunchCategory` type, `DEFAULT_CATEGORY_SLUGS` (l.34)
- `server/types/index.ts:173-176` -- `ScrapedCategory` comment now stale ("categories the product scrapes actually cover") — reword, do not widen the type
- `server/utils/dealScope.ts:38-41` -- `UNSUPPORTED_CUES` comment stale ("products we do NOT scrape") — reword only
- `server/scrapers/__fixtures__/dutchie-products.json` -- fixture has 1 Pre-Rolls product only; add 1 Edible + 1 Concentrate shaped per the live-capture field table (`menu-pricing-source-inventory.md`)
- `server/utils/crossStoreValue.audit.test.ts` -- runs matcher over committed products.json; must stay green (file has no edibles yet)

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/normalizeProduct.ts` -- export `WEIGHT_BASED_CATEGORIES = new Set(['Flower','Vaporizers','Pre-Rolls','Concentrate'])`; for non-weight-based (Edible): skip `parseGrams`, leave `weightGrams`/per-gram fields null, skip `unparseable-weight` flag and weight reconciliation -- honest basis
- [x] `server/scrapers/_dutchieProducts.ts` -- add `'Edible','Concentrate'` to `DEFAULT_PRODUCT_CATEGORIES`; update scope comment -- collection widening
- [x] `server/utils/crossStoreValue.ts` -- skip non-weight-based records before grouping, increment new `MatchReport.nonComparableCategoryCount` (import the set from normalizeProduct) -- no mg-as-weight disparities, counted
- [x] `server/scrapers/_weedmaps.ts` -- append `{/edible/→'Edible'}`, `{/concentrate/→'Concentrate'}` AFTER existing `CATEGORY_RULES`; widen `LaunchCategory` handling; add `'edibles','concentrates'` to `DEFAULT_CATEGORY_SLUGS` (wrong slug degrades to [], harmless) -- cross-source vocab alignment
- [x] `server/types/index.ts` + `server/utils/dealScope.ts` -- comment-only rewording (ScrapedCategory = banner-linkable set, not scrape coverage) -- doc honesty
- [x] Tests (`_dutchieProducts.test.ts`, `normalizeProduct.test.ts`, `crossStoreValue.test.ts`, `_weedmaps.test.ts`) -- cover every I/O-matrix row. AMENDED vs draft: new Edible/Concentrate cases use inline live-shaped objects (existing `spaceKush` precedent) instead of editing `__fixtures__/dutchie-products.json` — that fixture is provenance-labeled as a single REAL capture; injecting synthesized products would corrupt provenance. Bonus real-data coverage: the Weedmaps fixture's WYLD edible (previously dropped) now maps to `Edible` and is asserted -- proof

**Acceptance Criteria:**
- Given a FilteredProducts payload with all 5 categories, when transformed + normalized, then Edible/Concentrate records persist with verbatim option labels and potency fields, and no Edible record carries a weight-derived figure or weight flag.
- Given the committed products.json (3 categories), when the full server suite runs, then all tests incl. the audit test pass — zero behavior change for existing records.
- Given a products file with Edible records at 2 stores, when `buildMatchReport` runs, then `disparities` contains no Edible row and `nonComparableCategoryCount` equals the Edible record count.
- Given `npm run build`, then client+server compile clean.

## Spec Change Log

- **2026-07-04 (review pass, patches — no loopback):** 3-reviewer pass found no intent_gap/bad_spec; 6 patch findings applied on top of the implementation: (1) `types/index.ts` comment self-contradiction fixed (Concentrate has a weight axis yet is deliberately not banner-linkable); (2) guard test coupling `WEIGHT_BASED_CATEGORIES ⊆ DEFAULT_PRODUCT_CATEGORIES`; (3) test pinning gate order (flagged Edible → `nonComparableCategoryCount`, not `excludedFlagCount`); (4) Weedmaps: `/\bedibles?\b/` moved BEFORE vape/flower rules + word-bounded both new cues (an Edibles-ancestor "flower-infused honey" must not be misfiled weight-based); (5) **`BANNER_LINKABLE_CATEGORIES` filter added to `dealScope.matchStoreProducts`** — without it the storewide path silently swept new Edible/Concentrate SKUs into links, violating the frozen "no banner-linking of Edible/Concentrate" (the frozen intent's "comment updates only" prediction was wrong: honoring the intent REQUIRED this one code change; intent itself unambiguous, so no human loopback); (6) **Concentrate match keys now include `subcategory`** — live-resin vs distillate with identical brand+strain would otherwise emit a false disparity; non-Concentrate keys byte-identical to committed. Deferred to deferred-work.md: concentrate banner cues + pre-existing "concentrate ounces"→Flower@28g false friend. KEEP: verbatim option labels, no-flag n/a semantics for Edible, gate-5-counts-first, inline live-shaped test objects (fixture provenance untouched).

## Design Notes

- **Why exclude edibles from the matcher when "100mg vs 100mg" looks like-for-like:** the matcher would publish `weightGrams: 0.1` on the disparity row — mg-of-THC masquerading as product weight. The comparison may be fair; the published field lies. Derivation-engine $/mg does it honestly later.
- **Payload growth:** live capture ratio suggests roughly +40–70% records (3,634 → ~5–6k; products.json 14.8MB → ~20–25MB). Same daily-append mechanics; no threshold crossed (GH commit-back and Render read both fine). Watch it, don't engineer for it.
- **Matcher gate placement:** `buildMatchReport` re-parses option labels itself (`canonicalWeightGrams(opt.option)`, not stored `weightGrams`), so nulling weights in normalizeProduct does NOT gate the matcher — it needs its own explicit category check. Both gates single-source `WEIGHT_BASED_CATEGORIES`.

## Verification

**Commands:**
- `npm test --workspace=server` (or the project's server vitest invocation) -- expected: all green incl. audit test, new I/O-matrix cases present
- `npm run build` -- expected: clean client+server build

**Manual checks (if no CLI):**
- After next nightly/hourly product run post-merge: `/api/products` serves `Edible`/`Concentrate` records; `/api/value/disparities` `nonComparableCategoryCount` > 0 and no Edible rows.

## Suggested Review Order

**Honest basis (the design decision everything hangs on)**

- Single source of truth: which categories have a true-weight axis; Edible deliberately absent
  [`normalizeProduct.ts:24`](../../server/utils/normalizeProduct.ts#L24)

- The gate: Edible gets no weight parse, no per-gram, no flag — n/a, not a defect
  [`normalizeProduct.ts:96`](../../server/utils/normalizeProduct.ts#L96)

**Collection widening**

- Dutchie allowlist grows to the 5 live-confirmed `type` values
  [`_dutchieProducts.ts:21`](../../server/scrapers/_dutchieProducts.ts#L21)

- Weedmaps rule order: edible BEFORE vape/flower blocks the mg-as-grams side door
  [`_weedmaps.ts:138`](../../server/scrapers/_weedmaps.ts#L138)

- Two best-effort category subpages; a wrong slug degrades to []
  [`_weedmaps.ts:35`](../../server/scrapers/_weedmaps.ts#L35)

**Matcher integrity (review-pass hardening)**

- Gate 5: matcher re-parses labels itself, so it needs its own category check — counted, never silent
  [`crossStoreValue.ts:77`](../../server/utils/crossStoreValue.ts#L77)

- Concentrate keys include `subcategory` so live-resin vs distillate can't form a false disparity
  [`productMatchKey.ts:125`](../../server/utils/productMatchKey.ts#L125)

**Bridge containment (the one behavior leak the review caught)**

- Storewide banners must not silently sweep new categories into links
  [`dealScope.ts:148`](../../server/utils/dealScope.ts#L148)

- Why `ScrapedCategory` stays 3-wide despite Concentrate's weight axis
  [`types/index.ts:180`](../../server/types/index.ts#L180)

**Peripherals — tests**

- Edible/Concentrate basis + category-set coupling guard
  [`normalizeProduct.test.ts:222`](../../server/utils/normalizeProduct.test.ts#L222)

- No edible disparities; gate order pinned
  [`crossStoreValue.test.ts:186`](../../server/utils/crossStoreValue.test.ts#L186)

- Concentrate form keying, both directions
  [`productMatchKey.test.ts:90`](../../server/utils/productMatchKey.test.ts#L90)

- Storewide link set unchanged with edible/concentrate present
  [`dealScopeLinks.test.ts:83`](../../server/integration/dealScopeLinks.test.ts#L83)

- Extraction keeps the newcomers verbatim; the real WYLD edible now asserted
  [`_dutchieProducts.test.ts:157`](../../server/scrapers/_dutchieProducts.test.ts#L157)
