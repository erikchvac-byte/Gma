---
baseline_commit: 4903513c7bd9e3336513af977205aa6165f0460e
---

# Story: Deal→SKU Scope Bridge (read-only inference)

Status: review

<!-- Cross-cutting follow-up story (no parent epic), tracked individually in
sprint-status.yaml — same pattern as cross-store-value-matcher / weedmaps-source-wiring.
Origin: data-layer roundtable audit 2026-06-30 (party-mode). Winston flagged the Deal
entity as an "orphan" — storewide free-text with no foreign key to any Product. -->

## Story

As **the value/AI-search layer of Gma's Helper**,
I want **each free-text store deal linked to the specific in-store products (SKUs) its banner actually covers**,
so that **the app can say "this store's '50% off Ounces — Monday' banner applies to these flower ounces" — closing the one relationship the data model is missing without coupling the two pipelines or inventing a savings number the data can't support.**

## Honest scope & value framing (READ FIRST — this bounds the whole story)

Grounding in the real code (2026-06-30) narrows this from how it was framed in the roundtable. Do **not** over-build:

1. **This is a SCOPE + TEMPORAL join, not a new discount/savings signal.** Per `fix6-basePrice-verdict.md`, a banner `discountPct` is a flat storewide/brand promo rate with **no per-item signal**. The bridge answers *"which SKUs does this banner cover, and on which days/times"* — it must **never** multiply a banner % onto a product to claim a per-item saving.
2. **The observed `specialPrice` is already the price-of-record.** `ProductRecord` options already carry the real Dutchie/Weedmaps discounted price (`specialPrice`). The cheapest-delivered / disparity engines already use it. The bridge does **not** replace, recompute, or reconcile that price — it sits beside it, adding *which banner explains it* and *when it applies*.
3. **It must preserve the ADR-053 / ADR-043 Deal↔Product decoupling.** Deals live in `data.json` (ingested via `/api/ingest`); products live in `products.json` (product scrapes). They are deliberately separate pipelines on separate cadences. This story is a **third read-only consumer** that reads both and **mutates neither** — modelled exactly on `server/utils/crossStoreValue.ts`. It adds NO field to `Deal` or `ProductRecord` and touches NO write path.

If those three constraints can't hold, stop and raise it — do not widen scope to make the join "richer."

## Acceptance Criteria

1. **Scope parser.** A pure function infers a deal's product scope from `Deal.description` (+ `discountPct` where present), classifying each deal as exactly one of: `storewide`, `category` (one of the 3 scraped categories: Flower / Vaporizers / Pre-Rolls, optionally weight-qualified e.g. Flower@28g for "Ounces"), `unsupported-category` (banner targets Edibles/Drinks/Topicals/Tinctures — real but NOT scraped), `brand` (banner names a brand — DEFERRED, out of this deliverable), or `unresolved` (no confident scope). Storewide detection requires an explicit signal (`storewide`, `store wide`, `entire menu/store`, `everything`, `all products`, `all online orders`); ambiguity resolves to `unresolved`, **never** silently to storewide.
2. **Read-only linker.** Given the deals for a store and that same store's `ProductRecord`s, emit `DealScopeLink`s that connect a deal to the matching in-store SKUs: storewide → all of the store's priced SKUs; category(+weight) → SKUs whose `category` (and canonical weight, reusing `canonicalWeightGrams`) match. Links are **only ever within the same `dispensaryId`**.
3. **Temporal inheritance.** Each link inherits the deal's `daysValid` / `startTime` / `endTime`. A consumer can therefore answer "is SKU X on a banner deal *right now*" using the SAME day/time logic as `filterActiveDeals` (do not re-implement it — reuse or mirror it, documented).
4. **Honesty gates enforced (mirrors `crossStoreValue.ts`).** (a) No banner `discountPct` is ever applied to a product to produce a per-item price or saving. (b) Products carrying an excluded flag (`weight-mismatch` / `unparseable-weight` / `unparseable-pack`) are not linked on a weight-qualified scope. (c) `unsupported-category`, `brand`, and `unresolved` deals link to nothing and are **counted in a report** (never silently dropped, never fanned out storewide). (d) A store with products but a deal whose scope resolves to zero matching SKUs is reported as `zero-match`, distinct from `unresolved`.
5. **Bookkeeping / no silent loss.** The builder returns a report: total deals, counts per scope class, linked-SKU count, and the explicit `unresolved` / `unsupported-category` / `brand` / `zero-match` buckets — the same "every unplaceable item is counted" discipline `buildMatchReport` uses (AC5 there).
6. **Decoupling preserved.** No change to `Deal`, `ProductRecord`, `ProductsFile`, `normalizeDeals`, `filterActiveDeals`, `/api/data`, `/api/ingest`, or any product write path. New code is additive and read-only. `npm run build` (client+server) clean; server suite green + new tests.
7. **(Optional, gate on Erik) Surface.** A private read-only route (e.g. `GET /api/value/deal-scope`) mirroring `valueRoute.ts`, returning the links + report. Build ONLY if Erik confirms he wants a surface this deliverable; otherwise ship the library + tests and stop.

