---
title: 'Deal Feed with Active Deals & Empty State'
type: 'feature'
created: '2026-06-10'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '90355b9'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After the age gate, the app shows only a placeholder heading. The Epic 1 API (`GET /api/data`) already serves active-only deals, but nothing on the client fetches or displays them.

**Approach:** Add a `useDeals` hook (the only fetch path), a `DealFeed` component owning loading/error/empty/populated states, deal sorting as a pure utility, and an always-visible "last updated" timestamp. Wire into `App.tsx` inside the existing `AgeGate`.

## Boundaries & Constraints

**Always:**
- All data access through `useDeals.ts` returning `{ data, isLoading, error }` — zero direct `fetch()` in components.
- Sort: active Happy Hours first (soonest-ending first), then Daily Deals (highest `discountPct` first).
- `meta.lastScraperRun` visible in ALL non-loading states, not only when empty.
- TypeScript strict; tests co-located; consume types from `client/src/types/index.ts` — never redefine.
- camelCase JSON fields; parse ISO strings at render time; never store `Date` objects in React state.

**Ask First:**
- Any server-side change (routes, filtering, data.json schema).
- Adding any dependency.

**Never:**
- Upcoming Happy Hours / "Starts at HH:MM" label — deferred by Erik 2026-06-10 (see `deferred-work.md`); server strips not-yet-active deals.
- Deal card layout/countdown (Story 2.3), gas cost (2.4), distance filter (2.5), stale handling/indicator (2.6). Render minimal deal rows; 2.3 replaces them with `DealCard`.
- No state libraries, no router, no raw error text shown to users.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Populated feed | API returns dispensaries with ≥1 active deal | One row per active deal (dispensary name, description, discount %), sorted per Always rules; timestamp visible | N/A |
| Empty feed | All `deals` arrays empty | "No active deals right now" message + timestamp visible | N/A |
| Loading | Fetch in flight | Skeleton/loading indicator; no feed, no timestamp claim | N/A |
| API error | HTTP 500 `{ error, code }` or network failure | Friendly message ("Couldn't load deals…"); no raw error/status shown | Hook sets `error`, leaves `data` null |
| Overnight HH sort | At 23:00, HH ending 02:00 vs HH ending 23:30 | 23:30 deal sorts first (minutes-until-end, wrap past midnight) | N/A |
| All-day happy hour | `happy_hour` with `startTime`/`endTime` null | Sorts after timed Happy Hours, before Daily Deals | N/A |
| Dealless dispensary | Dispensary present, `deals: []` | Not rendered; doesn't block other rows | N/A |

</frozen-after-approval>

## Code Map

