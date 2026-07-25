# Architecture — Client (`client/`)

> Part type: **web** (React SPA). Quick Scan, 2026-06-21.

## Executive summary

A single-page React 19 app that fetches the deal feed from `GET /api/data`, computes **true cost** (sticker + round-trip gas), and renders deals ranked cheapest-first, grouped by store. Entry is gated behind a mandatory 21+ age gate; legal warnings are rendered from a single constants module. Theming is done entirely with CSS custom properties (current theme: Daylight, ADR-042).

## Technology stack

| Category | Technology | Version | Notes |
|---|---|---|---|
| Language | TypeScript | ~6.0 | strict mode (CLAUDE.md rule) |
| UI framework | React | ^19.2 | function components + hooks only |
| Build tool | Vite | ^8.0 | `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Styling | Tailwind v4 + CSS vars | ^4.3 | design tokens in `src/styles/tokens.css` |
| Testing | Vitest + Testing Library | ^4.1 | jsdom env; near-1:1 `*.test.tsx` coverage |
| Lint | ESLint (flat) | ^10 | `eslint-plugin-react-hooks`, `react-refresh` |

## Architecture pattern

**Component hierarchy + hooks.** No global state library — state is local (`useState`) and lifted to `App` only where shared (vehicle MPG, user location, settings-sheet toggle). Data fetching is encapsulated in `useDeals`; persistence in `useLocalStorage`/`useVehicleMpg`/`useLocation`.

Composition root (`src/App.tsx`):

```
<AgeGate>                            # blocks until 21+ confirmed (persisted in localStorage)
  <LocationOnboarding/>             # first-run only: set location (GPS or WA ZIP) or skip (ADR-057)
  <Header/>                          # wordmark only (settings gear retired, ADR-058)
  <LocationBar .../>                # persistent: set/change location; no location -> no distances (ADR-057)
  <VehicleBar mpg label onOpen/>    # persistent labeled control -> opens VehicleSelector (CAP-5, ADR-058)
  <main><DealFeed mpg location/></main>  # apply user distance -> compute gas -> sort -> group -> DealCards
  <DisclaimerFooter />              # mandated WAC warnings
  <VehicleSelector .../>            # bottom-sheet: pick vehicle/MPG (opened by VehicleBar)
</AgeGate>
```

## Data flow

1. `useDeals()` fetches `/api/data` once on mount (AbortController-cancellable), validates the response shape, and drops malformed dispensary records via `normalizeDispensaries` before they reach render (also strips non-finite `lat`/`lng` while keeping the store, ADR-057).
2. `DealFeed` applies `applyUserDistance` (haversine × 1.3 from the user's location, ADR-057) to set each store's `distanceMiles`, resolves the user's MPG (from `useVehicleMpg`) and the meta gas price, computes per-deal gas cost via `utils/gasCost.roundTripGasCost`, sorts/groups, and renders. No location → no distance/gas; no vehicle → no gas (distance still shows).
3. `DealCard` shows the discount, distance pill, gas line, (deferred) happy-hour badge, and — when present — a "real price drop" strip (`ValueDropStrip`, ADR-088) fed by `useValueDrops` from the engine's derived facts.

True-cost math lives in `utils/gasCost.ts`:

```
driveCost = distanceMiles * 2 * (gasPrice / mpg)   // null unless all inputs finite & > 0
```

## Key directories

- `components/` — feature components; `components/ui/` — reusable primitives (see [Component Inventory](./component-inventory.md)).
- `hooks/` — `useDeals`, `useVehicleMpg`, `useFuelEconomy`, `useLocalStorage`, `useNow`, `useLocation` (GPS / WA-ZIP → user coords, ADR-057), `useValueDrops` (derived price-drop facts, ADR-087).
- `utils/` — `gasCost`, `sortDeals`, `dealView`, `dealTime`, `formatTime`, `normalizeDispensaries`.
- `constants/legal.ts` — single home for verbatim regulated-content warnings.
- `types/index.ts` — `Deal`/`Dispensary`/`Meta`/`ApiDataResponse`, the contract shared with the server (see [Data Models](./data-models.md)).
- `styles/` — `tokens.css` (CSS custom properties) + `components.css`.

## Development workflow

```bash
npm install --prefix client
npm run dev   --prefix client    # Vite dev server (http://localhost:5173)
npm run build --prefix client    # tsc -b && vite build -> client/dist
npm run test  --prefix client    # Vitest
npm run lint  --prefix client
```

In production the client is **not** served by Vite — the Express server serves `client/dist` statically (same origin), so `/api/data` is a same-origin call.

## Testing strategy

Vitest + React Testing Library with a `*.test.tsx`/`*.test.ts` file beside nearly every component, hook, and util (`test-setup.ts`, `jest-dom`). Pure logic (gas math, sorting, deal-view, time formatting) is unit-tested directly.
