---
title: 'Deal Cards'
type: 'feature'
created: '2026-06-10'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '8aabf1b'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The feed (2.2) renders bare text rows — no distance, no time window, no countdown — and once loaded it never re-evaluates: a Happy Hour that ends while the tab is open stays visible forever.

**Approach:** Replace rows with a presentational `DealCard` (name, distance, description, discount %, time window), add a 60-second clock tick that drives both a live countdown on active Happy Hours and startTime-aware client-side expiry so ended deals disappear without a reload.

## Boundaries & Constraints

**Always:**
- `DealCard.tsx` is purely presentational — receives `Dispensary`/`Deal` data and computed values as props; zero fetching, zero intervals inside it.
- Tick mechanism: one `setInterval` (60s) in a `useEffect`, cleaned up on unmount; the clock lives above the cards, not in them.
- Expiry check MUST be startTime-aware (per `deferred-work.md` 2026-06-10): a timed deal whose window has passed is dropped, never re-ranked as "ending tomorrow" by the overnight wrap. Overnight windows (22:00–02:00) stay active across midnight.
- Road distance formatted to one decimal ("12.4 miles"); times displayed 12-hour ("9:00 PM"); countdown formatted H:MM.
- Sort order, hook-only data access, types from `client/src/types/index.ts`, TS strict, co-located tests — all unchanged from 2.2.

**Ask First:**
- Any server-side change. Adding any dependency. Any change to `useDeals` fetch behavior (no refetch/polling — only the local clock ticks).

**Never:**
- Gas cost (2.4), distance filter (2.5), stale indicator (2.6), "Starts at HH:MM" upcoming deals (deferred).
- No re-fetching on tick — expiry only removes deals; new deals arrive on next page load.
- No `Date` objects in React state holding server data (tick state holding the current time is fine).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Timed HH card | `happy_hour`, start `21:00`, end `23:30`, now 23:00 | Name, "X.X miles", description, "N% off", "9:00 PM – 11:30 PM", countdown "0:30" | N/A |
| HH until close | `happy_hour`, start `21:00`, end null | Window "9:00 PM – close", no countdown, never expires client-side | N/A |
| All-day HH card | `happy_hour`, both times null | "Active today", no countdown | N/A |
| Daily Deal card | `daily` | Name, distance, description, "N% off", "Active today" — no countdown | N/A |
| Countdown tick | Active HH, 60s elapses | Remaining time drops by one minute without reload | N/A |
| Expiry | HH end time passes while tab open | Card disappears on next tick; feed may transition to empty state | N/A |
| Overnight at 23:00 | HH 22:00–02:00, now 23:00 | Active, countdown "3:00", survives midnight, expires after 02:00 | N/A |
| Ended-earlier-today | HH 14:00–16:00 in payload, now 17:00 | Dropped (startTime-aware) — NOT shown as ending tomorrow | N/A |
| Whole-number distance | `distanceMiles: 12` | "12.0 miles" | N/A |
| Malformed times | endTime "4pm" or missing | Card shown without window/countdown; never crashes, never NaN text | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/DealFeed.tsx` — owns feed states + sorted rows; gains the tick + expiry filter; rows → `DealCard`
- `client/src/utils/sortDeals.ts` — `minutesUntilEnd` + tier logic live here; time-window math moves to a shared util
- `client/src/utils/formatTime.ts` — `formatLastUpdated` exists; gains 12-hour + countdown formatters
- `client/src/components/DealFeed.test.tsx` — row assertions will need card-markup updates; fake timers already used
- `client/src/types/index.ts` — `Deal.startTime/endTime: string | null` (consume as-is)
- `server/utils/filterActiveDeals.ts` — reference for active-window semantics incl. overnight (read-only)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/dealTime.ts` — create: `parseTimeToMinutes`, `minutesUntilEnd` (moved from sortDeals), and startTime-aware `isDealActive(deal, now)` mirroring the server's same-day/overnight semantics; malformed times → inactive-safe (`isDealActive` true only on valid evidence, countdown helpers return null)
- [x] `client/src/utils/dealTime.test.ts` — create: unit-test every matrix time case (same-day, overnight across midnight, ended-earlier-today, null fields, malformed strings)
- [x] `client/src/utils/sortDeals.ts` — modify: import time helpers from `dealTime.ts`; tier behavior unchanged (existing tests must pass untouched)
- [x] `client/src/utils/formatTime.ts` — modify: add `formatTimeOfDay('21:00') → '9:00 PM'` (invalid → null) and `formatCountdown(minutes) → '0:30'/'3:05'` (negative/NaN → null)
- [x] `client/src/utils/formatTime.test.ts` — modify: cover new formatters incl. midnight `00:00` → '12:00 AM', noon, invalid input
- [x] `client/src/hooks/useNow.ts` — create: returns current `Date`, re-renders every 60s via interval, cleanup on unmount
- [x] `client/src/hooks/useNow.test.ts` — create: fake timers — initial value, advances on tick, interval cleared on unmount
- [x] `client/src/components/DealCard.tsx` — create: presentational card per matrix rows; props are plain data/computed values
- [x] `client/src/components/DealCard.test.tsx` — create: assert each card variant (timed HH w/ countdown, until-close, all-day, daily, whole-number distance, malformed times)
- [x] `client/src/components/DealFeed.tsx` — modify: `useNow` drives `sortDeals(…, now)` + expiry filter via `isDealActive`; render `DealCard` list
- [x] `client/src/components/DealFeed.test.tsx` — modify: update row assertions to card markup; add tick test (countdown text changes after `advanceTimersByTime(60000)`) and expiry test (card disappears, empty state appears when last deal ends)