## Tasks / Subtasks

- [x] Task 1 — Scope parser (AC: 1, 4a)
  - [x] `server/utils/dealScope.ts`: `parseDealScope(deal: Deal): DealScope` returning a discriminated union (`storewide` | `category` | `unsupported-category` | `brand` | `unresolved`), with optional `category` + `weightGrams`.
  - [x] Category keyword map → the 3 scraped categories; pre-roll rule BEFORE flower (an "infused pre-roll" banner must not fall through to Flower — mirror the ordering in `_weedmaps.ts` `CATEGORY_RULES`).
  - [x] "Ounce/oz" ⇒ Flower @ 28g (weight-qualified); "eighth/1/8" ⇒ Flower @ 3.5g. Reuse `parseGrams`/`canonicalWeightGrams` — never re-implement weight parsing.
  - [x] Explicit storewide signal set; unsupported-category set (edible/drink/topical/tincture/beverage/gummy/chocolate); brand detection = deferred stub that classifies-and-defers (does not attempt matching).
- [x] Task 2 — Read-only linker + report (AC: 2, 3, 4, 5)
  - [x] `buildDealScopeLinks(data: ApiDataResponse-shape, products: ProductsFile): DealScopeReport` in `server/utils/dealScope.ts` (or a sibling `dealScopeLinks.ts`), modelled on `crossStoreValue.ts` structure (pure, read-only, per-store grouping).
  - [x] Enforce same-store linkage, flag exclusion, temporal inheritance, and the counted buckets.
- [x] Task 3 — Types (AC: 2, 5, 6)
  - [x] Add `DealScope`, `DealScopeLink`, `DealScopeReport` to `server/types/index.ts` in the additive/decoupled block (comment them like the A1 matcher types: "read-only, never touches Deal/ProductsFile write path").
- [x] Task 4 — Tests (AC: all)
  - [x] `server/utils/dealScope.test.ts`: real banner strings ("50% off Ounces", "40% Storewide", "15% Off Edibles + Drinks", "20% OFF ALL ONLINE ORDERS", a brand-named banner) → correct scope class; storewide-ambiguity → `unresolved`; unsupported category counted not linked.
  - [x] Integration test (mirror `server/integration/weedmapsMatcher.test.ts`): fixture deals + fixture products → expected links + report buckets; assert NO storewide fan-out on ambiguous text; assert flagged products excluded on weight-qualified scope.
- [x] Task 5 — (Optional) route (AC: 7) — **Erik confirmed 2026-07-01 (option B).** Built private read-only `GET /api/value/deal-scope` in `server/routes/valueRoute.ts` (sibling of `disparitiesRoute`), wired in `server/index.ts`, mirroring the `/api/value/disparities` posture. Reads RAW deals (NOT `filterActiveDeals`) so links keep their temporal window for `isDealScopeLinkActive`; fail-soft on both file reads. +3 route tests. Live against committed data: 52 deals → 16 links (buckets sum to 52).

