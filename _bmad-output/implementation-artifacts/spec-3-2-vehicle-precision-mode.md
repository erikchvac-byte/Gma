---
title: 'Vehicle Precision Mode'
type: 'feature'
created: '2026-06-11'
status: 'done'
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

### Review Findings

Three-layer adversarial review 2026-06-11 (Blind Hunter / Edge Case Hunter / Acceptance Auditor) on `fdc051a..b34689b`. Auditor verdict: 5/5 ACs pass, 0 spec violations. Findings:

- [x] [Review][Patch] Cascade menu fetches have no stale-response invalidation — out-of-order `loadMakes`/`loadModels` responses can populate lists for the wrong year/make; shared `run` lets overlapping calls corrupt `isLoading`/`error`; previous year's makes stay enabled and selectable while the replacement fetch is in flight [client/src/hooks/useFuelEconomy.ts:52-80, client/src/components/VehicleSelector.tsx:105,124]
- [x] [Review][Patch] In-flight `resolveMpg` not invalidated by a newer selection — last network response wins, can fire `onMpgChange` with an abandoned vehicle (or a pre-change `${year} ${make}` closure) and persist the wrong MPG/label [client/src/components/VehicleSelector.tsx:43-52, client/src/hooks/useFuelEconomy.ts:99-123]
- [x] [Review][Patch] Panel error message is hardcoded and misleading — hook's specific errors ("No vehicles found…", "No MPG available…") are dead code, and "Gas costs will use the national average" is false when a saved vehicle remains in effect [client/src/components/VehicleSelector.tsx:62-66]
- [x] [Review][Patch] mpg/label pair validated independently — valid `gma_vehicle_mpg` + corrupt/missing `gma_vehicle_label` personalizes every gas cost with zero visible indicator; validate the pair atomically [client/src/hooks/useVehicleMpg.ts:29-30]
- [x] [Review][Patch] Stale error alert survives panel close/reopen — `togglePanel` never clears `error` and skips `loadYears` once populated [client/src/components/VehicleSelector.tsx:24-28]
- [x] [Review][Patch] Duplicate menu `value` entries collide as React keys — dedupe in `toMenuValues` [client/src/hooks/useFuelEconomy.ts:22-32]
- [x] [Review][Patch] A11y: decorative ⚙️ glyph not `aria-hidden`; `aria-expanded` without `aria-controls` [client/src/components/VehicleSelector.tsx:55-64]
- [x] [Review][Defer] No loading indicator and no fetch timeout — `isLoading` exposed but never rendered; a hung request leaves an empty panel with no feedback — deferred, UX polish beyond spec scope
- [x] [Review][Defer] Failed mid-cascade load has no retry path — same-value re-select fires no change event; reopen skips `loadYears` — deferred, retry affordance is a UX design decision
- [x] [Review][Defer] HTTP 200 with empty menu is a silent dead end — placeholder-only dropdown, no "no data" message — deferred, UX polish beyond spec scope

