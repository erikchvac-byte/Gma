---
title: 'Obvious vehicle control — CAP-5'
type: 'feature'
created: '2026-06-27'
status: 'done'
baseline_commit: '749a3c4396413db5e9b06861b8ed989a3dc6b7e6'
context:
  - '{project-root}/_bmad-output/specs/spec-location-distance-and-card-revisions/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-location-distance-and-card-revisions/mechanism.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The only way to set a vehicle is an unlabeled gear `IconButton` in the `Header`. Since chunk 1 removed the national-MPG default, gas costs now require a chosen vehicle — yet a first-time user has no discoverable path to that feature (CAP-5: the control is concealed behind an unlabeled icon).

**Approach:** Add a persistent, labeled `VehicleBar` at the top of the feed, mirroring chunk 2's `LocationBar` (Erik-confirmed). No vehicle → a plainly labeled "Set your vehicle for gas costs" call-to-action; vehicle set → a one-line "&lt;year make model&gt; · NN MPG" summary with a "Change" control. Both open the existing `VehicleSelector` bottom sheet. Remove the now-redundant `Header` gear so there is a single, obvious entry point (Erik-confirmed).

## Boundaries & Constraints

**Always:**
- The vehicle control is plainly visible and labeled in the primary flow (not behind an icon-only affordance). Its purpose is obvious from its text alone (CAP-5 success criterion).
- Reuse the existing `VehicleSelector` sheet and `useVehicleMpg` hook unchanged for state; `VehicleBar` is a presentational trigger + summary only. The cascade, fueleconomy fetch, and MPG resolution are untouched.
- Honest Math (ADR-007/009): the bar shows only the real stored vehicle label/MPG (validated by `useVehicleMpg`); it never displays a gas figure or a guessed value. No vehicle → CTA, never a placeholder MPG.
- Match `LocationBar`'s visual + structural pattern (summary row + action button; same `.gma-*-bar` styling family) so the two controls read as a pair above the feed.
- Closing the sheet returns focus to the `VehicleBar` control that opened it (the existing sheet already restores focus to the previously-focused element).
- TypeScript strict; tests for every behavior.

**Ask First:**
- Any change to `VehicleSelector`'s internal cascade, copy, or the fueleconomy.gov fetch path (that is chunk 3-CAP-5's sibling, explicitly deferred).

