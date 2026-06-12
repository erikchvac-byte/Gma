---
title: 'Vehicle Precision Mode'
type: 'feature'
created: '2026-06-11'
status: 'in-review'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md']
baseline_commit: 'fdc051a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every gas cost uses national-average 28 MPG, which can be far off for Gma's actual car — threatening the R&D bar (gas cost within 15% of real). DealFeed already reads the `gma_vehicle_mpg` override, but no UI can set it.

**Approach:** A gear icon in DealFeed opens `VehicleSelector` with cascading Year → Make → Model dropdowns fed by the fueleconomy.gov public API (browser-direct, no proxy). A completed selection resolves the vehicle's combined MPG, persists `gma_vehicle_mpg` + `gma_vehicle_label`, collapses the panel to "{label} · {mpg} MPG", and recalculates all visible gas costs immediately — no reload.

## Boundaries & Constraints

**Always:**
- ALL fueleconomy.gov requests live in `useFuelEconomy.ts` and send `Accept: application/json` (API returns XML otherwise). Components never call `fetch`.
- Normalize the JSON quirk: a one-entry menu returns `menuItem` as an object, not an array — always coerce to an array.
- MPG = `comb08` from `/ws/rest/vehicle/{id}`; number or numeric string — coerce with `Number(...)`, accept only finite > 0; otherwise it's a failed lookup (panel error, nothing persisted).
- Persistence ONLY via the existing `useLocalStorage` hook, wrapped in `useVehicleMpg.ts`: `gma_vehicle_mpg` (number) + `gma_vehicle_label` (string), written together on selection.
- `VehicleSelector` is controlled: receives current `label`/`mpg`, reports via `onMpgChange(mpg, label)`, never writes localStorage or global state itself.
- Failure UX split: explicit error inside the panel; gas math silently keeps `meta.nationalMpg` — the feed never shows an error from this feature.
- DealFeed's use-site validation (finite > 0 else nationalMpg) stays; `gasCost.ts` formula/display untouched — only the MPG input changes.
- `encodeURIComponent` make/model in queries. Hook errors as `error: string | null`. TS strict, co-located Vitest tests, mobile-first Tailwind, real labeled `<select>` elements.

**Ask First:**
- Any new dependency. A backend proxy. A fourth (trim) dropdown. Changing `gasCost.ts` or `useLocalStorage.ts` signatures. Caching fueleconomy.gov responses beyond component state.

**Never:**
- No `server/` changes. No new endpoints. No removal of the nationalMpg fallback. No reset/clear-vehicle UI (not in ACs — defer). Don't touch `dealTime.ts`, `sortDeals.ts`, `DistanceFilter.tsx`, `AgeGate.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First visit | No vehicle keys in localStorage | Gear icon visible; all gas costs use nationalMpg (28) | N/A |
| Open panel | Click gear | Year dropdown populated from `/menu/year` | N/A |
| Cascade | Select year, then make | Make populates for year; Model populates for year+make; stale downstream selections reset | N/A |
| Complete selection | Model chosen; options→id→`comb08: 32` | Panel closes to "2019 Toyota Camry · 32 MPG"; every visible card recalculates with 32 immediately; both keys persisted | N/A |
| Single menuItem | API returns object instead of array | Treated as one-entry list — no crash, dropdown shows it | Normalize helper |
| API unreachable | Any fetch rejects / non-2xx | Error message inside panel; cards silently keep nationalMpg | Hook catches → `error` |
| Bad MPG | `comb08` missing / `0` / `"abc"` / `null` | Same as unreachable: panel error, localStorage untouched | Finite > 0 gate |
| Return visit | `gma_vehicle_mpg: 32`, label saved | Collapsed panel shows label + MPG; costs use 32 on load | N/A |
| Corrupt storage | `gma_vehicle_mpg` = `"abc"` / `-5` | Costs use nationalMpg; selector behaves as if no vehicle set | Use-site validation |

</frozen-after-approval>

## Code Map

