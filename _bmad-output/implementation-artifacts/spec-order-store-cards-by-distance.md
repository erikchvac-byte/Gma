---
title: 'Order store cards by distance (closest first)'
type: 'feature'
created: '2026-06-20'
status: 'done'
context: []
baseline_commit: 'f64097c3380feb4b109b588c1f7cb0cf3af564c3'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The feed lists one card per store, but stores are ordered by their best (highest-priority) deal — so a far store with a great deal sits above a closer one. The user wants the card list ordered by how close each store is.

**Approach:** After grouping deals into one card per store, sort the store cards by `dispensary.distanceMiles` ascending (closest first). Deal order *within* each store, and every existing filter, stay exactly as they are. This supersedes only the store-ordering rule from ADR-038.

## Boundaries & Constraints

**Always:**
- Order store cards by `distanceMiles` ascending (nearest first).
- Equal distances keep their existing best-deal relative order — rely on a stable sort over the current insertion order; do not re-derive a secondary key.
- Deals inside a store stay in `sortDeals` order (urgency/discount tiers untouched).
- Preserve the full pipeline unchanged: stale omission → distance filter → per-deal expiry → chip filter → group → (new) distance sort.

**Ask First:**
- Any change to the per-deal `sortDeals` tier algorithm, or to distance/stale/expiry/chip filtering.

**Never:**
- No new network calls. No changes to `Dispensary`/`Deal` data shape, the API, or the `gma_distance_miles` key/validation. No re-sorting of deals within a store. No new distance guard beyond what the existing distance filter already assumes (`distanceMiles` is a finite number).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stores at different distances | A=12 mi, B=5 mi (A has the better deal) | B card first, A second | N/A |
| Equal distances | A & B both 5 mi, B's best deal outranks A's | B first, A second (best-deal tie-break preserved) | N/A |
| Single store | one store with deals | one card, unchanged | N/A |
| Dealless store | store with no active deals | omitted before sort (no empty card) | N/A |
| All dealless | every store empty after filters | empty array → "No active deals right now" | N/A |

</frozen-after-approval>

## Code Map

- `client/src/utils/sortDeals.ts` -- `groupDealsByStore()` builds the `StoreGroup[]` via an insertion-ordered Map (currently = best-deal order). Add a final stable sort by `dispensary.distanceMiles` ascending on the returned array.
- `client/src/utils/sortDeals.test.ts` -- `groupDealsByStore` describe block; helper `makeDispensary(id, deals)` hardcodes `distanceMiles: 5`. Add an optional distance param and distance-ordering + tie-break tests.
- `client/src/components/DealFeed.tsx` -- consumer only; no change (already renders `storeGroups` in array order).
- `client/src/components/DealFeed.test.tsx` -- existing test at L110 ("stores in best-deal order") uses two stores both at 5 mi, so it still passes as the tie-break case; retitle its comment and add a distance-ordering test.
- `ADR.md` -- add ADR-039 superseding the store-ordering portion of ADR-038.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/sortDeals.ts` -- in `groupDealsByStore`, replace `return [...groups.values()]` with a stable sort by ascending `distanceMiles`: `return [...groups.values()].sort((a, b) => a.dispensary.distanceMiles - b.dispensary.distanceMiles)`. Update the function's doc comment: stores are now ordered by distance, with best-deal order as the (stable) tie-break.
- [x] `client/src/utils/sortDeals.test.ts` -- extend `makeDispensary` to accept an optional `distanceMiles` (default 5, keeping existing calls valid). Add: (a) a test that the closer store comes first even when a farther store has the higher-priority deal; (b) a tie-break test that equal-distance stores keep best-deal order. Keep existing grouping/omission tests passing.
- [x] `client/src/components/DealFeed.test.tsx` -- update the L110 test's comment to note both stores are equidistant (tie-break → best-deal order). Add a test with differing distances asserting the closer store's card renders first (`getAllByRole('listitem')` order).
- [x] `ADR.md` -- append ADR-039 (Accepted, 2026-06-20): store cards ordered by distance ascending, best-deal order as tie-break; supersedes the store-ordering rule of ADR-038 (deal-within-store order and 50 mi default unchanged). Update the change log.

**Acceptance Criteria:**
- Given several stores at different distances, when the feed renders, then store cards appear nearest-first regardless of which store has the best deal.
- Given two stores at the same distance, when the feed renders, then they retain their best-deal relative order.
- Given any store with multiple deals, when its card renders, then its deals are still in `sortDeals` order.
- Given the existing suite, when `npm test` / `npm run build` / `npm run lint` run in `client/`, then all pass clean.

## Design Notes

`Array.prototype.sort` is stable (ES2019+, Node ≥ 11), so sorting the already-best-deal-ordered groups by distance yields "closest first, best-deal as tie-break" for free — no composite key needed:

```ts
return [...groups.values()].sort(
  (a, b) => a.dispensary.distanceMiles - b.dispensary.distanceMiles,
)
```

`distanceMiles` is already trusted as a finite number by the distance filter in `DealFeed.tsx`, so no extra guarding is added here (consistency over defensive duplication).

## Verification

**Commands:**
- `cd client && npm test` -- expected: all suites pass
- `cd client && npm run build` -- expected: tsc + vite build succeed (strict, no type errors)
- `cd client && npm run lint` -- expected: clean

**Manual checks:**
- Run the app; with stores at varying distances, the card list reads top-to-bottom nearest → farthest.

## Suggested Review Order

**Distance ordering (the whole change)**

- Entry point — trailing stable sort by distance; comment explains the tie-break.
  [`sortDeals.ts:57`](../../client/src/utils/sortDeals.ts#L57)

**Tests (supporting)**

- Unit proof: closer store wins over a farther store with the better deal.
  [`sortDeals.test.ts:147`](../../client/src/utils/sortDeals.test.ts#L147)

- Unit proof: equidistant stores keep best-deal order (tie-break).
  [`sortDeals.test.ts:165`](../../client/src/utils/sortDeals.test.ts#L165)

- Feed-level proof: nearest store's card renders first.
  [`DealFeed.test.tsx:161`](../../client/src/components/DealFeed.test.tsx#L161)
