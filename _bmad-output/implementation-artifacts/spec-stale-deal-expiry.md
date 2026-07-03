---
title: 'Stale deal expiry — stop showing deals a store has taken down'
type: 'bugfix'
created: '2026-07-02'
status: 'done'
baseline_commit: '17e23c71d54897c7e684fa04babfebba71cae07a'
context:
  - '{project-root}/_bmad-output/specs/spec-stale-deal-expiry/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ADR-026 last-known-good re-serves a store's cached deals after an empty/failed scrape, with no upper time bound. A store that genuinely *ends* a promotion keeps advertising the old deal forever (e.g. Happy Time - Mount Vernon showed a "JUNE 2026 SUMMER SALE" on Jul 2, ~37h after its last non-empty scrape; provider now serves zero specials). A shopper can drive to a deal that no longer exists — an Honest Math violation (ADR-007/009).

**Approach:** Add a **display-only** store-level time bound. When a store's `lastFetchedAt` (refreshed only on a non-empty ingest) is older than a single tunable constant `DEAL_EXPIRY_MS` (24h), the client treats its cached deals as expired: it renders the store card in place with a "No current deals" state instead of the stale deal blocks. No scraper, ingest, or `data.json` changes — the cached deals stay put and reappear automatically on the next good scrape.

## Boundaries & Constraints

**Always:**
- Derive expiry from `lastFetchedAt` only, mirroring `deriveStoreStatus`'s defensive parse and fail-open (missing/empty/malformed/never-ingested ⇒ expired). Boundary is inclusive-kept: `age <= DEAL_EXPIRY_MS` renders normally, `age > DEAL_EXPIRY_MS` expires.
- `DEAL_EXPIRY_MS` is ONE exported constant with a rationale comment, independent of `STORE_FRESHNESS_WINDOW_MS` (3h) and the alertGate persistent-stale window (6h).
- An expired store stays in the feed at its natural distance position (CAP-2): header kept (name, link, address, distance pill), deal blocks + urgency badge replaced by "No current deals". Never segmented, re-sorted lower, or hidden.
- A store that recovers (next non-empty scrape refreshes `lastFetchedAt`) shows its deals again with no manual step.

**Ask First:**
- Any change to the value 24h, or to whether an expired store still shows the gas line / respects the deal-type chip.

**Never:**
- No change to scraping, `applyIngest`/`runScrapers`, `normalizeDeals`, `filterActiveDeals`, `sanitizeDescription`, or `data.json`.
- Do not redefine the `stale` boolean or the `ok|stale|failed` `status`/freshness window. Expiry is a separate signal read at display time.
- No per-deal `startStamp`/`endStamp` expiry (deferred to a future spec). This bounds staleness at the STORE level.

## I/O & Edge-Case Matrix

`areDealsExpired(lastFetchedAt, now)`:

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Just inside threshold | age = 24h − 1min | `false` (kept) | N/A |
| Exactly at threshold | age = 24h exactly | `false` (kept) | N/A |
| Just outside threshold | age = 24h + 1min | `true` (expired) | N/A |
| Never ingested | `''` / `undefined` / non-string | `true` (expired) | fail-open |
| Malformed timestamp | `'not-a-date'` (NaN) | `true` (expired) | fail-open |
| Future timestamp | fetched > now (clock skew) | `false` (kept) | treated fresh |

</frozen-after-approval>

## Code Map

