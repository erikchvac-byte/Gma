---
title: 'Group deals by store + default radius to 50 mi'
type: 'feature'
created: '2026-06-19'
status: 'done'
context: []
baseline_commit: '1d423e6a2befbab4fe908be9f4e04d1caba6713d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The feed renders one card per deal, so a store with multiple active deals appears as several separate cards with its name, distance, and gas cost repeated. The distance slider also defaults to 25 mi, narrower than the coverage area.

**Approach:** Consolidate the feed into one card per store that lists all of that store's active deals together (store name, distance, and "to get there" gas cost shown once in the header; per-deal badge/discount/window/countdown listed below). Change the slider's default to 50 mi for users with no saved preference.

## Boundaries & Constraints

**Always:**
- Reuse the existing `sortDeals` tier logic. Stores are ordered by their best (highest-priority) deal; deals within a store keep the same sort order.
- Preserve all existing filters in order: stale omission → distance filter → per-deal expiry → sort. Stale count stays independent of the distance filter.
- Gas cost ("$X to get there") and distance are per-store — render once per card, not per deal.
- Keep one `<li>`/listitem per store (the card). Deals inside a card must NOT be `listitem`s.
- Keep the single source of truth for the slider range/default in `DistanceFilter.tsx` (`DEFAULT_DISTANCE_MILES`).

**Ask First:**
- Any change to the deal sort/tier algorithm itself, or to how distance/stale filtering works.

**Never:**
- No per-deal cards. No new network calls. No changes to API/types' data shape (`Dispensary`/`Deal` stay as-is). No change to the persisted `gma_distance_miles` key or its validation range (1–50).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Store with multiple active deals | dispensary with 3 active deals | ONE card; 3 deals listed inside, in sort order | N/A |
| Multiple stores | deals across stores A,B | One card per store; stores ordered by each store's best deal | N/A |
| Store with no active deals | deals all expired/empty | Store omitted entirely (no empty card) | N/A |
| All stores dealless | every store empty after filters | "No active deals right now" empty state | N/A |
| Invalid gas price | `gasPrice: 0` | Card header shows distance, no gas line; deals show discount alone | render nothing for gas |
| New user, no saved distance | empty localStorage | Slider = 50, valuetext "50 miles", all in-range stores shown | fall back to 50 |
| Garbage saved distance | `gma_distance_miles` = "abc"/"75"/etc | Falls back to 50 | fall back to 50 |

</frozen-after-approval>

## Code Map

- `client/src/utils/sortDeals.ts` -- has `sortDeals(): DealRow[]` (global sort). Add `groupDealsByStore()` that calls `sortDeals` then groups rows by `dispensary.id` (Map preserves first-appearance order ⇒ store order = best-deal order).
- `client/src/components/DealFeed.tsx` -- orchestrator: builds active dispensaries, calls grouping, maps each group to one `DealCard`, computes per-deal `windowText`/`countdown` and per-store `gasCostText`.
- `client/src/components/DealCard.tsx` -- presentational; change from single `deal` to a per-store card listing multiple deals.
- `client/src/components/DistanceFilter.tsx` -- holds `DEFAULT_DISTANCE_MILES`.
- Tests: `sortDeals.test.ts`, `DealFeed.test.tsx`, `DealCard.test.tsx`, `DistanceFilter.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/components/DistanceFilter.tsx` -- change `DEFAULT_DISTANCE_MILES` from `25` to `50`. Single-line; the validator and slider both consume it.
- [x] `client/src/utils/sortDeals.ts` -- add `export interface StoreGroup { dispensary: Dispensary; deals: Deal[] }` and `export function groupDealsByStore(dispensaries, now): StoreGroup[]` that runs `sortDeals` then groups rows by `dispensary.id` via an insertion-ordered `Map`. Leave `sortDeals` and `DealRow` intact.
- [x] `client/src/components/DealCard.tsx` -- change props to `{ dispensary, deals: DealView[], gasCostText }` where `DealView = { deal: Deal; windowText: string | null; countdown: string | null }`. Header: store name + distance + (when non-null) one "$X to get there" line. Body: one block per `DealView` with badge, description (omit if blank), `discountPct` "X% off" (omit if null), window + countdown. Card `urgent` when ANY deal is `happy_hour`.
- [x] `client/src/components/DealFeed.tsx` -- replace the `sortDeals` map with `groupDealsByStore`; render one `<li>` + `DealCard` per store keyed by `dispensary.id`; build each `DealView[]` with the existing `windowText`/`countdownText`, and pass `gasCostText(dispensary.distanceMiles)` once per store.
- [x] Update the test files (`DealFeed.test.tsx`, `DealCard.test.tsx`, `sortDeals.test.ts`, plus `App.test.tsx` for the split gas/discount text): group-based listitem counts (one per store), deals nested within a store's card, store ordering by best deal, new `DealCard` props, slider default 50 (fallback `it.each` "out of range" fixture moved to 55 mi), and `groupDealsByStore` unit tests covering the grouping cases.

