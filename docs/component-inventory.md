# Component Inventory — Client (`client/src`)

> Quick Scan, 2026-06-21. React 19 function components. Nearly every entry has a colocated `*.test.tsx`. Theming via CSS custom properties (`styles/tokens.css`); current theme Synthwave (ADR-040).

## Feature components (`components/`)

| Component | Category | Responsibility |
|---|---|---|
| `AgeGate` | Gate / layout | Mandatory 21+ entry gate; persists pass in `localStorage`; renders children only when confirmed. **Legally required** (WAC 314-55-155). |
| `Header` | Navigation | Wordmark only (no props). Settings gear retired — vehicle opens from `VehicleBar` (ADR-058). |
| `LocationOnboarding` | Gate / sheet | First-run-only step after the age gate to set location (GPS or WA ZIP) or skip; focus-trapped (ADR-057). |
| `LocationBar` | Navigation / form | Persistent top-of-feed control to set/change user location; no location → no distances/gas (ADR-057). |
| `VehicleBar` | Navigation / form | Persistent labeled control; no vehicle → "Set your vehicle…" CTA, set → "label · NN MPG" + Change; opens `VehicleSelector` (CAP-5, ADR-058). |
| `LocationInput` | Form | Shared two-door input (GPS button + WA-ZIP field) used by `LocationOnboarding` and `LocationBar` (ADR-057). |
| `DealFeed` | Container | Fetches via `useDeals`, applies user-relative distance, resolves MPG, computes gas cost, sorts/groups, renders `DealCard`s; owns loading/error/empty states. |
| `DealCard` | Display | One deal: discount, distance pill, gas line, "off" label, (deferred) happy-hour badge. |
| `DealTypeFilter` | Form / filter | Chip filter over deal types (daily / happy_hour). |
| `DistanceFilter` | Form / filter | Distance slider (default 50mi, ADR-038). |
| `VehicleSelector` | Form / sheet | Bottom sheet to pick vehicle/MPG; drives gas math. Opened by `VehicleBar`. |
| `StaleIndicator` | Display | Flags dispensaries whose last scrape failed (`stale:true`). |
| `DisclaimerFooter` | Layout / legal | Renders verbatim mandated warnings from `constants/legal.ts`. |

## UI primitives (`components/ui/`)

Reusable design-system building blocks (exported via `ui/index.ts`):

| Primitive | Category |
|---|---|
| `Button` | Action |
| `IconButton` | Action |
| `Icon` | Display |
| `Card` | Layout container |
| `Badge` | Display / status |
| `Notice` | Feedback / banner |
| `Select` | Form input |
| `TextField` | Form input |
| `RangeSlider` | Form input |
| `Skeleton` | Loading placeholder |

## Hooks (`hooks/`)

| Hook | Purpose |
|---|---|
| `useDeals` | Fetch `GET /api/data` on mount; validate shape; normalize dispensaries. |
| `useVehicleMpg` | Resolve + persist the user's vehicle MPG (label + setter). |
| `useFuelEconomy` | Vehicle/MPG data helper. |
| `useLocalStorage` | Generic persisted-state hook. |
| `useNow` | Ticking "now" for time-window/countdown logic. |

## Logic utilities (`utils/`)

| Util | Purpose |
|---|---|
| `gasCost` | **True-cost math** — `roundTripGasCost`, `isPositiveFinite`, `formatGasCost`. |
| `sortDeals` | Order deals/stores (closest-first, ADR-039). |
| `dealView` | Map raw deals to view models for `DealCard`. |
| `dealTime` / `formatTime` | Parse/format deal windows and countdowns. |
| `normalizeDispensaries` | Drop malformed dispensary records before render. |

## Constants & types

- `constants/legal.ts` — single home for verbatim WAC 314-55-155 warning strings (do not retype).
- `types/index.ts` — `Deal` / `Dispensary` / `Meta` / `ApiDataResponse` (shared with server). See [Data Models](./data-models.md).

## Design system source

Out-of-app design reference lives in `design-system/` (tokens, guidelines, component specs, theme bundles) and `GMAS_LIST_BRIEF.md`. It is not compiled into the client — the client implements those tokens in `styles/tokens.css`.