## Dev Notes

### The data model, as it actually is (grounded 2026-06-30)
- `Deal` (`client/src/types/index.ts:1`): `{ type, description(free-text), discountPct(number|null), startTime, endTime, daysValid[] }`. **No category/product/SKU field exists.** Scope is only inferable from `description`.
- `ProductRecord` (`server/types/index.ts:80`): `{ productId, dispensaryId, name, category(Flower|Vaporizers|Pre-Rolls), brand, strainType, packCount, flags[], history[] }`; each observation option carries the real `specialPrice`. This is the SKU side of the join.
- Deals reach `data.json` via `applyIngest`/`normalizeDeals` (`server/utils/normalizeDeals.ts`); products reach `products.json` via the product scrapes. **Different files, different cadence** — the reason this must be a read-only consumer, not a pipeline change.

### Pattern to copy (do NOT reinvent)
- `server/utils/crossStoreValue.ts` is the exact template: a pure, read-only consumer of a committed file that groups records and emits a derived fact + a `MatchReport` counting everything it can't place. Copy its shape, its `EXCLUDED_FLAGS` handling, and its "count, never silently drop" discipline.
- `server/utils/productMatchKey.ts` → reuse `canonicalWeightGrams` for the weight-qualified scopes (it already snaps 28g/3.5g and carries the ADR-054 fractional-oz fix).
- `server/utils/filterActiveDeals.ts` → the day/time "active now" logic AC3 inherits; reuse it, don't fork it.
- `server/routes/valueRoute.ts` → shape/registration template if Task 5 is approved.

### What must be preserved (regression surface)
- ADR-043 / ADR-053 decoupling: Deal and Product pipelines stay independent. This story adds a consumer that JOINS them for reading; it must not create a write-time dependency (e.g. product scrape must not require deals present, and vice-versa). If a store has deals but no products (or products but no deals), the builder degrades to empty links for that store — never throws.
- Compliance chokepoint (`sanitizeDescription` at `normalizeDeals`) is upstream and unchanged; the linker reads already-sanitized descriptions.

### Honest-value caveats to keep in the code comments (so this isn't oversold later)
- `fix6-basePrice-verdict.md`: banner `discountPct` = flat promo rate, no per-item signal → the link is explanatory/temporal, not a savings computation.
- The observed `specialPrice` remains the price-of-record; the bridge never overrides or recomputes it.
- `unsupported-category` is load-bearing honesty: banners frequently target Edibles/Drinks we do not scrape (see `value-analysis-2026-06-24.md` §4 — catalog is Flower/Vaporizers/Pre-Rolls only). Linking those to nothing, and counting them, is correct — do not force a match.

### Testing standards
- TypeScript strict; Vitest; server suite must stay green (357+ at last count). New pure functions get unit tests from real banner strings; the join gets an integration test with fixtures. No network in tests (pure functions over committed-shape fixtures, like the existing matcher tests).