- `client/src/types/index.ts` — `Deal`, `Dispensary`, `Meta`, `ApiDataResponse` (consume as-is)
- `client/src/App.tsx` — placeholder `<h1>` inside `<AgeGate>`; mount point for `DealFeed`
- `client/src/components/AgeGate.tsx` — gate from 2.1; unchanged
- `client/src/hooks/useLocalStorage.ts` — existing hook pattern reference (not used by this story)
- `client/vite.config.ts` — `/api` proxied to `:3001`; vitest jsdom + `src/test-setup.ts`
- `server/routes/dataRoute.ts` — response contract: `{ meta, dispensaries }`, 500 → `{ error, code }` (read-only reference)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/hooks/useDeals.ts` — create: fetch `/api/data` on mount (AbortController cleanup), return `{ data: ApiDataResponse | null, isLoading, error }`; non-OK status or network failure → `error` set, no throw — single sanctioned data path
- [x] `client/src/hooks/useDeals.test.ts` — create: stub `fetch`; cover success, HTTP 500, network reject, abort-on-unmount
- [x] `client/src/utils/sortDeals.ts` — create: pure `sortDeals(dispensaries, now): Array<{ dispensary, deal }>` flattening active deals and ordering per Always rules + matrix edge cases — testable without rendering
- [x] `client/src/utils/sortDeals.test.ts` — create: unit-test every I/O-matrix sort case (overnight wrap, null-window HH, daily desc, dealless dispensary)
- [x] `client/src/utils/formatTime.ts` — create: `formatLastUpdated(iso: string): string` → readable local time (e.g. "Jun 10, 7:45 AM") — 2.3 extends this file for countdowns
- [x] `client/src/utils/formatTime.test.ts` — create: known ISO input → expected string; invalid ISO → safe fallback (empty string)
- [x] `client/src/components/DealFeed.tsx` — create: consumes `useDeals` + `sortDeals`; renders loading skeleton / error message / empty state / minimal deal rows; timestamp footer in populated AND empty states
- [x] `client/src/components/DealFeed.test.tsx` — create: stub `useDeals` per state; assert all four render states + sort order via row text order + timestamp presence with and without deals
- [x] `client/src/App.tsx` — modify: render `<DealFeed />` under the `<h1>` header inside `<AgeGate>`
- [x] `client/src/App.test.tsx` — modify: existing gate tests keep passing; confirmed-age render shows feed region (stub fetch to avoid real network)

**Acceptance Criteria:**
- Given age is confirmed and the API returns deals, when the page loads, then the feed lists every active deal of every non-empty dispensary in spec order.
- Given any non-loading state, when the feed renders, then `meta.lastScraperRun` is visible (formatted, not raw ISO).
- Given `DealFeed.tsx` source, when inspected, then it contains no `fetch(` call — data arrives only via `useDeals`.
- Given the full client suite, when `npm test -- --run`, `npx tsc -b`, `npm run lint` run in `client/`, then all pass with zero regressions.

## Spec Change Log

## Verification

**Commands:**
- `cd client; npm test -- --run` — expected: all suites pass (existing 18 + new)
- `cd client; npx tsc -b` — expected: zero type errors
- `cd client; npm run lint` — expected: clean

**Manual checks (if no CLI):**
- `npm run dev` in `server/` and `client/`: confirm gate → feed with seeded deals, timestamp shown; stop server → reload shows friendly error.

## Suggested Review Order

**Data fetching (the only network path)**

- Entry point: hook owns fetch lifecycle, returns `{ data, isLoading, error }` — components stay dumb
  [`useDeals.ts:10`](../../client/src/hooks/useDeals.ts#L10)

- Review-added guard: a 200 with malformed shape errors out instead of white-screening render
  [`useDeals.ts:26`](../../client/src/hooks/useDeals.ts#L26)

- Abort-on-unmount: AbortError swallowed, loading flag untouched after abort
  [`useDeals.ts:33`](../../client/src/hooks/useDeals.ts#L33)

**Sort policy (pure, render-free)**

- Tiered key: timed HH by minutes-until-end, then all-day HH, then daily by discount desc
  [`sortDeals.ts:21`](../../client/src/utils/sortDeals.ts#L21)

- Overnight wrap: negative diff +1440 so 22:00–02:00 outranks nothing it shouldn't
  [`sortDeals.ts:10`](../../client/src/utils/sortDeals.ts#L10)

- Review-added guards: missing/malformed `endTime` falls into all-day tier, never NaN comparator
  [`sortDeals.ts:23`](../../client/src/utils/sortDeals.ts#L23)

**UI state ladder**

- Four exclusive states: skeleton → friendly error (no raw text) → empty → rows
  [`DealFeed.tsx:8`](../../client/src/components/DealFeed.tsx#L8)

- Timestamp footer in empty AND populated states; hidden when ISO is unparseable
  [`DealFeed.tsx:49`](../../client/src/components/DealFeed.tsx#L49)

**Wiring**

- Feed mounts below header, inside the 2.1 age gate — nothing renders unconfirmed
  [`App.tsx:8`](../../client/src/App.tsx#L8)

**Peripherals (tests, utils)**

- Timestamp formatting: `en-US` pinned for deterministic output; invalid ISO → empty string
  [`formatTime.ts:1`](../../client/src/utils/formatTime.ts#L1)

- Sort edge cases incl. review-added missing/malformed endTime regression
  [`sortDeals.test.ts:62`](../../client/src/utils/sortDeals.test.ts#L62)

- Hook tests: success/500/network/abort plus malformed-payload regression
  [`useDeals.test.ts:36`](../../client/src/hooks/useDeals.test.ts#L36)

- Component tests stub the hook per state; sort order asserted via row text order
  [`DealFeed.test.tsx:40`](../../client/src/components/DealFeed.test.tsx#L40)

- App tests stub `fetch` globally so the gate tests never hit the network
  [`App.test.tsx:26`](../../client/src/App.test.tsx#L26)