Dismissed as noise (3): `setVehicle` write-path validation (guarded upstream by `resolveMpg`'s finite>0 gate + read-path validation); `vi.useRealTimers()` leak (false positive — top-level `beforeEach` re-fakes timers per test); cross-tab localStorage sync (already tracked in deferred-work.md).

#### Review pass 2 (2026-06-12) — Blind Hunter / Edge Case Hunter / Acceptance Auditor on the patch-pass diff

Acceptance Auditor verdict: 0 violations, all 7 [Patch] items genuinely resolved, all constraints respected. Findings:

- [x] [Review][Patch] `clearError()` on reopen doesn't invalidate in-flight operations, so a stale error from a lookup abandoned by closing the panel can land after reopen and undo the clear [client/src/hooks/useFuelEconomy.ts:78-80, client/src/components/VehicleSelector.tsx:31-36]
- [x] [Review][Patch] `useVehicleMpg.ts` comment claims a guarantee about "the collapsed summary" that this hook has no visibility into — rewrite to describe only this hook's own contract [client/src/hooks/useVehicleMpg.ts:14-18]
- [x] [Review][Patch] Atomic pair validation tests cover 3 of 4 corruption permutations — missing the "both mpg and label corrupt" case [client/src/hooks/useVehicleMpg.test.ts]
- [x] [Review][Defer] `loadMakes`/`loadModels` now clear state before fetching, causing a visible flash of empty options on every cascade step even for fast successful requests — UX polish, same bucket as the existing "no loading indicator" deferral [client/src/hooks/useFuelEconomy.ts:91-116]
- [x] [Review][Defer] `toMenuValues` dedupes by `value` only, discarding distinct `text` for same-value entries (e.g. "2020" vs "2020 (alt)") — pre-existing information loss, not introduced by this diff [client/src/hooks/useFuelEconomy.ts:27-34]

Dismissed as noise (8): raw error message exposure (intentional — this is the "Honest panel error" fix itself); `selectionRef`/`seqRef` "redundancy" (distinct layers, callback-gating vs. hook-state-gating, both needed); missing `isLoading` assertion in the abandoned-lookup test (test-quality nit, behavior already correct); untested closed-state aria attributes (test-quality nit); "clears stale error" test's reliance on the `years.length` skip branch (test-quality nit); DealFeed test coverage for mpg-without-label (checked — other such tests are garbage-mpg tests, unaffected); `resolveMpg` doing wasted work for superseded calls before its final gate (perf nit, not a correctness bug); cross-cascade `loadMakes`/`loadModels` race (Edge Case Hunter confirmed unreachable — selects are `disabled` until their parent load completes).

## Spec Change Log

- 2026-06-12 (review pass 2 fixes, patch-level — 3 [Patch] items resolved, 1 new test): **clearError now invalidates in-flight ops** — `clearError()` bumps `seqRef` and resets `isLoading` to `false`, so an operation abandoned by closing the panel (not just by changing Year/Make/Model) can no longer write `error`/`isLoading` after the clear once it settles. **Comment fix** — `useVehicleMpg.ts`'s atomic-pair comment no longer claims visibility into how `DealFeed` renders the collapsed summary. **Test coverage** — added the "both mpg and label corrupt" permutation to `useVehicleMpg.test.ts`'s atomic-pair suite. Files: `useFuelEconomy.ts/.test.ts`, `useVehicleMpg.ts/.test.ts`. Verification: client 190/190 (was 188), `tsc -b` clean, lint clean.
- 2026-06-12 (review pass 1 fixes, patch-level — all 7 [Patch] items resolved, red-green per item, 14 new tests): **Stale-response invalidation** — `useFuelEconomy` gains a monotonic `seqRef`; `run` hands each operation an `isCurrent()` predicate and a superseded operation may not write `years/makes/models/error/isLoading` (out-of-order responses lose); `loadMakes` clears `makes`+`models` and `loadModels` clears `models` synchronously before fetching so stale entries aren't selectable mid-flight. **resolveMpg supersession** — a superseded lookup resolves `null` (hook side), and `VehicleSelector` adds a `selectionRef` token bumped on every Year/Make/Model change so an abandoned in-flight lookup (including the pre-change `${year} ${make}` closure) can never fire `onMpgChange`. **Honest panel error** — alert now renders the hook's actual `error` text plus a context-aware second line ("keep using your saved vehicle" when `mpg` prop is set, else national average). **Atomic pair validation** — `useVehicleMpg` returns `{mpg, label}` all-or-nothing; a half-corrupt pair reads as no vehicle (DealFeed test updated to store both keys). **Reopen clears stale error** — hook exposes `clearError()`; `togglePanel` calls it on open. **Dedupe** — `toMenuValues` dedupes via `Set` (React key collisions). **A11y** — ⚙️ glyph wrapped in `aria-hidden` span; `aria-controls={panelId}` links button to panel when open. Files: `useFuelEconomy.ts/.test.ts`, `useVehicleMpg.ts/.test.ts`, `VehicleSelector.tsx/.test.tsx`, `DealFeed.test.tsx`. Verification: client 188/188 (was 174), `tsc -b` clean, lint clean, server 37/37 untouched.

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