- `client/src/hooks/useFuelEconomy.ts` — create: all fueleconomy.gov fetches (years, makes, models, MPG resolution)
- `client/src/hooks/useVehicleMpg.ts` — create: wraps `useLocalStorage` for both vehicle keys
- `client/src/components/VehicleSelector.tsx` — create: gear icon + panel + cascading selects + collapsed summary
- `client/src/components/DealFeed.tsx` — modify: swap raw `useLocalStorage('gma_vehicle_mpg')` (line 44) for `useVehicleMpg`; render `VehicleSelector`; `effectiveMpg` logic (lines 101–104) unchanged
- `client/src/hooks/useLocalStorage.ts` — reference only: JSON storage means mpg stored as `32`, label as quoted JSON string
- `client/src/utils/gasCost.ts` — reference only: `isPositiveFinite` reused; pure functions untouched

## Tasks & Acceptance

**Execution:**
- [x] `client/src/hooks/useFuelEconomy.ts` — create: base `https://www.fueleconomy.gov/ws/rest/vehicle`; `loadYears()`, `loadMakes(year)`, `loadModels(year, make)` exposing `years/makes/models: string[]`; `resolveMpg(year, make, model)` = `/menu/options` → first option's `value` (vehicle id) → `/vehicle/{id}` → validated `comb08`; `error` + `isLoading`; menuItem normalization
- [x] `client/src/hooks/useFuelEconomy.test.ts` — create: mocked fetch — happy cascade, Accept header on every call, single-object menuItem, reject/non-2xx → error, bad comb08 variants
- [x] `client/src/hooks/useVehicleMpg.ts` — create: `{ mpg, label, setVehicle(mpg, label) }` over the two `gma_` keys
- [x] `client/src/hooks/useVehicleMpg.test.ts` — create: persists both keys, restores on mount, tolerates garbage
- [x] `client/src/components/VehicleSelector.tsx` — create: gear button (aria-label), three labeled selects (Make disabled until Year, Model until Make), panel error display, collapsed "{label} · {mpg} MPG" state, `onMpgChange` on completion then close
- [x] `client/src/components/VehicleSelector.test.tsx` — create: cascade enablement, selection → callback + close, error render, restored-label render
- [x] `client/src/components/DealFeed.tsx` — modify: integrate `useVehicleMpg` + `VehicleSelector`; selection updates card gas costs in the same render pass
- [x] `client/src/components/DealFeed.test.tsx` — extend: selection recalculates gas costs immediately; corrupt stored mpg still falls back to 28

**Acceptance Criteria:**
- Given no vehicle is set, when the feed renders, then the gear icon is visible and gas costs use `meta.nationalMpg`.
- Given a completed Year→Make→Model selection, when confirmed, then the panel closes showing the vehicle's MPG, all card gas costs update without reload, and both localStorage keys are saved.
- Given a saved vehicle, when the page reloads, then the label and vehicle MPG are restored and used.
- Given fueleconomy.gov is down, when the panel is opened, then an error shows in the panel only and no unhandled rejection or feed error occurs.
- Given `cd client; npm test -- --run; npx tsc -b; npm run lint`, when run, then all pass; `server/` untouched (`cd server; npm test -- --run` unchanged).

## Spec Change Log

## Design Notes

- fueleconomy.gov menus don't carry MPG — two extra calls: `/menu/options?year&make&model` (each entry = a trim, `value` = vehicle id) then `/vehicle/{id}` for `comb08`. **Trim policy: take the first option** — deterministic, no fourth dropdown.
- Gear icon renders inside DealFeed (not App) so selector and `effectiveMpg` share one `useVehicleMpg` instance — selection re-renders cards automatically, no lifted state. Gear absent during loading skeleton/error screen: acceptable, no gas costs exist there.

## Verification

**Commands:**
- `cd client; npm test -- --run` — expected: all suites pass incl. new hook/component tests
- `cd client; npx tsc -b` — expected: zero type errors
- `cd client; npm run lint` — expected: clean
- `cd server; npm test -- --run` — expected: unchanged (no server edits)

**Manual checks (if no CLI):**
- `npm run dev` both sides: pick a real vehicle, gas costs change instantly; reload → label + MPG persist; offline → panel error, cards keep national-average costs.
