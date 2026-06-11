# Deferred Work

## Deferred from: code review of spec-2-5-distance-filter (2026-06-10)

- **`distanceMiles` payload shape is trusted blindly** — `useDeals` validates only the array shape, so a dispensary with `distanceMiles` missing/`NaN`/`Infinity` is now silently dropped by the distance filter at any slider setting, and `null` (coerces to 0 in `<=`) passes the filter then crashes `DealCard`'s `.toFixed(1)` — a pre-existing crash path. Proper fix: validate/normalize dispensary shape at the `useDeals` boundary (one home), not per-consumer. Candidate to batch with Epic 4 scraper-data hardening. *(2.6 review extends this: a `null`/non-object element inside `dispensaries[]` now crashes at the stale predicate — first property access — and a garbage `stale` value fails open to "fresh" by the frozen strict-`=== true` rule; both resolved by the same boundary validation.)*
- **Filter-aware empty-state copy** — when the distance filter hides all deals, the feed shows the generic "No active deals right now", which doesn't hint that widening the slider would help (e.g. "No active deals within 10 miles"). Explicitly Ask-First in the 2.5 spec; needs Erik's call on copy.

## Deferred from: code review of spec-2-3-deal-cards (2026-06-10)

- **Long-open tab resurrects stale deals** — the 60s tick re-evaluates `isDealActive` over the original (never-refetched) payload, so on a tab left open past midnight, yesterday's deals reappear when their clock window next matches, ignoring `daysValid`. The no-refetch rule is a frozen 2.3 boundary; fixing properly means either monotonic removal or periodic refetch — candidate for Epic 3 or a small follow-up story.
- **No `visibilitychange` resync** — mobile browsers throttle background intervals; on tab resume the feed can briefly show expired deals until the next tick. Cheap fix (refresh `useNow` on visibility), batch with the item above.
- **Server-side tautological windows** — `start === end` (and end-only `00:00`) are treated as 24h-active by the server filter too (`server/utils/filterActiveDeals.ts` overnight branch). Scraper validation (Epic 4) should normalize or reject zero-length windows at ingestion.

## Deferred from: code review of spec-2-2-deal-feed (2026-06-10)

- **Feed does not re-evaluate deal activity over time** — `sortDeals` is computed once per render with `new Date()` and nothing re-renders on a timer, so a deal whose window closes while the tab is open stays visible; worse, once `endTime` passes, the overnight-wrap heuristic (`diff < 0 → +1440`) ranks it as "ending tomorrow" because `startTime` is ignored. Unreachable today (server strips inactive deals at fetch time) but becomes live the moment Story 2.3 adds the 60s countdown tick — 2.3 MUST make expiry checking startTime-aware (drop expired deals client-side), not just re-sort.

## Deferred from: Story 2.2 spec planning (2026-06-10)

- **Upcoming Happy Hours with "Starts at HH:MM" label** (Story 2.2 AC3, epics.md:293-295) — the server (`server/utils/filterActiveDeals.ts`, ADR-015) strips deals that aren't active right now, so later-today Happy Hours never reach the client. Implementing requires extending the server filter to keep `happy_hour` deals starting later today plus client-side active-vs-upcoming labeling. Deferred by Erik 2026-06-10; Story 2.2 ships active-only.

## Deferred from: code review of 2-1-age-gate (2026-06-10)

- No cross-tab/multi-instance localStorage sync in `useLocalStorage` (no `storage` event listener / `useSyncExternalStore`) — two tabs or two consumers of the same key diverge until reload. Out of MVP scope; worst case the age gate stays up in a second tab.
- `setValue` lacks a functional-update form (`setValue(prev => ...)`), so future read-modify-write consumers risk stale closures; `T` including `undefined` serializes to the literal string `"undefined"`. No current consumer affected.
- `useLocalStorage` ignores `key` prop changes after mount (value read once in the lazy initializer). No consumer changes keys today.
