# Epic 3 Context: Gas Cost Accuracy & Personalization

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the gas math trustworthy and personalizable. The gas price used in every deal card calculation moves from a static seed value to a live, server-side EIA API feed refreshed on a schedule (no more than 24 hours stale). Users can optionally select their vehicle's year/make/model from fueleconomy.gov to replace the national-average MPG with their car's actual fuel efficiency. This directly supports the product's core promise — telling the truth about whether a deal is worth the drive — and is validated by the R&D success bar that gas cost shown must be within 15% of the actual round-trip fuel cost.

## Stories

- Story 3.1: EIA Gas Price Refresh
- Story 3.2: Vehicle Precision Mode

## Requirements & Constraints

- Gas Price is fetched server-side from the EIA API and refreshed on a schedule; the value used in calculations must be no more than 24 hours old under normal operation.
- On server start, the gas price refresh runs immediately, then on its schedule. A successful fetch updates `meta.gasPrice` and sets `meta.gasPriceUpdatedAt` to the current ISO timestamp.
- If the EIA API is unreachable, keep the last known `meta.gasPrice` unchanged, log the error, and never crash the server.
- A gear icon opens three cascading dropdowns (Year → Make → Model) populated from the fueleconomy.gov public API. Selecting a model: closes the panel, displays the selected vehicle's MPG, immediately switches all gas cost calculations to the vehicle MPG, and persists the selection.
- A previously selected vehicle is restored from localStorage on return visits (label shown, vehicle MPG used).
- If fueleconomy.gov is unreachable, the dropdowns show an error message and gas costs silently continue using national-average MPG (28) — no unhandled errors.
- No server-side user data: vehicle selection lives entirely in localStorage; the fueleconomy.gov calls go directly from the browser (no backend proxy).
- Success bar: gas cost on a sampled trip within 15% of actual round-trip fuel cost.

## Technical Decisions

- **EIA API**: free, official, weekly update cadence (acceptable — weekly price swings don't flip go/no-go decisions). API key read from `process.env.EIA_API_KEY` (`.env`, never committed, never hardcoded); `.env.example` is the committed template.
- **Server file layout**: refresh logic lives in `server/utils/refreshGasPrice.ts`, called from `server/index.ts` at startup. All `data.json` writes go through `server/utils/atomicWrite.ts` (write `data.tmp.json`, then `fs.renameSync` → `data.json`) — never direct writes.
- **Data flow**: `refreshGasPrice.ts` patches `meta.gasPrice` / `meta.gasPriceUpdatedAt` in `data.json`; `GET /api/data` (the single endpoint) serves it; the frontend recalculates gas costs from the response. No new endpoints.
- **Client file layout**: `VehicleSelector.tsx` (gear icon + cascading dropdowns), `useFuelEconomy.ts` (all fueleconomy.gov fetches — years, makes, models), `useVehicleMpg.ts` (reads/writes the vehicle localStorage keys). No raw `fetch()` in components — all data access through hooks.
- **fueleconomy.gov returns XML by default.** Every request in `useFuelEconomy.ts` MUST send `Accept: application/json`.
- **MPG override**: `gasCost.ts` (pure function from Story 2.4) uses the vehicle MPG from localStorage when set; otherwise `meta.nationalMpg` (28). Override is client-side only.
- **localStorage keys**: `gma_vehicle_mpg` (e.g., `"32"`) and `gma_vehicle_label` (e.g., `"2019 Toyota Camry"`). `gma_` prefix + snake_case, consistent with existing keys.
- **Conventions**: camelCase for all JSON fields, TypeScript strict mode, Vitest tests co-located (`*.test.ts` / `*.test.tsx`), constants in SCREAMING_SNAKE_CASE, errors caught at the hook level and exposed as `error: string | null`.

## UX & Interaction Patterns

- The gear icon is always visible; with no vehicle set, all gas costs use the national average — precision mode is strictly opt-in.
- Dropdowns cascade: Year populates first; selecting a year populates Make; selecting a make populates Model.
- After selection the panel collapses to show the selected vehicle's MPG; all visible card gas costs update immediately without reload.
- API failure UX: explicit error inside the dropdown panel, silent fallback in the gas math — the feed itself never shows an error from this feature.
- Mobile-first: the panel and dropdowns must work well on phones (primary use case is a pre-trip check).

## Cross-Story Dependencies

- Both stories build on Epic 1's `data.json` schema (`meta.gasPrice`, `meta.gasPriceUpdatedAt`, `meta.nationalMpg`) and the `GET /api/data` endpoint.
- Story 3.2 plugs into `gasCost.ts` and the deal card gas display from Epic 2 (Story 2.4) — it changes the MPG input, not the formula or display.
- Story 3.1 introduces `atomicWrite.ts` if it doesn't exist yet; Epic 4's scraper engine (`runScrapers.ts`) reuses the same utility — keep it generic.
- `VehicleSelector` notifies its parent via an `onMpgChange(mpg, label)` callback rather than writing global state, so the parent can trigger recalculation across cards.
- The two stories are independent of each other and can be implemented in either order.