**Acceptance Criteria:**
- Given an active timed Happy Hour, when 60 seconds elapse, then its countdown decreases without any network request or page reload.
- Given the only remaining deal's end time passes, when the next tick fires, then the feed shows the empty state with the timestamp still visible.
- Given `DealCard.tsx` source, when inspected, then it contains no `fetch(`, no `setInterval`, and no hook imports beyond React types.
- Given the full client suite, when `npm test -- --run`, `npx tsc -b`, `npm run lint` run in `client/`, then all pass with zero regressions (41 existing tests).

## Spec Change Log

- 2026-06-10 (review pass 1, patch-level — no loopback): Reviewers flagged that the implementation's "end-only deal = since-midnight window" invention contradicted the Design Notes' server-mirror rule (server treats ANY null time as day-long-active), and that display/expiry/sort routed degenerate time shapes inconsistently (malformed-start deal sorted in the urgent tier while rendering as malformed and never expiring). Resolution: single `hasValidTimedWindow` predicate in `dealTime.ts` now drives expiry, countdown, and sort tier — only fully-valid timed windows compete in tier 0 or expire client-side; all other shapes mirror the server (always shown). KEEP: matrix row 10 reading ("malformed → card shown, no window/countdown") confirmed correct over the Tasks line's "inactive-safe" wording — the matrix governs. KEEP: "Until X" window copy for end-only deals retained as display-only (no countdown, no expiry) and is now feed-tested alongside the "– close" derivation.

## Design Notes

Expiry and the sort wrap share one trap: `minutesUntilEnd` alone cannot distinguish "ends tomorrow at 02:00" from "ended at 16:00 today" — only `startTime` disambiguates. `isDealActive` must therefore replicate the server's window logic (`server/utils/filterActiveDeals.ts:10-28`) minus `daysValid` (the server already day-filtered at fetch; the client tick only ever *removes*). Run the expiry filter BEFORE `sortDeals` so expired deals never reach the comparator's wrap heuristic.

## Verification

**Commands:**
- `cd client; npm test -- --run` — expected: all suites pass (41 existing + new)
- `cd client; npx tsc -b` — expected: zero type errors
- `cd client; npm run lint` — expected: clean

**Manual checks (if no CLI):**
- `npm run dev` both sides: cards show distance/window/discount; watch an active HH countdown tick at the minute boundary; temporarily edit a seeded deal's endTime to one minute ahead and watch the card vanish.

## Suggested Review Order

**Time-window policy (the heart of the story)**

- Entry point: `hasValidTimedWindow` — one predicate drives expiry, countdown, AND sort tier
  [`dealTime.ts:28`](../../client/src/utils/dealTime.ts#L28)

- startTime-aware expiry: same-day `[start, end)` vs overnight wrap, mirroring the server
  [`dealTime.ts:41`](../../client/src/utils/dealTime.ts#L41)

- Strict `HH:MM` parser fails soft to NaN — no throws on scraper garbage
  [`dealTime.ts:8`](../../client/src/utils/dealTime.ts#L8)

**The 60-second clock**

- `useNow`: single interval, cleanup on unmount — the only ticking thing in the app
  [`useNow.ts:1`](../../client/src/hooks/useNow.ts#L1)

- Feed wires tick → expiry filter BEFORE sort, so expired deals never hit the wrap heuristic
  [`DealFeed.tsx:55`](../../client/src/components/DealFeed.tsx#L55)

**Card derivation & display**

- Window copy ladder: "X – Y" / "X – close" / "Until Y" / "Active today" — null on malformed
  [`DealFeed.tsx:11`](../../client/src/components/DealFeed.tsx#L11)

- Countdown only for fully-valid timed happy hours
  [`DealFeed.tsx:26`](../../client/src/components/DealFeed.tsx#L26)

- `DealCard`: purely presentational, type-only imports, stable deal-based keys upstream
  [`DealCard.tsx:13`](../../client/src/components/DealCard.tsx#L13)

**Sort routing**

- Degenerate shapes exit the urgency tier — comparator can never see NaN
  [`sortDeals.ts:11`](../../client/src/utils/sortDeals.ts#L11)

**Peripherals (formatters, tests)**

- 12-hour + H:MM countdown formatters, null on invalid
  [`formatTime.ts:14`](../../client/src/utils/formatTime.ts#L14)

- Window-math edge cases incl. server-mirror end-only behavior
  [`dealTime.test.ts:52`](../../client/src/utils/dealTime.test.ts#L52)

- Feed pipeline: tick, expiry-to-empty, "– close"/"Until X" derivations, malformed-start tiering
  [`DealFeed.test.tsx:147`](../../client/src/components/DealFeed.test.tsx#L147)

- Card variants with hand-supplied computed props
  [`DealCard.test.tsx:27`](../../client/src/components/DealCard.test.tsx#L27)
