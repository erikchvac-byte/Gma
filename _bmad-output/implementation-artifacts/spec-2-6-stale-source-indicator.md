---
title: 'Stale Source Indicator'
type: 'feature'
created: '2026-06-10'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '602ee97'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dispensaries whose scrape failed (`stale: true`) would show outdated deals; today the feed renders them like fresh data, and the user has no signal that sources are missing (Story 2.6 — "a smaller accurate feed beats a larger inaccurate one").

**Approach:** `DealFeed` omits `stale: true` dispensaries from the feed pipeline and derives a count from the full API array; new presentational `StaleIndicator.tsx` renders that count as one muted line (e.g. "1 source unavailable") near the Last-updated footer, nothing when the count is 0.

## Boundaries & Constraints

**Always:**
- Stale check is strict `=== true` (ADR-021 boolean precedent): only a literal `true` omits a dispensary and increments the count — both derived from the same predicate so they can't disagree.
- Count comes from the FULL `data.dispensaries` array in the API response — independent of the 2.5 distance filter (a stale source 40 miles out still counts at any slider setting).
- Stale dispensaries never appear in the feed, even with active deals. Never inflate the feed.
- Non-intrusive: plain muted text, no icon/banner/toast, no user action required or possible; must not shift the deal-list layout (renders in the footer region below the list).
- Copy: `1 source unavailable` / `N sources unavailable` (plural ≥ 2). Render nothing at count 0.
- `StaleIndicator.tsx` is purely presentational — receives `count: number` prop, returns `null` for count ≤ 0. `DealFeed` stays the single owner of derivation.
- Indicator appears only in the data-loaded branch (like the 2.5 slider) — visible alongside the empty state when all sources are stale.
- TS strict, co-located Vitest tests, types from `client/src/types/index.ts`.

**Ask First:**
- Any server-side change. Adding any dependency. Per-dispensary stale detail UI (names, timestamps) — count only.

**Never:**
- No re-fetch, no polling, no retry button. No new localStorage keys. Don't touch `useDeals`, sort, countdown, distance filter, or gas-cost logic. Don't redefine types.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| All fresh | 4 dispensaries, all `stale: false` | No indicator text anywhere; all 4 in feed | N/A |
| One stale | 1 of 4 `stale: true` | `1 source unavailable`; that dispensary's deals absent | N/A |
| Several stale | 3 of 5 `stale: true` | `3 sources unavailable`; only 2 fresh in feed | N/A |
| All stale | every dispensary `stale: true` | Empty state "No active deals right now" + `N sources unavailable` | N/A |
| Stale outside radius | stale dispensary at 40 mi, slider at 10 | Count still includes it (API-array derivation) | N/A |
| Garbage stale | `stale` is `"true"`, `1`, or `null` | Not stale: shown in feed, not counted | Strict `=== true`, no crash |
| Loading / error | fetch pending or failed | Existing skeleton / error UI; no indicator | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/StaleIndicator.tsx` — create: presentational count line
- `client/src/components/DealFeed.tsx` — single stale predicate feeding both omission (before distance filter at line ~80) and count; render `<StaleIndicator>` in the footer region (line ~119)
- `client/src/components/DealFeed.test.tsx` — existing harness: `makeDispensary(id, name, deals)` with `stale: false` default, mocked `useDeals` — extend; `atDistance` helper exists in the distance-filter describe block
- `server/routes/dataRoute.ts` — reference only: confirms stale dispensaries reach the client with deals activity-filtered
- `client/src/types/index.ts` — `Dispensary.stale: boolean` (consume as-is)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/components/StaleIndicator.tsx` — create: `{ count: number }`; `null` when `count <= 0`; singular/plural copy; muted styling consistent with the Last-updated footer (`text-sm text-gray-500`)
- [x] `client/src/components/StaleIndicator.test.tsx` — create: count 0 → renders nothing, 1 → `1 source unavailable`, 3 → `3 sources unavailable`, negative → nothing
- [x] `client/src/components/DealFeed.tsx` — modify: `const isStale = (d: Dispensary) => d.stale === true`; `staleCount` from `data.dispensaries`; exclude stale from the pipeline ahead of the distance filter; render `<StaleIndicator count={staleCount} />` beside the footer
- [x] `client/src/components/DealFeed.test.tsx` — modify: matrix cases — stale omitted with fresh remaining, count text singular/plural, all-stale shows empty state + indicator, count unaffected by narrow slider, garbage stale values stay in feed uncounted, no indicator when all fresh
- [x] `client/src/App.test.tsx` — verify: unaffected — update only if broken

**Acceptance Criteria:**
- Given all dispensaries are `stale: false`, when the page renders, then no "unavailable" text exists in the DOM.
- Given two of four dispensaries are `stale: true`, when the feed renders, then their deals are absent and `2 sources unavailable` is visible without disrupting the list layout.
- Given `DealFeed.tsx` sources, when inspected, then omission and count share one strict `=== true` predicate and the count ignores the distance filter.
- Given the full client suite, when `npm test -- --run`, `npx tsc -b`, `npm run lint` run in `client/`, then all pass.

## Spec Change Log

- 2026-06-10 (review pass 1, patch-level — no loopback): three sub-agent reviewers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Patches: `Number.isInteger` guard in `StaleIndicator` ("NaN sources unavailable" unrenderable, test added); `role="status"` on the indicator so screen readers announce it; exact AC2 test (2-of-4 stale with list intact); missing-`stale`-property test; explicit no-"unavailable" assertions in loading/error tests. Deferred (extends the 2.5 entry): `dispensaries[]` element-shape validation at the `useDeals` boundary (null elements crash at the stale predicate; garbage `stale` fails open per the frozen strict rule). Rejected as frozen intent: count-ignores-radius, "sources unavailable" copy, fail-open direction of `=== true`. KEEP: single predicate driving omission + count, count from full API array, indicator outside the rows ternary so it coexists with the empty state.

## Verification

**Commands:**
- `cd client; npm test -- --run` — expected: all suites pass
- `cd client; npx tsc -b` — expected: zero type errors
- `cd client; npm run lint` — expected: clean

**Manual checks (if no CLI):**
- Set `"stale": true` on one entry in `server/data/data.json`, `npm run dev` both sides: that dispensary's deals vanish, "1 source unavailable" shows under the feed, slider changes don't alter the count; revert data.json after.

## Suggested Review Order

**The predicate (one rule, two consumers)**

- Entry point: strict `=== true` drives both the count and the omission — they can't disagree
  [`DealFeed.tsx:82`](../../client/src/components/DealFeed.tsx#L82)

- Count from the FULL API array; the feed pipeline gets only fresh dispensaries, ahead of the distance filter
  [`DealFeed.tsx:83`](../../client/src/components/DealFeed.tsx#L83)

**The indicator component**

- Presentational, integer-guarded (`NaN`/negative/fractional → null), `role="status"` for screen readers
  [`StaleIndicator.tsx:7`](../../client/src/components/StaleIndicator.tsx#L7)

**Wiring**

- Renders after the Last-updated footer, outside the rows ternary — coexists with the empty state
  [`DealFeed.tsx:133`](../../client/src/components/DealFeed.tsx#L133)

**Peripherals (tests)**

- Matrix sweep: fresh/1-of-4/2-of-4 (AC2)/3-of-5/all-stale, radius independence, garbage + missing `stale`
  [`DealFeed.test.tsx:511`](../../client/src/components/DealFeed.test.tsx#L511)

- Component contract: 0/negative/NaN render nothing, singular/plural copy
  [`StaleIndicator.test.tsx:5`](../../client/src/components/StaleIndicator.test.tsx#L5)