**Acceptance Criteria:**
- Given a store with multiple active deals, when the feed renders, then exactly one card shows for that store containing all its deals (name/distance/gas not repeated).
- Given deals across several stores, when the feed renders, then stores appear ordered by their highest-priority deal and each store's deals are in `sortDeals` order.
- Given a fresh load with no saved distance, when the page loads, then the slider reads 50 mi and all stores within 50 mi are shown.
- Given the existing suite, when `npm test` runs in `client/`, then all tests pass and `tsc`/lint are clean.

## Design Notes

Grouping reuses `sortDeals` wholesale — no duplicated tier logic:

```ts
export function groupDealsByStore(dispensaries: Dispensary[], now: Date): StoreGroup[] {
  const groups = new Map<string, StoreGroup>()
  for (const { dispensary, deal } of sortDeals(dispensaries, now)) {
    const g = groups.get(dispensary.id)
    if (g) g.deals.push(deal)
    else groups.set(dispensary.id, { dispensary, deals: [deal] })
  }
  return [...groups.values()]
}
```

Gas/distance move to the card header because they describe the *trip to the store*, not an individual deal — this is what removes the per-deal repetition. The old combined "X% off — $Y to get there" line splits: discount stays per-deal, gas becomes the store-level line.

Existing users with a saved `gma_distance_miles` keep their value; only the no-preference default changes.

## Verification

**Commands:**
- `cd client && npm test` -- expected: all suites pass
- `cd client && npm run build` -- expected: `tsc` + vite build succeed (strict mode, no type errors)
- `cd client && npm run lint` -- expected: clean

**Manual checks:**
- Run the app; a store with 2+ active deals shows as a single card listing each deal; on first load (cleared localStorage) the slider sits at 50 mi.

## Suggested Review Order

**Grouping logic (entry point)**

- The whole feature in one function: sort, then group rows by store via insertion-ordered Map.
  [`sortDeals.ts:46`](../../client/src/utils/sortDeals.ts#L46)

- New view-layer types — `StoreGroup` (grouping) is util-side; `DealView` (per-deal display) is card-side.
  [`sortDeals.ts:35`](../../client/src/utils/sortDeals.ts#L35)

**Feed wiring**

- Swaps the per-deal map for `groupDealsByStore`; filter order (stale→distance→expiry→sort) unchanged above.
  [`DealFeed.tsx:100`](../../client/src/components/DealFeed.tsx#L100)

- One `<li>`/card per store, keyed by `dispensary.id`; builds each store's `DealView[]` and one gas figure.
  [`DealFeed.tsx:121`](../../client/src/components/DealFeed.tsx#L121)

**Card layout**

- Store header renders name + distance + gas once; `urgent` when any deal is a happy hour.
  [`DealCard.tsx:31`](../../client/src/components/DealCard.tsx#L31)

- Deals listed as plain `<div>`s (not `<li>`s, to keep one listitem per store).
  [`DealCard.tsx:52`](../../client/src/components/DealCard.tsx#L52)

**Slider default**

- Single-line default change 25 → 50; range/validation untouched.
  [`DistanceFilter.tsx:7`](../../client/src/components/DistanceFilter.tsx#L7)

**Tests (supporting)**

- `groupDealsByStore` unit tests: grouping, store-by-best-deal order, dealless omission.
  [`sortDeals.test.ts:130`](../../client/src/utils/sortDeals.test.ts#L130)

- Feed/card tests reworked for one-card-per-store and split gas/discount text.
  [`DealFeed.test.tsx:110`](../../client/src/components/DealFeed.test.tsx#L110)