**Never:**
- No fueleconomy.gov hardening (timeout/spinner/retry/empty-result) — deferred.
- No radius-slider reframe / empty-feed fix (#1 / ADR-044 #5) — deferred.
- No second vehicle entry point left behind: the unlabeled `Header` gear is removed, not duplicated.
- No new persistence key — vehicle state stays in `gma_vehicle_mpg` / `gma_vehicle_label` via `useVehicleMpg`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No vehicle | `mpg=null,label=null` | Bar shows labeled CTA "Set your vehicle for gas costs" + a "Set" button; activating opens the sheet | N/A |
| Vehicle set | `mpg=32,label='2019 Toyota Camry'` | Bar shows "2019 Toyota Camry · 32 MPG" + a "Change" button; activating opens the sheet | N/A |
| Corrupt vehicle storage | one of the pair missing/garbage | `useVehicleMpg` yields `{mpg:null,label:null}` → bar shows the CTA (no half-state) | N/A |
| Sheet closed | user closes `VehicleSelector` | focus returns to the `VehicleBar` trigger | N/A |
| Header inspected | any | no unlabeled settings/gear icon present; wordmark `h1` intact | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/VehicleBar.tsx` -- NEW. Persistent labeled control; props `{ mpg, label, onOpen }`. Summary-or-CTA + action button, mirroring `LocationBar`.
- `client/src/components/LocationBar.tsx` -- reference pattern to mirror (structure, classes, summary/toggle shape).
- `client/src/components/Header.tsx` -- remove the gear `IconButton` and the `onOpenSettings` prop; Header becomes the wordmark only.
- `client/src/App.tsx` -- render `<VehicleBar mpg label onOpen={() => setSettingsOpen(true)} />` directly below `LocationBar`; drop `onOpenSettings` on `Header` (keep `settingsOpen` state + `VehicleSelector`).
- `client/src/components/VehicleSelector.tsx` -- unchanged (opened by the bar; already restores focus to opener).
- `client/src/hooks/useVehicleMpg.ts` -- unchanged source of `mpg`/`label`.
- `client/src/styles/components.css` -- add `.gma-vehicle-bar` styles (or reuse the location-bar family).
- `client/src/components/Header.test.tsx` -- remove gear tests; assert wordmark present and no settings button.
- `client/src/components/VehicleBar.test.tsx` -- NEW. CTA vs summary states, button opens (onOpen called), corrupt-state CTA.
- `client/src/App.test.tsx` -- open the sheet via the new `VehicleBar` control instead of the gear.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/components/VehicleBar.tsx` -- create the labeled persistent control (CTA when no vehicle; "label · NN MPG" + Change when set; action calls `onOpen`), mirroring `LocationBar`.
- [x] `client/src/components/Header.tsx` -- remove the gear `IconButton` + `onOpenSettings` prop.
- [x] `client/src/App.tsx` -- mount `VehicleBar` below `LocationBar`, wire `onOpen` to `setSettingsOpen(true)`; remove `Header`'s `onOpenSettings`.
- [x] `client/src/styles/components.css` -- add `.gma-vehicle-bar` styling consistent with `.gma-location-bar`.
- [x] `client/src/components/VehicleBar.test.tsx` -- unit-test the I/O matrix rows (CTA, summary, corrupt-state, opens on activate).
- [x] `client/src/components/Header.test.tsx` -- drop gear tests; assert no settings button + wordmark intact.
- [x] `client/src/App.test.tsx` -- update the two gear-driven sheet-open flows to use the `VehicleBar` control.

**Acceptance Criteria:**
- Given no vehicle is set, when the feed renders, then a clearly labeled "Set your vehicle…" control is visible above the feed and activating it opens the vehicle sheet.
- Given a vehicle is set, when the feed renders, then the bar shows "&lt;label&gt; · NN MPG" with a Change control that reopens the sheet.
- Given the header is inspected, then no unlabeled gear/settings icon remains and the wordmark `h1` is intact.
- Given the vehicle sheet is closed, then keyboard focus returns to the `VehicleBar` control that opened it.

## Spec Change Log

- **2026-06-27 (step-04 review — clean pass, no loopback):** 3 reviewers (blind / edge-case / acceptance auditor). Acceptance auditor: all 4 ACs MET, Honest Math held, scope clean. Blind-hunter compile-break flags (Header `Icon` import, App `label`) refuted by the green `tsc -b` build + `label` destructured at `App.tsx:21`; brittle-`getByRole` and CTA-prominence flags rejected (suite passes; "Set" unique; CTA mirrors LocationBar). One DEFER: integer-validate MPG at `resolveMpg` source (not reachable today; logged to `deferred-work.md`, pairs with deferred fueleconomy hardening). No intent_gap / bad_spec / patch.

## Design Notes

Mirror `LocationBar` exactly so the two read as a pair: a `<section class="gma-vehicle-bar" aria-label="Your vehicle">` with a summary row (Icon `car` + text) and a right-aligned `Button` ("Set" when `mpg===null`, "Change" otherwise) that calls `onOpen`. No local "expanded" state — unlike LocationBar there is no inline editor; the action always opens the existing sheet. Summary text: `mpg===null` → "Set your vehicle for gas costs"; else `` `${label} · ${mpg} MPG` ``.

## Verification

**Commands:**
- `cd client && npx vitest run` -- expected: all client suites green (incl. new `VehicleBar.test.tsx`, updated `Header`/`App` tests)
- `cd client && npm run lint` -- expected: clean
- `cd client && npm run build` -- expected: clean (real `tsc -b && vite build`)
- `cd server && npm run build` -- expected: clean

## Suggested Review Order

**The new control (design intent)**

- Entry point — CTA-vs-summary logic and the single `onOpen` action that makes the vehicle entry discoverable.
  [`VehicleBar.tsx:19`](../../client/src/components/VehicleBar.tsx#L19)

- The action button: prominent "Set" (secondary) when none, quiet "Change" (ghost) when set.
  [`VehicleBar.tsx:28`](../../client/src/components/VehicleBar.tsx#L28)

**Wiring + the removal it replaces**

- Bar mounted directly below LocationBar; `onOpen` reuses the existing `settingsOpen` state.
  [`App.tsx:51`](../../client/src/App.tsx#L51)

- Header is now prop-less — the unlabeled gear (the old, only entry) is gone.
  [`Header.tsx:6`](../../client/src/components/Header.tsx#L6)

- Bar styling mirrors `.gma-location-bar` so the two read as a pair.
  [`components.css:574`](../../client/src/styles/components.css#L574)

**Tests (supporting)**

- CTA / summary / corrupt-pair / opens-on-activate.
  [`VehicleBar.test.tsx:6`](../../client/src/components/VehicleBar.test.tsx#L6)

- Header carries no button anymore; wordmark intact.
  [`Header.test.tsx:13`](../../client/src/components/Header.test.tsx#L13)

- Sheet now opens via the VehicleBar control; focus returns to it on close.
  [`App.test.tsx:107`](../../client/src/App.test.tsx#L107)
