# Epic 2 Context: Core Deal Experience

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user opens the app, confirms they are 21+, and immediately sees active cannabis deals near them — each card showing dispensary name, road distance, discount, time window, and round-trip gas cost. They can filter by distance and always see when data was last updated. This epic delivers the entire user-facing surface of the product and directly serves the core question: "is this deal worth the drive right now?" It builds on the Epic 1 API (`GET /api/data`), which already returns active-only deals pre-filtered server-side in Pacific Time.

## Stories

- Story 2.1: Age Gate
- Story 2.2: Deal Feed with Active Deals & Empty State
- Story 2.3: Deal Cards
- Story 2.4: Gas Cost Calculation
- Story 2.5: Distance Filter
- Story 2.6: Stale Source Indicator

## Requirements & Constraints

- **Age gate first**: a full-page overlay blocks ALL content until the user clicks "I am 21 or older." Deal feed must not render before confirmation. Confirmation persists in localStorage; clearing localStorage resets the gate. This is a legal compliance requirement, not a UX nicety.
- **Sort order**: active Happy Hours first (soonest-ending first), then Daily Deals (highest discount % first). Happy Hours starting later today appear below active ones with a "Starts at HH:MM" label.
- **Deal card content**: dispensary name, road distance (1 decimal, e.g., "12.4 miles"), gas cost (2 decimals, e.g., "$1.80"), deal description, discount %, and active window or "Active today." Discount % and gas cost appear side by side ("35% off — $1.80 to get there").
- **Countdown**: active Happy Hour cards show time remaining (HH:MM), ticking every 60 seconds without page reload. When the window closes, the card disappears automatically.
- **Gas cost**: visible on every card on first load with zero user action. Formula: `(distanceMiles × 2) × (gasPrice / mpg)`. Uses `gma_vehicle_mpg` from localStorage if set, otherwise `meta.nationalMpg` (28) from the API.
- **Distance filter**: 1–50 miles, default 25, applied client-side against the full dispensary array — no re-fetch on change. Persists as `gma_distance_miles`. Values above 50 are not settable.
- **Last-updated timestamp** (`meta.lastScraperRun`) is visible at all times, not only in the empty state. Empty state shows a no-deals message plus this timestamp.
- **Stale sources**: dispensaries with `stale: true` are omitted from the feed; a non-intrusive indicator shows the count of unavailable sources. Never inflate the feed by showing stale data — a smaller accurate feed beats a larger inaccurate one.
- **Success bar (R&D)**: the test group must be able to make a go/no-go trip decision from the side-by-side discount/gas display alone, and the displayed math must hold up on real trips (gas cost within 15% of actual).

## Technical Decisions

- **API contract**: single `GET /api/data` returns `{ meta: { lastScraperRun, gasPrice, nationalMpg, gasPriceUpdatedAt }, dispensaries: [...] }` — deals already filtered to active-only server-side. The client applies only the distance filter. Errors: `{ error, code }` with HTTP 500.
- **Component boundaries** (files in `client/src/components/`): `AgeGate.tsx` wraps `App` — nothing below renders until confirmed. `DealFeed.tsx` owns distance filtering and empty/loading/error states. `DealCard.tsx` is purely presentational — receives `Dispensary` data and computed values as props, fetches nothing. `DistanceFilter.tsx`, `StaleIndicator.tsx` complete the set.
- **Hooks-only data access**: all fetching goes through `client/src/hooks/useDeals.ts` returning `{ data, isLoading, error }`. Zero direct `fetch()` calls in components. Render pattern: `isLoading` → skeleton, `error` → friendly message (no raw errors), `data` → feed.
- **Pure utilities**: gas cost is a pure function in `client/src/utils/gasCost.ts` (never inlined in components); time formatting (countdown, 24h→12h, ISO→readable) in `client/src/utils/formatTime.ts`.
- **Types**: `Deal`, `Dispensary`, `Meta`, `ApiDataResponse` live in `client/src/types/index.ts` (created in Epic 1 — consume, don't redefine).
- **localStorage keys**: `gma_` prefix, snake_case — `gma_age_confirmed` (`"true"`), `gma_distance_miles` (default `"25"`), `gma_vehicle_mpg` (read-only fallback handling in this epic; set by Epic 3). Generic typed access via `hooks/useLocalStorage.ts`.
- **Deal time fields** arrive as 24-hour strings (`"09:00"`, `"22:00"`) or `null` for all-day; all JSON fields are camelCase (`discountPct`, `distanceMiles`). ISO 8601 strings for timestamps — parse to `Date` at render time, never store `Date` objects in React state.
- **Countdown mechanism**: `setInterval` (60s tick) inside `useEffect`, cleaned up on unmount; re-evaluates active status and remaining time client-side.
- **No client-side router** — single page. React built-ins only for state (no state libraries). Tailwind CSS v4 via Vite plugin (no tailwind.config.js). TypeScript strict mode. Vitest tests co-located (`*.test.tsx`).

## UX & Interaction Patterns

- **Mobile-first, responsive** — the primary use case is checking deals on a phone before getting in the car; desktop must also work.
- **Distance filter is a slider** (`<input type="range" min="1" max="50">`), not a numeric text input — recorded decision.
- **Tone**: clear, direct, honest math. Not cannabis-branded (no green-leaf imagery or stoner humor), not youth-coded, and not "simplified for seniors."
- **Stale indicator is non-intrusive** — must not disrupt feed layout or demand user action.

## Cross-Story Dependencies

- Story 2.1 (Age Gate) gates everything — no other story's UI is visible until it's in place; it wraps `App` at the component-tree root.
- Story 2.2 (Deal Feed) is the host for 2.3 (cards), 2.5 (filter results), and 2.6 (stale indicator); 2.3's countdown-expiry behavior depends on the feed re-evaluating active status.
- Story 2.4's `gasCost.ts` output renders inside 2.3's cards; design it as a pure function so Epic 3 (vehicle MPG override, live EIA gas price) plugs in without rework.
- All stories depend on Epic 1's `GET /api/data` endpoint and shared types being complete.
