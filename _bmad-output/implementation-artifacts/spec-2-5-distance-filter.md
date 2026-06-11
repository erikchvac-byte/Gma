---
title: 'Distance Filter'
type: 'feature'
created: '2026-06-10'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: 'daa2d32'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The feed always shows every Coverage Zone dispensary; users can't narrow it to "deals worth the drive from my location" (Story 2.5, PRD distance-filter requirement).

**Approach:** New purely-presentational `DistanceFilter.tsx` slider (`<input type="range" min="1" max="50">`); `DealFeed` owns the value via `useLocalStorage('gma_distance_miles', 25)` and filters the already-fetched dispensary array client-side (`distanceMiles <= value`) before expiry filtering and sort.

## Boundaries & Constraints

**Always:**
- Range 1–50 whole miles, default 25. Slider markup is exactly `<input type="range" min="1" max="50">` (recorded decision — slider, not numeric input).
- Persist as localStorage `gma_distance_miles` through the existing `useLocalStorage` hook; value survives reload.
- Filtering is client-side against the full dispensary array already in memory — changing the radius triggers ZERO network requests; feed updates immediately, no reload.
- Stored-value validation mirrors the 2.4 MPG precedent: use the stored value ONLY if it is a finite number within [1, 50]; anything else (absent, garbage, ≤ 0, > 50, non-numeric JSON) silently falls back to 25.
- Inclusive boundary: a dispensary at exactly the selected distance is shown (`<=`).
- `DistanceFilter.tsx` is purely presentational — receives `value` + `onChange` props, no fetching, no localStorage access. `DealFeed.tsx` stays the single owner of filtering state.
- Slider has an accessible label that displays the current value (e.g. "Within 25 miles") and updates live as it moves.
- TS strict, co-located Vitest tests, types from `client/src/types/index.ts`.

**Ask First:**
- Any server-side change. Adding any dependency. Any change to `useDeals` or the API contract. New empty-state copy variants (e.g. "no deals within N miles").

**Never:**
- No re-fetch or query param on radius change. No debounce library. No values above 50 settable by any means. No stale-indicator work (2.6). Don't redefine types.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default | No `gma_distance_miles`; seed distances 2.5/9.8/10.5/12.5 | Slider at 25; all four dispensaries' deals shown | N/A |
| Narrow | Slider dragged to 10 | Only 2.5 and 9.8 remain — instantly, fetch count unchanged | N/A |
| Boundary | Slider at 10; dispensary at exactly 10.0 | That dispensary IS shown (inclusive) | N/A |
| Max | Slider at 50 | All Coverage Zone dispensaries with active deals shown | N/A |
| Persisted | `gma_distance_miles` = `30`, reload | Slider reads 30; filter applies 30 | N/A |
| Garbage stored | `"abc"`, `0`, `-5`, `75`, `null`, `'"30"'` (JSON string) | Slider and filter use 25 | Silent, no console noise |
| Filtered to none | Slider at 1; nearest dispensary 2.5 mi | Existing "No active deals right now" empty state; slider still visible and usable | N/A |
| Loading / error | Fetch pending or failed | Existing skeleton / error UI; no slider rendered | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/DistanceFilter.tsx` — create: presentational slider + live label
- `client/src/components/DealFeed.tsx` — owns `gma_distance_miles` state; insert distance filter on `data.dispensaries` before the expiry-filter `.map` (line ~62); render `DistanceFilter` above the list in the data-loaded branch
- `client/src/hooks/useLocalStorage.ts` — existing generic hook (JSON-parses; garbage arrives as any type — validate at use site, per `DealFeed.tsx:38` MPG pattern)
- `client/src/components/DealFeed.test.tsx` — existing harness: `makeDispensary` (default `distanceMiles: 5`), mocked `useDeals` hook (not fetch) — extend, don't rebuild
- `client/src/types/index.ts` — `Dispensary.distanceMiles` (consume as-is)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/components/DistanceFilter.tsx` — create: `{ value: number; onChange: (miles: number) => void }`; range input 1–50 step 1, label tied to input (htmlFor/id or aria), shows "Within {value} miles"
- [x] `client/src/components/DistanceFilter.test.tsx` — create: renders min/max/value attrs, label text, fires `onChange` with a number on input event
- [x] `client/src/components/DealFeed.tsx` — modify: `useLocalStorage<number>('gma_distance_miles', 25)`, validity clamp per Always rule, filter dispensaries by `distanceMiles <= effective` before expiry mapping, render `<DistanceFilter>` above the list (also when rows are empty)
- [x] `client/src/components/DealFeed.test.tsx` — modify: matrix cases — default 25 shows all, change-to-10 hides far dispensaries with zero fetch calls (`useDeals` is mocked; a fetch spy proves no direct network use), inclusive boundary, persisted 30, each garbage-stored variant → 25, filtered-to-none keeps slider + empty message
- [x] `client/src/App.test.tsx` — verify: unaffected (empty dispensaries render no slider-dependent assertions) — update only if broken

