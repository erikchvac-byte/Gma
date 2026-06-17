# Review Role 2 — Edge Case Hunter (diff + project read access)

> **Status: REVIEWED — 2026-06-16 (Erik).** Completed; no findings submitted for loopback processing.

Run this in a **fresh session**, ideally a **different LLM**. Invoke the `bmad-review-edge-case-hunter` skill.

## What you get
- The diff at `_bmad-output/implementation-artifacts/review-6-3/diff.patch`.
- **Read access to the whole project** at `C:\Users\erikc\Dev\Happy` — open any file you need (the 6-2 primitives in `client/src/components/ui/`, hooks in `client/src/hooks/`, utils in `client/src/utils/`, the token/components CSS, etc.).

## Context (one paragraph)
Story 6-3 re-skins six existing surfaces (AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector) onto the design-system primitives, adds a sticky `Header`, lifts vehicle state + the settings-sheet toggle up to `App`, and reworks `VehicleSelector` from an inline panel into a focus-trapped bottom-sheet dialog. Behavior is meant to be unchanged — only presentation and the dialog/a11y contract are new.

## Your job — hunt the edges
- **Focus management:** the sheet captures `document.activeElement` on open and restores it on close, moves focus inside on open, traps Tab, closes on Esc/scrim/close-button, and locks body scroll. What breaks it? (rapid open/close, focus already inside, no focusable elements, the trigger unmounting, multiple opens, the cleanup running on unmount vs close.)
- **The cascade under the new lifecycle:** the open-effect runs `clearError`/`loadYears` keyed only on `open` (exhaustive-deps disabled). Stale closures? Double-loads? Does the abandoned-selection `selectionRef` guard still hold when the parent controls `open`?
- **State lifting:** `useVehicleMpg` moved from DealFeed to App; DealFeed now takes an optional `mpg` prop (default null). Any path where the resolved MPG, the national-average fallback, or persistence now behaves differently than before?
- **Re-skin fidelity vs behavior:** DealCard now splits figures/discount into styled `<span>`s; verify the null-handling (discount/gas/window/countdown each may be null) is byte-for-byte equivalent in outcome. Distance slider's accessible name changed from "Within 25 miles" to "Within" + `aria-valuetext`.
- **Edge inputs:** empty/loading/error feed states, malformed times, stale sources, garbage localStorage, single-item fueleconomy menus, scrim vs dialog click bubbling.

## Output
Deduplicated findings: **severity**, **file:line**, **the concrete trigger/input**, **observed vs expected**, **why it matters**. Prioritize real, reachable edge cases over theoretical ones.
