---
baseline_commit: 85da4db4f579614b70051741b4f587bcf1e21c9c
---

# Story derivation-2.3: Regional price floor + availability gap (D8 / FR15)

Status: done

Epic: epic-derivation-2 (Accrual facts) — third and final story. Source: `_bmad-output/planning-artifacts/epics-derivation-engine.md` (Epic 2 — Story 2.3), PRD `prds/prd-Happy-2026-07-06/prd.md` FR15/Gate 1.

## Story

As a data consumer,
I want per-cluster price floors per match-key and category-level availability gaps,
So that regional value and coverage holes are queryable facts without dishonest cross-product price claims.

The fact has two halves sharing one geo-cluster spine: (a) **floors** — for each geo cluster of stores, the lowest observed price per like-for-like cell (match-key + canonical weight), a Gate-1-honest claim because it is a min WITHIN a same-product cell, never across products or a whole category; (b) **availability gaps** — per cluster, which product categories are present at no member store (presence/absence only, never a category-level price claim).

## Design decisions (bound — do not re-derive)

**Structural posture: third sibling of 1.4/2.2 — a pure function over already-computed runner inputs.** No DB read, no weight parse, no price reduction, no match-key derivation:

- **Floors input is the shared `Disparity[]` oracle** (`report.disparities`), exactly like 1.4/2.2. A `Disparity` is by construction a same-product, same-canonical-weight, ≥2-store cell whose per-store `price` is the reduced `specialPrice ?? basePrice`, sold-out excluded, mg-parse screened (`WEIGHT_BASED_CATEGORIES` + `EXCLUDED_FLAGS` + `canonicalWeightGrams` all ran upstream in `buildMatchReport`). Gate 1 and the weight gates hold by inheritance. Do NOT import `canonicalWeightGrams` or re-parse anything.
- **Availability input is a NEW narrowed presence record `{ dispensaryId, category }`**, projected from `productsFile.products` at the runner boundary (decision-F pattern: the projection is the only place the full `ProductRecord` is visible; the pure fn never sees prices, the base/special pair, or potency — the FR16 breach does not compile).
- **Geo comes ONLY from the 1.4 `StoreGeoLookup`** (`buildStoreGeoLookup(dispensaries, WEEDMAPS_STORES)`, already built in-scope in the runner). No second geo source (AC1 verbatim). Null/absent geo → store is unclustered, counted, never defaulted to 0,0 (1.4 discipline).
- **Extraction-health gates the GAP claims** (Gate-4 spirit, mirrors 1.7): a gap is an ABSENCE assertion ("no store in this region carries category X"), which is dishonest if a member store's extraction silently broke. Reuse the in-scope `storeStatus` map (built for 1.7 from `extractionHealth.entries`): a cluster containing ≥1 `suspected` store emits `availabilityGaps: []` + `gapsSuppressed: true` and is counted in `excluded[]`. Floors are POSITIVE claims ("lowest observed in cluster") and stay emitted — missing data can only make a min conservative, never a lie. `insufficient-history` does NOT suppress (a young store's today-records are real; it lacks a trailing median, not today's data).

**Clustering algorithm (bound): single-linkage agglomeration via union-find over pairwise haversine distance, threshold `<= CLUSTER_RADIUS_MILES` (inclusive).** Deterministic regardless of input order (union by canonical/lexicographic root, or re-derive groups from find() at the end — either, so long as tests prove order-insensitivity). Cluster universe = distinct `dispensaryId`s appearing in the presence records that have resolvable geo (a store with products but no geo is unclustered + counted; a geo-only store with no products is not a region member).