### References
- [Source: _bmad-output/implementation-artifacts/investigations/ai-search-data-strategy-investigation.md] — GOAL 1 relations; deal→SKU is the named missing relation.
- [Source: _bmad-output/implementation-artifacts/investigations/fix6-basePrice-verdict.md] — discount% carries no per-item signal (honesty gate 1).
- [Source: _bmad-output/implementation-artifacts/investigations/value-analysis-2026-06-24.md#4] — catalog breadth (only 3 categories) → `unsupported-category` bucket.
- [Source: server/utils/crossStoreValue.ts] — read-only consumer + report pattern to mirror.
- [Source: server/utils/productMatchKey.ts] — `canonicalWeightGrams` reuse.
- [Source: server/utils/filterActiveDeals.ts] — day/time active logic to reuse for AC3.
- [Source: client/src/types/index.ts:1 ; server/types/index.ts:80] — Deal and ProductRecord shapes.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `tsc` build caught a type-only slip vitest erased at runtime: `Dispensary` is exported from `client/src/types/index.ts`, not `server/types/index.ts`. Import moved to the client types module (alongside `Deal`); this also resolved two downstream implicit-`any` params. Lesson reaffirmed: run the real `npm run build`, not just vitest, before calling a story done.

### Completion Notes List

- **AC1–AC7 fully implemented.** AC7 (private route) confirmed + built by Erik 2026-07-01 (option B). Shipped the read-only library + types + private route + tests.
- **Scope parser (`parseDealScope`)** — pure over the `Deal` only (never sees a product/price/discount → a scope can't encode a per-item saving, honesty gate 1). Classification order is deliberate: out-of-catalog cue → scraped category (pre-roll before flower, mirroring `_weedmaps.ts` `CATEGORY_RULES`) → explicit storewide → deferred brand stub → `unresolved`. Out-of-catalog wins over "all" so "all edibles" is edibles-scoped, never a storewide fan-out. Weights come only from `canonicalWeightGrams('1oz')` / `('1/8oz')` → 28g / 3.5g (inherits ADR-054 fractional-oz snap; no re-implemented weight parsing).
- **Linker (`buildDealScopeLinks`)** — mirrors `crossStoreValue.ts`: pre-groups products by store, links only within the same `dispensaryId`, counts every deal into exactly one scope-class bucket, and reports `zeroMatchCount` (resolved-but-no-SKU) as distinct from `unresolvedCount`. Storewide links all *priced* SKUs and INCLUDES flag-carrying records; the `EXCLUDED_FLAGS` drop applies ONLY to weight-qualified scopes (AC4b). `deal.discountPct` is intentionally never read.
- **Temporal (`isDealScopeLinkActive`)** — AC6 forbids editing `filterActiveDeals.ts` and its `isDealActive` isn't exported, so the day/time logic (incl. overnight window + `everyday`) is a documented MIRROR that must stay in sync. Links carry the inherited `daysValid`/`startTime`/`endTime`.
- **Decoupling preserved (AC6)** — zero change to `Deal`, `ProductRecord`, `ProductsFile`, `normalizeDeals`, `filterActiveDeals`, `/api/data`, `/api/ingest`, or any write path. New code is additive + read-only. Degrades to empty links (never throws) for a store with deals but no products.
- **Validation** — 27 new tests (15 unit + 12 integration... 7 integration cases). Full server suite **384 passed** (was 357). `npm run build` (client + server `tsc` + copyData) clean.
- **AC7 (RESOLVED, built):** Erik chose option B — private read-only `GET /api/value/deal-scope` (`dealScopeRoute` in `valueRoute.ts`, mirroring `disparitiesRoute`, reading `data.json` + `products.json`). Private/internal only — no public page or schema.org markup (Phase 4, legal-gated). Uses RAW deals (not `filterActiveDeals`) so temporal windows survive for `isDealScopeLinkActive`.

### File List

- `server/types/index.ts` (modified) — added `ScrapedCategory`, `DealScope`, `DealScopeLink`, `DealScopeReport` in the additive/decoupled block.
- `server/utils/dealScope.ts` (new) — `parseDealScope`, `buildDealScopeLinks`, `isDealScopeLinkActive` + helpers.
- `server/utils/dealScope.test.ts` (new) — parser + temporal unit tests over real banner strings.
- `server/integration/dealScopeLinks.test.ts` (new) — fixture join: links, buckets, honesty behaviours.
- `_bmad-output/implementation-artifacts/deal-sku-bridge.md` (modified) — story tracking.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — status → in-progress → review.

## Change Log

- 2026-06-30 — Implemented deal→SKU scope bridge (AC1–AC6): read-only scope parser + linker + report + temporal mirror, modelled on `crossStoreValue.ts`; additive types; 27 tests; server suite 384 green; build clean. AC7 (route) deferred pending Erik. (dev-story)