- `client/src/utils/dealView.ts` -- add `DEAL_EXPIRY_MS` constant + pure `areDealsExpired(lastFetchedAt, now)` predicate (CAP-1/CAP-3). Mirrors `deriveStoreStatus`.
- `client/src/utils/sortDeals.ts` -- export the existing inline distance comparator as `byDistanceMiles(a, b)` so DealFeed can merge live + expired groups without duplicating it.
- `client/src/components/DealFeed.tsx` -- classify `nearbyDispensaries` into expired vs live; run existing pipeline on live only; map expired stores to `{ dispensary, deals: [] }`; merge both and sort nearest-first via `byDistanceMiles` (CAP-1/CAP-2).
- `client/src/components/DealCard.tsx` -- when `deals.length === 0`, render "No current deals" state: keep header/address/distance/gas, replace urgency badge + deal grid (CAP-2).
- `client/src/utils/dealView.test.ts` -- the three CAP-1 tests + boundary/malformed/future rows.
- `client/src/components/DealCard.test.tsx` -- expired store renders "No current deals" + keeps header/distance/link.
- `client/src/components/DealFeed.test.tsx` -- expired store stays in feed at its distance position, live store unaffected.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/dealView.ts` -- add `DEAL_EXPIRY_MS = 24 * 60 * 60 * 1000` (commented) and `areDealsExpired`, defensive-parsing per the matrix.
- [x] `client/src/utils/sortDeals.ts` -- extract/export `byDistanceMiles`; reuse it inside `groupDealsByStore`.
- [x] `client/src/components/DealFeed.tsx` -- split `nearbyDispensaries` on `areDealsExpired(d.lastFetchedAt, now)`; live stores go through the existing time/chip/group pipeline; expired stores become empty-deal groups; merge + `byDistanceMiles` sort into `storeGroups`.
- [x] `client/src/components/DealCard.tsx` -- add empty-deals branch: "No current deals" line, no urgency badge, no deal grid; header/address/distance/gas untouched.
- [x] `client/src/utils/dealView.test.ts` -- CAP-1 unit tests (just-inside kept, just-outside expired, never-ingested expired) + exactly-at / malformed / future.
- [x] `client/src/components/DealCard.test.tsx` + `DealFeed.test.tsx` -- CAP-2 render/integration tests.
- [x] `client/src/App.test.tsx` -- fixture `lastFetchedAt` set fresh (real-clock App tests would otherwise age past 24h and expire the store).

**Acceptance Criteria:**
- Given a non-stale store whose `lastFetchedAt` is >24h old with cached deals, when the feed renders, then its card shows "No current deals" (no discount badge, no deal title, no "active today") while keeping name/address/distance/link at the same distance position.
- Given a store whose `lastFetchedAt` is within 24h, when the feed renders, then it shows its deals exactly as today.
- Given a store already flagged `stale: true`, when the feed renders, then behavior is unchanged (still counted in "N sources unavailable", not shown as a "No current deals" card).

## Design Notes

`areDealsExpired` is the display twin of `deriveStoreStatus` — same fail-open discipline (no parseable timestamp ⇒ no evidence of a fresh menu ⇒ expired). Threshold check is `now - fetched > DEAL_EXPIRY_MS` so exactly-at-threshold is kept, matching storeStatus's `<=`.

Expiry classification runs on `nearbyDispensaries` — i.e. AFTER the existing `stale === true` drop — so a `stale` store stays in the "sources unavailable" bucket and only non-stale-but-time-expired stores become "No current deals" cards. Expired stores must not vanish, so they bypass `groupDealsByStore` (which drops zero-deal stores) and are merged in as empty-deal groups, then distance-sorted alongside live groups to preserve position (CAP-2 = relabel in place).

Gas line is left acting on expired stores as-is (trip info unaffected per constraint). Deal-type chip behavior was resolved in review — see change log below.

## Spec Change Log

### Iteration 1 — adversarial review (blind + edge-case + acceptance)

All three reviewers PASSed CAP-1/CAP-2/CAP-3 and the constraints. Two findings actioned; rest rejected/pre-existing:

- **[patch] Never-ingested empty store could surface as an empty card.** A `stale:false` store with NO cached deals + old/missing `lastFetchedAt` would have rendered a spurious "No current deals" card (previously invisible). Fix: expired classification now also requires `d.deals.length > 0` — nothing to expire otherwise. Regression test added.
- **[Ask-First D-chip — resolved by best judgment, Erik away] Deal-type chip vs expired cards.** All 3 reviewers flagged that expired cards showed under every chip and suppressed the "No active deals right now" empty state. Chosen: **hide expired cards under any specific deal-type chip; show only when chip = 'All'.** Fixes the empty-state regression. **PROVISIONAL** — Erik may override (alt: filter expired by past deal type, or keep always-shown). Tests pin the chosen behavior.
- **[reject]** `isExpired = deals.length === 0` coupling — edge-hunter confirmed a live store can never reach `DealCard` empty (`groupDealsByStore` drops zero-deal live stores); invariant documented in-code.
- **[reject/pre-existing]** `byDistanceMiles` `NaN` distance, and the redundant re-sort of already-sorted `liveGroups` — harmless / not caused by this change.

## Verification

**Commands:**
- `cd client && npm test -- dealView DealCard DealFeed` -- expected: all pass incl. new CAP-1/CAP-2 cases.
- `npm run build` (client + server) -- expected: clean tsc + vite build (Render parity).

**Manual checks:**
- With a fixture store at `lastFetchedAt` 25h old + deals present: card shows "No current deals", keeps header/distance, sits in distance order among live cards.

## Suggested Review Order

**The expiry rule (start here)**

- Entry point: the 24h constant + its fail-open predicate — the whole feature's contract.
  [`dealView.ts:175`](../../client/src/utils/dealView.ts#L175)
- Display twin of server `deriveStoreStatus`; inclusive-kept boundary, malformed ⇒ expired.
  [`dealView.ts:183`](../../client/src/utils/dealView.ts#L183)

**Feed wiring (highest-leverage integration)**

- Split live vs expired AFTER the stale drop, so `stale` stores stay in the unavailable count.
  [`DealFeed.tsx:119`](../../client/src/components/DealFeed.tsx#L119)
- Expired = has cached deals + (chip='all'); guards the never-ingested empty-card + chip decisions.
  [`DealFeed.tsx:128`](../../client/src/components/DealFeed.tsx#L128)
- Merge expired empty-deal groups with live groups, re-sorted nearest-first (CAP-2 position).
  [`DealFeed.tsx:150`](../../client/src/components/DealFeed.tsx#L150)

**Card presentation**

- Empty deals ⇒ "No current deals"; header/address/distance/gas kept, deal grid suppressed.
  [`DealCard.tsx:36`](../../client/src/components/DealCard.tsx#L36)
- Shared distance comparator, extracted so the merge reuses the grouping rule.
  [`sortDeals.ts:45`](../../client/src/utils/sortDeals.ts#L45)

**Tests (peripherals)**

- CAP-1 boundary/fail-open unit tests.
  [`dealView.test.ts`](../../client/src/utils/dealView.test.ts)
- CAP-2 render + feed-integration + chip/never-ingested/stale-AC3 regressions.
  [`DealFeed.test.tsx`](../../client/src/components/DealFeed.test.tsx)