- **Local haversine in this module** — great-circle miles, `EARTH_RADIUS_MILES = 3958.8` (numerically identical to `client/src/utils/distance.ts`). The server CANNOT runtime-import client code: every existing server→client import is `import type` only (verified across the whole server tree); a value import would be a new build-boundary crossing. Do NOT apply the client's ×1.3 road factor — clustering is a geometric grouping claim, not a delivered-cost claim; the road factor stays client-side where user-facing distance/gas lives (ADR-057 posture preserved, no second user-facing distance formula created).
- **`CLUSTER_RADIUS_MILES` is a named exported constant Erik ratifies at dev-start** (2.1 ratification precedent). Recommendation: **10** — grounded against the 22 live geo-resolved stores it yields 4 honest regions: Bellingham (5), Everett/Lynnwood/Arlington corridor (11), Skagit/Anacortes (5), Oak Harbor (1 — a LIVE single-store cluster, the AC's named edge case). At 12–15 mi Oak Harbor merges into Skagit (3 clusters); at 20 mi single-linkage chains all 22 stores into one mega-cluster (the known chaining failure mode — stay well under it).
- **Cluster identity is deterministic**: `clusterId` = lexicographically-first member `dispensaryId`; `memberDispensaryIds` sorted; centroid = arithmetic mean lat/lng rounded 4dp (consumer convenience only, no claim).

**Floor semantics (bound):**

- Per (cluster × Disparity): `offersInCluster` = `storesCarrying` filtered to cluster members. If ≥1 offer, emit a floor row `{ matchKey, displayName, category, weightGrams, floorPrice, floorDispensaryIds, storeCountInCluster }`. `floorPrice` = min offer price, passed through verbatim (reconciles byte-for-byte with `disparities.json`, 2.2 precedent). `floorDispensaryIds` = ALL stores tied at the min, sorted (1.4's tie lesson: never crown one store on a tie).
- **A single-store-in-cluster floor IS emitted**, with `storeCountInCluster: 1` explicit and counted in `singleStoreFloorCount`. Rationale: the claim is "lowest price OBSERVED in this cluster for this exact product+weight" — true at n=1 and exactly what "cheapest X near me" needs; suppressing it would fabricate regional holes that contradict the availability half. The honesty is the explicit count, so no cross-store comparison is implied.
- A Disparity with NO offers in a cluster simply contributes no row there (it is not an exclusion — the ≥2-store property is global to the oracle, not per-cluster).

**Availability-gap semantics (bound):**

- `categoryUniverse` = sorted distinct categories across ALL presence records this run (data-derived — never a hardcoded list; we never assert a gap for a category we don't collect). Live universe today = the 5 collected categories (Pre-Rolls, Flower, Vaporizers, Edible, Concentrate) but the code must not assume it.
- Per cluster: `categoriesPresent` = sorted distinct categories over member stores' presence records; `availabilityGaps` = universe − present (sorted). Empty universe (no products at all) → no gap claims anywhere.
- Presence is cross-sectional over the record's existence (like 1.6's availability posture) — no time-series, no 1.2 helper, no gap logic.

**Artifact naming:** module `server/utils/regionalPriceFloor.ts`, artifact `server/data/derived/regional-price-floor.json` (availability gaps are the category-level section of the same D8 fact, inside the same artifact).

## Acceptance Criteria

(Verbatim from epics doc, with grounded implementation bindings in brackets.)

1. **Given** store lat/lng, **when** geo clusters are derived, **then** clustering uses 1.4's merged geo lookup (no second geo source). [The runner passes the in-scope `geoLookup` (`buildStoreGeoLookup(dispensaries, WEEDMAPS_STORES)`, deriveFactsRun.ts:242) into the pure fn. The module never imports a registry or reads coordinates from anywhere else; unresolved geo → unclustered + counted, never 0,0.]
2. **Given** price floors, **then** each floor is computed per match-key WITHIN a cluster only (Gate 1); no cross-product or whole-category price floor exists. [Floors derive exclusively from `Disparity` cells (same-product + same-canonical-weight by construction) filtered to cluster members; the report has NO field aggregating price across match-keys or across a category — the shape makes the dishonest claim inexpressible.]
3. **Given** the category level, **then** it reports availability gaps only — presence/absence of a category in a cluster — never a category-level price claim. [The presence input type carries `{ dispensaryId, category }` and nothing else; a category price cannot be computed from it. Gap claims additionally suppressed for clusters containing a `suspected` extraction-health store (Gate-4 spirit, 1.7 precedent).]
4. **Given** the input type (FR16 gate), **then** potency fields and the flat banner rate are unreachable. [Floors reuse the shared `Disparity`/`DisparityStore` (no pair/discount/potency — narrowed once upstream); presence is the new two-field record. `@ts-expect-error` compile tests assert `thc`/`discountPct`/base+special pair are not assignable (pattern: `brandStoreMatrix.test.ts:170-178`).]
5. **Given** the fact, **then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests covering single-store-cluster and empty-category cases (NFR6). [Envelope via `wrapEnvelope`; `excluded[]` restates the pure fn's own counters (`unclusteredStore`, `suppressedGapCluster`) — never invented at the wiring point. Single-store-cluster: emitted floor with `storeCountInCluster: 1` + `singleStoreFloorCount`. Empty-category: a category absent from a healthy cluster appears in `availabilityGaps`; an empty universe emits no gaps at all.]

## Tasks / Subtasks

- [x] Task 1 — Pure fact module `server/utils/regionalPriceFloor.ts` (AC: 1, 2, 3, 4, 5)
  - [x] Input types: shared `Disparity[]` (`import type { Disparity } from '../types/index.js'`), `StoreGeoLookup` (`import type` from `./disparityRollups.js`), `StoreHealthStatus` map (`import type { StoreHealthStatus } from './extractionHealth.js'`, 1.7 precedent), and a NEW exported narrowed `StoreCategoryPresence { dispensaryId: string; category: string }`.
  - [x] Exported ratified constant `CLUSTER_RADIUS_MILES` (Erik ratifies value at dev-start; recommended 10) + local `EARTH_RADIUS_MILES = 3958.8` haversine (no road factor — see Design decisions; do NOT import client code at runtime).
  - [x] Export `buildRegionalPriceFloorReport(disparities, presence, geoLookup, storeStatus): RegionalPriceFloorReport`.
  - [x] Clustering: union-find single-linkage, threshold `<=` radius, deterministic (order-insensitive); universe = presence stores with resolvable geo; `clusterId` = first sorted member; centroid mean 4dp; unclustered (null/absent geo) stores counted `unclusteredStoreCount` and excluded from floors + presence aggregation.
  - [x] Floors per (cluster × Disparity) per Design decisions: min-price row with sorted tie list, verbatim prices, `storeCountInCluster`, `singleStoreFloorCount` counter; no cross-match-key/category price aggregate anywhere in the shape.
  - [x] Gaps per Design decisions: data-derived sorted `categoryUniverse`; per-cluster `categoriesPresent`/`availabilityGaps`; `gapsSuppressed` + empty gaps for clusters with ≥1 `suspected` member; `suppressedGapClusterCount` counter.
  - [x] Report shape: `{ clusters: [{ clusterId, memberDispensaryIds, centroidLat, centroidLng, storeCount, floors, categoriesPresent, availabilityGaps, gapsSuppressed }], categoryUniverse, totalClusters, clusteredStoreCount, unclusteredStoreCount, totalFloors, singleStoreFloorCount, suppressedGapClusterCount }`. Stable sorts: clusters by `clusterId`; floors by `matchKey` then `weightGrams`; all id/category lists sorted.
  - [x] Module header (sibling style): pure consumer of oracle + presence + geo + health (FR15), Gate 1 by inheritance, gaps-not-prices at category level, suppression rationale, no-runtime-client-import note.
  - [x] Tests (strict-typed, NFR6) in `regionalPriceFloor.test.ts`: two-stores-just-inside vs just-outside radius (boundary `<=` inclusive); transitive chaining (A–B, B–C within radius, A–C outside → one cluster); input-order insensitivity; single-store cluster emits floor with `storeCountInCluster: 1` + counter; floor min + tie list; Disparity with no offers in a cluster contributes no row; null-geo store unclustered + counted, contributes nothing; availability gap emitted for absent category; empty universe → no gaps; `suspected` member → `gapsSuppressed`, empty gaps, counter (floors still emitted); `insufficient-history` member does NOT suppress; empty inputs; `@ts-expect-error` FR16 gates. (14 tests, all green.)
- [x] Task 2 — Runner wiring in `server/scripts/deriveFactsRun.ts` (AC: 1, 3, 4, 5)
  - [x] Project presence at the boundary: `Object.values(productsFile.products).map((r) => ({ dispensaryId: r.dispensaryId, category: r.category }))` — decision-F comment (the ONLY place the full record is visible).
  - [x] Reuse in-scope `report.disparities`, `geoLookup`, and the 1.7 `storeStatus` map (both already built in scope — passed straight in, no rebuild, no re-read). Zero new DB access.
  - [x] Wrap in `wrapEnvelope` (`excluded` = `[{unclusteredStore}, {suppressedGapCluster}]`, `coverage` = `{ totalClusters, clusteredStoreCount, totalFloors, singleStoreFloorCount, categoryUniverseSize }`); write `regional-price-floor.json` via `atomicWriteJson` LAST, after the cheapest-delivered write (1.2.5 write-ordering discipline).
  - [x] Add `regionalPriceFloorPath` + `regionalClusterCount` / `regionalFloorCount` / `regionalSingleStoreFloorCount` / `regionalUnclusteredStoreCount` / `regionalSuppressedGapClusterCount` to `DeriveOutcome` + `main()` console line.
  - [x] Extend `deriveFactsRun.test.ts`: artifact written + envelope-shaped; seam proof — an Edible record contributes presence (universe includes `Edible`) but NO floor (Edible never survives to a `Disparity`; Gate 1/5 inheritance observable at the boundary).
- [x] Task 3 — Commit-list + docs (AC: 5; load-bearing ops lesson)
  - [x] **Append `'server/data/derived/regional-price-floor.json'` to `$derivedFiles` in `scripts/derive-facts-local.ps1`** (load-bearing — six-facts-stranded lesson; merge promptly after, per the 2.2 review's skew-window ruling).
  - [x] NO new route, NO client change, NO `data.json` change. 1.8 freshness covers the artifact via the envelope's `generatedAt` — zero alerting work.
  - [x] ADR-086 (Accepted): clustering choice (single-linkage, radius constant, local haversine no-road-factor, client-import boundary), floor/gap semantics, suppression rule; cross-ref ADR-057/084/085/077; change-log row.
- [x] Task 4 — Verify (AC: all)
  - [x] Full server suite green (676/676) + real `npm run build` clean (server `tsc` enforces the `@ts-expect-error` FR16 gates + client `vite build`).
  - [x] Live-data proof over COMMITTED artifacts (home `products.db` is empty — 2.2 precedent): pure fn over committed `disparities.json` + real `geoLookup`, presence approximated from disparity cells' (store, category) pairs. Result at radius 10: **4 clusters (sizes 1/5/5/11)**, `kaleafa-oak-harbor` the live single-store cluster, unclustered 0 (all 22 geo-resolved), **432 floors reconcile byte-for-byte with `disparities.json` — 0 mismatches**. Committed `server/data/derived/` stayed byte-identical (`git status` clean).

## Dev Notes

### Grounding vs the live committed artifacts (read + computed 2026-07-12)

- **`disparities.json`** (generatedAt 2026-07-12T11:00:03Z): 305 cells / 684 store-offers / 22 distinct stores; categories Flower 138 / Vaporizers 111 / Concentrate 38 / Pre-Rolls 18 (all `WEIGHT_BASED_CATEGORIES`; zero Edible — the seam proof's premise is live).
- **`disparity-rollups.json`** `byStore`: all 22 stores geo-resolved (`missingGeo: 0`) — the clustering input is complete today; `unclusteredStoreCount` should be 0 live.
- **Single-linkage grounding (computed against the real 22 coords)**: radius 8 → 6 clusters; **10 → 4 clusters** (Bellingham 5, Everett/Lynnwood/Arlington 11, Skagit/Anacortes 5, Oak Harbor 1); 12–15 → 3 (Oak Harbor merges into Skagit); 20 → 1 mega-cluster (chaining). Radius 10 recommended: real regions AND a live single-store cluster (`kaleafa-oak-harbor`) exercising the AC edge case in production data.
- **Presence half cannot be grounded from committed artifacts** (Edible/full-catalog presence lives only in `products.db`, currently empty at home). Universe = the 5 collected `DEFAULT_PRODUCT_CATEGORIES` once feeders repopulate; code derives it from data, never hardcodes.

### Semantics decisions (bound here so dev doesn't re-derive)

- Floors are min-within-same-product-cell only; ties all listed; single-store floors emitted with explicit count; prices verbatim (reconcile with `disparities.json`).
- Gaps are presence/absence only; universe data-derived; suppressed (not silently dropped — flagged + counted) for clusters with a `suspected` store; `insufficient-history` never suppresses.
- No `today`, no time-series, no 1.2 helper — cross-sectional like 1.4/1.6/2.2.
- Haversine local, R=3958.8, no ×1.3 road factor; radius constant ratified at dev-start.

### Architecture compliance (guardrails)

- **Pure consumer, no new derivation** (FR15 posture): grouping/clustering/min only; all price honesty inherited from `buildMatchReport`.
- **Reuse, don't recompute, in the runner:** `report.disparities`, `geoLookup`, `storeStatus` all already in scope; presence is a boundary projection, not a second DB read.
- **Write-ordering discipline (1.2.5 review):** new artifact written LAST; never gate a pre-existing `atomicWriteJson` on the new step.
- **Envelope counters restate the pure fn's own numbers** — never invented at the wiring point.
- **Additive only (NFR5):** new module + test + runner block + ps1 line + ADR. No `data.json`/deals/route/client change; other 10 artifacts stay byte-identical given the same DB.
- **Node-only boundary:** pure util, no I/O, no DB import, no runtime client import; served as committed file only.
- **TypeScript strict, ESM `.js` import suffixes** (sibling convention).

### Previous-story intelligence (carry-ins)

- **1.4 (`disparityRollups.ts`)**: geo-lookup discipline (null counted, never defaulted), tie lesson (zero-spread rows: never crown cheapest on a tie — 2.3's floors list ALL tied stores), pre-built-lookup testability pattern.
- **2.2 (`cheapestDelivered.ts`)**: the primary structural sibling — gates by inheritance from `Disparity`, verbatim price pass-through, live-proof-over-committed-artifacts verification (DB empty), `$derivedFiles` append load-bearing, write-LAST.
- **1.7 (`newArrivalDormancy.ts`)**: the `storeStatus` suppression pattern for absence claims (Gate-4 spirit) — 2.3's gap suppression mirrors it exactly.
- **2.1 (`priceVsOwnMedian.ts`)**: ratified-constants pattern (`CLUSTER_RADIUS_MILES` mirrors `ROLLING_WINDOW_DAYS`), decision-F boundary projection, `@ts-expect-error` compile gates under real `tsc`.
- **2.2 review**: `canonicalWeightGrams` 0-weight→null patch already merged (floors' `weightGrams` trustworthy); ps1 skew window → merge promptly after appending to `$derivedFiles`.
- **Process:** PR closeout = push + `gh pr create` + self-merge (pre-authorized); verify squash-merged fileset on origin/master; run the REAL `npm run build` before push.

### Project Structure Notes

- New: `server/utils/regionalPriceFloor.ts`, `server/utils/regionalPriceFloor.test.ts`, `server/data/derived/regional-price-floor.json` (generated).
- Modified: `server/scripts/deriveFactsRun.ts` (presence projection, wiring, `DeriveOutcome`, console line), `server/scripts/deriveFactsRun.test.ts` (integration + Edible seam proof), `scripts/derive-facts-local.ps1` (`$derivedFiles` append — load-bearing), `ADR.md` (ADR-086 + change-log).
- Naming mirrors siblings (`cheapestDelivered.ts` / kebab artifact).

### References

- Epics: `_bmad-output/planning-artifacts/epics-derivation-engine.md` §Epic 2 — Story 2.3
- Geo merge (the ONLY geo source): `buildStoreGeoLookup` in `server/utils/disparityRollups.ts:59-75`; `StoreGeoLookup` type at :47
- Disparity oracle + inherited gates: `server/utils/crossStoreValue.ts`; `Disparity`/`DisparityStore` in `server/types/index.ts:150-174`
- Suppression precedent: `server/utils/newArrivalDormancy.ts` + `storeStatus` map at `deriveFactsRun.ts:347-349`
- Ratified-constant precedent: `server/utils/priceVsOwnMedian.ts:29-35`
- Haversine numeric reference (do NOT runtime-import): `client/src/utils/distance.ts` (R=3958.8; road factor deliberately not copied)
- Envelope: `server/utils/derivedEnvelope.ts`; `@ts-expect-error` gate pattern: `server/utils/brandStoreMatrix.test.ts:170-178`
- Runner ops: `scripts/derive-facts-local.ps1:50-60` (`$derivedFiles` lesson)

## Questions for Erik

One dev-start ratification (2.1 precedent), non-blocking otherwise: **`CLUSTER_RADIUS_MILES`**. Recommended **10** (4 live clusters: Bellingham 5 / Everett-corridor 11 / Skagit 5 / Oak Harbor 1 — includes a real single-store cluster). Alternatives: 8 (6 finer clusters, splits Skagit from Anacortes), 12–15 (3 clusters, Oak Harbor absorbed into Skagit). 20 collapses everything into 1 mega-cluster — avoid.

**RATIFIED 2026-07-12 (Erik): `CLUSTER_RADIUS_MILES = 10`.**

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow).

### Debug Log References

- One pre-written RED-phase fixture bug surfaced on first GREEN run: the centroid test placed two
  stores at a diagonal `≈10.10 mi` (`lat +0.13°, lng +0.1°`) — just OUTSIDE the ratified 10-mi
  radius — while asserting they merge into one cluster. Verified numerically (`node` haversine, R=3958.8)
  that `+0.1` lng → 10.0996 mi and `+0.05` lng → 9.2742 mi. Corrected the fixture's lng offset
  (`+0.1 → +0.05`) rather than bend the client-identical haversine or the ratified radius; the module
  is faithful to the bound spec. All 14 pure-fn tests then green.

### Completion Notes List

- **Task 1** — `server/utils/regionalPriceFloor.ts`: pure fn `buildRegionalPriceFloorReport`, third
  sibling of 1.4/2.2. Union-find single-linkage clustering (connected components read off `find()`
  roots → input-order insensitive), local haversine `R=3958.8` (no ×1.3 road factor, no runtime
  client import), `CLUSTER_RADIUS_MILES=10` (Erik-ratified). Floors = min WITHIN a Disparity cell
  (Gate 1 inherited), verbatim price, all tied stores listed, single-store floors emitted+counted.
  Gaps = data-derived universe minus per-cluster presence; suspected-member suppression (1.7 pattern),
  insufficient-history never suppresses; null/absent-geo store unclustered+counted. 14 tests green.
- **Task 2** — runner wiring: presence projected `{ dispensaryId, category }` at the boundary
  (decision F), reuses in-scope `report.disparities` + `geoLookup` + the 1.7 `storeStatus` map (no
  rebuild, no re-read), written LAST via `atomicWriteJson`, enveloped. `DeriveOutcome` + console line
  extended. 2 integration assertions added (envelope-shaped artifact; Edible seam proof — universe
  carries 'Edible', totalFloors 0). Server suite 676/676 green.
- **Task 3** — `regional-price-floor.json` appended to `$derivedFiles` (load-bearing); ADR-086
  (Accepted) + change-log row.
- **Task 4** — real `npm run build` clean (server `tsc` enforced the FR16 `@ts-expect-error` gates,
  client `vite build` succeeded); live-data proof over committed `disparities.json` reproduced the
  story's grounded prediction exactly (4 clusters 1/5/5/11, Oak Harbor single-store, 432 floors, 0
  reconciliation mismatches); committed `server/data/derived/` byte-identical (guard held).
- Additive-only: no route, no client, no `data.json`, no change to the other 10 facts' outputs.

### File List

- **Added**: `server/utils/regionalPriceFloor.ts`, `server/utils/regionalPriceFloor.test.ts` (test
  authored in an earlier RED-phase session; fixture corrected this session).
- **Modified**: `server/scripts/deriveFactsRun.ts`, `server/scripts/deriveFactsRun.test.ts`,
  `scripts/derive-facts-local.ps1`, `ADR.md`.
- **Generated (not committed here; home `products.db` empty)**: `server/data/derived/regional-price-floor.json`.

## Change Log

- 2026-07-12: Implemented (bmad-dev-story). New pure fact `regionalPriceFloor.ts` + runner wiring +
  `$derivedFiles` append + ADR-086. 14 pure-fn tests + 2 runner integration assertions; server suite
  676/676 green, real build clean. Live-data proof over committed `disparities.json`: 4 clusters
  (1/5/5/11), `kaleafa-oak-harbor` single-store cluster, 432 floors reconcile byte-for-byte (0
  mismatches). Corrected a pre-written centroid-test fixture (diagonal ≈10.10 mi just outside the
  ratified radius while asserting a merge; lng offset +0.1→+0.05). Status → review.
- 2026-07-12: `CLUSTER_RADIUS_MILES = 10` ratified by Erik at dev-start.
- 2026-07-12: Story created (create-story workflow). Grounded against committed `disparities.json`/`disparity-rollups.json` (305 cells / 22 stores, all geo-resolved) + a real single-linkage clustering run over the live coordinates (radius sweep 8–20 mi; 10 mi → 4 regions incl. a live single-store cluster). Bound: third sibling of 1.4/2.2 (pure fn over oracle + narrowed presence + geo lookup + health map), union-find single-linkage clustering with dev-start-ratified radius, local haversine (server cannot runtime-import client), floors = min-within-cell with ties listed and single-store floors emitted+counted, gaps = data-derived universe with suspected-store suppression (1.7 pattern). Home `products.db` empty (pre-existing) — verification path bound to committed-artifact proof, 2.2 precedent.

## Review Findings

3-layer adversarial code review 2026-07-12 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 5 ACs and every bound design decision verified met; 10 findings dismissed as noise/upstream-guaranteed/spec-bound. Actionable:

- [x] [Review][Patch] Internal collation inconsistency — `memberDispensaryIds`/`floorDispensaryIds` use bare `.sort()` (UTF-16 code-unit) while `clusters`/`floors` use `.localeCompare`. Since `clusterId = memberIds[0]` (code-unit min) but `clusters[]` is ordered by `localeCompare`, the chosen "lexicographically-first" member and the emitted array order can disagree for ids with hyphens/digits; direct sibling `cheapestDelivered.ts` uses `localeCompare` throughout. Align the id-list sorts to `localeCompare`. [server/utils/regionalPriceFloor.ts:199,214,261] — FIXED: all four string sorts (categoryUniverse, memberIds, floorDispensaryIds, categoriesPresent) now use `localeCompare`, matching the clusters/floors sorts and the sibling.
- [x] [Review][Patch] Non-finite coordinate not guarded — a `{lat:NaN}`/`Infinity` geo passes the `if (geo)` truthiness check (type permits it; `buildStoreGeoLookup` only checks `typeof === 'number'`), enters clustering as a phantom singleton (`haversine` → NaN, never unions) with a `NaN` centroid. Extend the guard to `Number.isFinite(lat) && Number.isFinite(lng)`; non-finite → unclustered + counted (1.4 discipline). [server/utils/regionalPriceFloor.ts:172] — FIXED: guard extended to `Number.isFinite` on both lat/lng; non-finite → unclustered + counted. New test asserts NaN/Infinity stores are unclustered, not phantom singletons.
- [x] [Review][Patch] Missing spec-enumerated test "empty universe → no gaps on a populated cluster" — the existing empty-inputs test yields zero clusters, so the `availabilityGaps = categoryUniverse.filter(...)` path on a real cluster with an empty universe is never exercised. Add the test. [server/utils/regionalPriceFloor.test.ts:321] — FIXED: the literal case (populated cluster + empty universe) is structurally UNREACHABLE (a cluster is built from presence stores, each carrying a category ⇒ non-empty universe). Added the reachable equivalent instead: a fully-stocked cluster whose members cover the whole universe → `availabilityGaps: []` (the empty-gaps branch of the filter on a real cluster). Pure-fn tests now 16.
- [x] [Review][Defer] Floors can inherit a stale price from a `suspected-extraction-failure` store — the shared oracle `buildMatchReport` uses each product's latest observation with no "today" gate (`crossStoreValue.ts:96`, `rec.history.at(-1)`), so a partially-broken store's un-refreshed products keep an earlier day's price and can set a cluster floor. [server/utils/crossStoreValue.ts:96] — deferred, pre-existing (oracle-wide; affects disparities.json / cheapest-delivered.json / rollups identically, not introduced by 2.3).