**Acceptance Criteria:**
- Given a fresh visitor, when the feed loads, then the slider reads 25 and persists changes to `gma_distance_miles`.
- Given the user drags to 10 and releases, when the feed re-renders, then only dispensaries ≤ 10 road miles remain, with no page reload and no new API call.
- Given `DealFeed.tsx` sources, when inspected, then filtering runs against the in-memory array and `useDeals.ts` is untouched.
- Given the full client suite, when `npm test -- --run`, `npx tsc -b`, `npm run lint` run in `client/`, then all pass.

## Spec Change Log

- 2026-06-10 (review pass 1, patch-level — no loopback): three sub-agent reviewers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Patches: shared `MIN/MAX/DEFAULT_DISTANCE_MILES` constants exported from `DistanceFilter.tsx` (DealFeed validation had duplicated the 1/50/25 literals); `Number.isInteger` added to the stored-value check (frozen "whole miles" rule — fractional `12.5` previously slipped through, now falls back to 25, test added); `useId` replaces the hardcoded element id; singular "Within 1 mile" at the boundary; boundary tests for persisted `1` and `50`; Code Map / task text corrected ("mocked fetch" → mocked `useDeals`, "exactly one fetch call" → zero direct fetch calls proven by spy). Deferred (pre-existing / Ask-First): `distanceMiles` payload-shape validation at the `useDeals` boundary; filter-aware empty-state copy. KEEP: inclusive `<=` boundary, use-site validation pattern mirroring MPG, slider rendered only in the data-loaded branch.

## Verification

**Commands:**
- `cd client; npm test -- --run` — expected: all suites pass
- `cd client; npx tsc -b` — expected: zero type errors
- `cd client; npm run lint` — expected: clean

**Manual checks (if no CLI):**
- `npm run dev` both sides: slider defaults to 25; drag to 10 → feed shrinks instantly with Network tab showing no new request; reload → slider remembers; `localStorage.gma_distance_miles = '"abc"'` → slider back at 25.

## Suggested Review Order

**The filter (one comparison, validated state)**

- Entry point: in-memory distance cut, inclusive `<=`, feeding the existing expiry/sort pipeline
  [`DealFeed.tsx:80`](../../client/src/components/DealFeed.tsx#L80)

- Stored-value validation — whole number in [1, 50] or fall back to 25, mirroring the MPG pattern
  [`DealFeed.tsx:50`](../../client/src/components/DealFeed.tsx#L50)

**The slider component**

- Purely presentational: `value` + `onChange` props only; exports the shared range constants
  [`DistanceFilter.tsx:15`](../../client/src/components/DistanceFilter.tsx#L15)

- Single home for 1/50/25 so the validator and the slider can't drift
  [`DistanceFilter.tsx:5`](../../client/src/components/DistanceFilter.tsx#L5)

**Wiring**

- Slider renders above the list in the data-loaded branch — visible even when filtering empties the feed
  [`DealFeed.tsx:105`](../../client/src/components/DealFeed.tsx#L105)

**Peripherals (tests)**

- Matrix sweep: default, narrow-with-fetch-spy, inclusive boundary, persisted, garbage ×7, boundary values 1/50
  [`DealFeed.test.tsx:383`](../../client/src/components/DealFeed.test.tsx#L383)

- Component contract: range attrs, live label, singular "mile", numeric onChange
  [`DistanceFilter.test.tsx:5`](../../client/src/components/DistanceFilter.test.tsx#L5)
