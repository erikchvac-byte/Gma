---
title: 'Story 6.3: Surface Re-skin + VehicleSelector Bottom Sheet'
type: 'feature'
created: '2026-06-16'
status: 'done'
baseline_commit: bbbc529
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/ui_kits/app/feed.jsx'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/ui_kits/app/settings.jsx'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 6's final story. The six live surfaces (AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector) still wear ad-hoc Tailwind utilities and a ⚙️ emoji; the design system (6-1 tokens + 6-2 primitives) is built but unconsumed. The vehicle UI is a shipped implementation delta: an inline panel, not the ruled bottom sheet.

**Approach:** Re-skin all six surfaces to consume the 6-2 primitives (Card, Badge, RangeSlider, Select, Notice, SkeletonFeed, Button, IconButton, Icon) with zero data/logic changes, add the design-system Header (banner + Lucide gear), and rework VehicleSelector from an inline panel into a bottom sheet (dialog semantics, focus trap, Esc/scrim/close, focus-return to the gear) per the `.decision-log.md` ruling. Behavior is preserved exactly; only presentation and a11y structure change. The faithful target is `ui_kits/app/feed.jsx` + `settings.jsx` — except where the finalized spines override the mock (stacked Selects one-per-row, no Save button).

## Boundaries & Constraints

**Always:**
- Behavior is frozen: every filter/sort/gas/expiry rule, the vehicle auto-resolve-on-model-select cascade (no Save button — `.decision-log.md:43,65`), the strict age-gate `=== true` check, and all null-handling in DealCard stay byte-for-byte equivalent in outcome.
- Surface styling is class-based via the 6-2 `gma-*` primitives; no hardcoded hex, no new Tailwind utility soup. Match component class names exactly.
- A11y floor (EXPERIENCE.md): `banner` + `main` landmarks; single `h1` "Gma's Helper"; dispensary names stay `h2`; sheet = `role="dialog"` aria-modal, focus enters on open, Esc closes, focus returns to the gear; age gate keeps `role="alertdialog"`; icon-only controls carry `aria-label`; every focusable keeps the visible focus ring.
- The Header is persistent/sticky and MUST render outside DealFeed (DealFeed has early returns for loading/error that would unmount an in-feed header). Vehicle state (`useVehicleMpg`) and sheet-open state therefore lift to `App`; DealFeed and the sheet receive them as props.
- Build gate `cd client && npm run build` clean; `vitest run` fully green after test updates.
- No new npm runtime dependency.

**Ask First:** None outstanding. Two items ruled at the planning checkpoint (2026-06-16): (1) `--border-field` token IS included in 6-3 — add `--border-field: #6b7280` to `tokens.css` and repoint `.gma-select`/`.gma-input` in `components.css` (Reviewer-Gate a11y fix, `.decision-log.md:56`; the sheet's Selects render it). (2) Header is **gear only** per the reference — drop the persistent "{label} · {MPG}"; the saved vehicle is reflected by the sheet's pre-filled Selects.

**Never:**
- Do NOT change the data flow endpoints: `useDeals`, `useFuelEconomy`, `useVehicleMpg`, gas/sort/time utils stay untouched (presentation only).
- Do NOT add a Save button, a filter-aware empty state, a manual refresh, or a vehicle-cascade loading spinner/timeout (all ruled out / deferred — `.decision-log.md:49,50`; deferred-work.md).
- Do NOT modify server code, hooks, or `utils/`.
- Do NOT regress the 6-2 primitive tests or any hook/util/server test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sheet open | Gear activated (click/Enter/Space) | Scrim + bottom-anchored `role="dialog"` aria-modal "Vehicle settings" rises; focus moves to first control (close button or Year Select); body scroll locked | N/A |
| Sheet close — 3 paths | Close IconButton, scrim tap, or Esc | Sheet unmounts, scroll unlocks, focus returns to the gear | N/A |
| Focus trap | Tab / Shift+Tab at sheet edge | Focus wraps within the sheet; never reaches the feed behind | N/A |
| Vehicle resolved | Year→Make→Model selected, MPG resolves | `onMpgChange(mpg, label)` fires, sheet closes, every card's gas figure recalculates (existing behavior) | Stale/abandoned lookups dropped via existing `selectionRef` guard |
| fueleconomy.gov unreachable | Cascade fetch fails | `role="alert"` Notice **inside the sheet only**; sheet stays open; feed keeps national average | Error scoped to panel (ADR-028) |
| Distance slider | Drag/arrow/tap | RangeSlider accessible name "Within", `aria-valuetext` "25 miles"; `onChange(number)` unchanged | N/A |
| Happy-hour card | `deal.type === 'happy_hour'` | Card `urgent`; urgent Badge "Happy hour" w/ clock; countdown line when timed window valid | Unparseable times → window/countdown omitted (existing null props) |
| Discount null | `deal.discountPct === null` | Gas-cost line renders alone (existing conditional preserved) | N/A |
| Loading / empty / error feed | per `useDeals` state | `SkeletonFeed` / muted Notice "No active deals right now" / error Notice (role=alert) same copy | N/A |

</frozen-after-approval>

## Code Map

- `client/index.html` -- page `<title>` → "Gma's Helper — cannabis deals worth the drive" (lang already `en`)
- `client/src/App.tsx` -- restructure: AgeGate wraps Header + `<main>`/DealFeed + VehicleSelector sheet; lift `useVehicleMpg` + `sheetOpen` + `gearRef` here
- `client/src/components/Header.tsx` -- NEW banner: sticky wordmark (`h1` + nav-icon green square) + gear IconButton (settings icon, `aria-label="Vehicle & settings"`)
- `client/src/components/AgeGate.tsx` -- re-skin: inverse bg, shield-check Icon, Button primitive; keep alertdialog + strict check + focus
- `client/src/components/DealCard.tsx` -- re-skin to Card (urgent) + Badge + mono figures; PRESERVE discount/gas/window/countdown null logic + props
- `client/src/components/DealFeed.tsx` -- re-skin states (SkeletonFeed/Notice); receive `mpg`/`label`/`onOpenSettings` props; drop in-feed VehicleSelector; keep all filter/sort/gas logic; wrap region unchanged
- `client/src/components/DistanceFilter.tsx` -- re-skin to RangeSlider (`label="Within"`, valueText, ticks); keep exported constants
- `client/src/components/StaleIndicator.tsx` -- re-skin to muted Notice (role=status); keep integer guard + text
- `client/src/components/VehicleSelector.tsx` -- rework to bottom sheet: add `open`/`onClose` props, remove own gear trigger, scrim + dialog, focus trap/Esc/scroll-lock, stacked Selects, Notice error, IconButton close; KEEP useFuelEconomy cascade + auto-resolve
- `client/src/styles/{tokens.css,components.css}` -- (Ask First) add `--border-field` + repoint `.gma-select`/`.gma-input`
- `client/src/components/ui/feed.jsx`, `settings.jsx` (reference, read-only) -- faithful target markup
- Test files: `App.test.tsx`, `Header.test.tsx` (NEW), `AgeGate/DealCard/DealFeed/DistanceFilter/StaleIndicator/VehicleSelector.test.tsx` -- update structure-coupled assertions; preserve behavioral coverage

## Tasks & Acceptance

**Execution:**
- [x] **Pre-flight** -- `cd client && npm run build` + `npx vitest run` green before touching anything; record baseline test count.
- [x] `client/index.html` -- set the page title.
- [x] `client/src/components/Header.tsx` (+ `Header.test.tsx`) -- build the banner; gear forwards a ref + `onOpenSettings`; nav Icon `aria-hidden`; wordmark text is the single `h1`.
- [x] `client/src/App.tsx` (+ `App.test.tsx`) -- lift `useVehicleMpg`/`sheetOpen`/`gearRef`; render `<header>`+`<main>`; wire gear→open, sheet→`onClose` (focus-returns to gear). Relocate the vehicle-cascade integration coverage that currently lives in DealFeed.test here (or into VehicleSelector.test).
- [x] `client/src/components/AgeGate.tsx` (+ test) -- re-skin with Button + shield-check Icon; keep alertdialog/aria-modal/labelled h1/focus/strict check.
- [x] `client/src/components/DealCard.tsx` (+ test) -- Card(urgent) + type Badge + mono figures; add badge assertions; keep null-path tests.
- [x] `client/src/components/DealFeed.tsx` (+ test) -- SkeletonFeed/Notice states; consume vehicle props; drop VehicleSelector; update slider accessible-name assertions to "Within" + `aria-valuetext`; remove relocated gear tests.
- [x] `client/src/components/DistanceFilter.tsx` (+ test) -- RangeSlider; keep constants; update label/role assertions.
- [x] `client/src/components/StaleIndicator.tsx` (+ test) -- muted Notice; keep guard.
- [x] `client/src/components/VehicleSelector.tsx` (+ test) -- bottom-sheet rework; cover open/close(×3)/focus-trap/Esc/focus-return/cascade/error-in-panel.
- [x] `client/src/styles/tokens.css` + `components.css` -- add `--border-field: #6b7280` (+ `@theme` map if needed) and repoint `.gma-select`/`.gma-input` borders to it; confirm zero hex regressions elsewhere.
- [x] **Final** -- `npm run build` clean; `vitest run` fully green; grep surfaces for any remaining raw `bg-gray`/`rounded-lg`/emoji; confirm zero hardcoded hex introduced.

**Acceptance Criteria:**
- Given the app renders post-gate, when inspected, then a `banner` header with a Lucide gear and a `main` deal-feed region exist, exactly one `h1` reads "Gma's Helper", and dispensary names are `h2`.
- Given the gear is activated, when the sheet opens, then it is `role="dialog"` aria-modal, focus enters it, the feed behind is inert; and closing via close button, scrim, or Esc returns focus to the gear.
- Given a Year→Make→Model selection completes, when MPG resolves, then `onMpgChange` fires, the sheet closes, and every card's gas figure recalculates — identical to pre-6-3 behavior; a failed lookup shows a panel-scoped `role="alert"` and the feed silently keeps the average.
- Given each surface, when re-skinned, then it uses only `gma-*` primitives (no leftover ad-hoc Tailwind utilities, no ⚙️ emoji) and introduces zero hardcoded hex.
- Given the full suite, when `vitest run` executes, then it is green: 6-2 primitive tests, hook/util/server tests pass unchanged; surface tests are updated for new structure while preserving behavioral coverage; new Header tests pass.
- Given `npm run build`, then `tsc -b && vite build` completes clean.

## Design Notes

**Header / App wiring.** `App` owns `const gearRef = useRef<HTMLButtonElement>(null)`, `useVehicleMpg()`, and `sheetOpen`. Header receives `gearRef` + `onOpenSettings`; VehicleSelector receives `open`, `onClose={() => { setSheetOpen(false); gearRef.current?.focus() }}`, plus `mpg`/`label`/`onMpgChange`. DealFeed receives `mpg`/`label` (no longer calls `useVehicleMpg`). Landmarks: `<header>` (banner) + `<main>` siblings; the wordmark is the visible `h1` (avoids a duplicate "Gma's Helper" a11y node that would break `getByText`).

**Sheet anatomy** mirrors `settings.jsx` (scrim `rgba(17,24,39,0.45)`, bottom-anchored card, top-rounded, `shadow-lg`) BUT: Selects stacked one-per-row (not the 3-col grid), no Save/Use-national buttons — selection auto-applies on Model per the existing cascade. Title "Your vehicle" + car Icon; close IconButton with x Icon; explainer copy "Set it once for exact gas math. Skip it and we use the national average ({nationalMpg} MPG)."

**Focus trap (highest-risk).** On open: store nothing (App holds the trigger ref), move focus to the first focusable in the sheet, lock body scroll. Keydown handler: Esc → `onClose`; Tab → wrap within the sheet's focusable set. On close: restore scroll; App restores focus. No library — small inline effect.

**DealCard fidelity:** badge from `deal.type` (`urgent` "Happy hour" + clock / `neutral` "Daily deal"); mono (`var(--font-mono)`) for distance, gas figure, window, countdown; green discount. The existing prop contract (`windowText`/`countdown`/`gasCostText` may be null) is unchanged — only wrap the existing conditionals in the new markup.

## Verification

**Commands:**
- `cd client && npm run build` -- expected: `tsc -b && vite build` exit 0, no TS errors.
- `cd client && npx vitest run` -- expected: all green; 6-2/hook/util/server counts unchanged, surface tests updated, Header tests added.
- `rg -n "bg-gray-|rounded-lg|⚙|text-gray-[0-9]" client/src/components/*.tsx` -- expected: no leftover ad-hoc utilities in re-skinned surfaces (matches only inside the re-skin should be intentional/none).

**Manual checks:**
- Keyboard-only: gear opens sheet, Tab cycles inside it, Esc closes, focus lands back on gear.
- Screen-reader smoke (optional): slider announces "Within, 25 miles"; sheet announced as dialog; cascade error read as alert.

## Suggested Review Order

**Architecture — state lifting & shell**

- Entry point: vehicle state + sheet toggle lifted here so the persistent Header gear and the sheet share them.
  [`App.tsx:12`](../../client/src/App.tsx#L12)
- Focus-return wiring: closing the sheet refocuses the gear (via the sheet's `activeElement` capture).
  [`App.tsx:25`](../../client/src/App.tsx#L25)
- New banner: wordmark is the page's only `h1`; Lucide gear is the sole sheet trigger.
  [`Header.tsx:44`](../../client/src/components/Header.tsx#L44)

**VehicleSelector bottom sheet (highest-risk)**

- Open lifecycle: capture focus, clear error, lazy-load years, lock scroll; cleanup restores focus + scroll.
  [`VehicleSelector.tsx:36`](../../client/src/components/VehicleSelector.tsx#L36)
- Focus trap + Esc: Tab wraps within the dialog; Escape closes.
  [`VehicleSelector.tsx:55`](../../client/src/components/VehicleSelector.tsx#L55)
- Cascade preserved: auto-resolve on Model with the `selectionRef` abandon guard; `onClose` replaces the old inline collapse.
  [`VehicleSelector.tsx:91`](../../client/src/components/VehicleSelector.tsx#L91)

**Re-skin fidelity vs frozen behavior**

- DealCard: discount/figures split into styled spans; null-handling for discount/gas/window/countdown unchanged.
  [`DealCard.tsx:42`](../../client/src/components/DealCard.tsx#L42)
- DealFeed: `mpg` now an optional prop (default null → national average); states use SkeletonFeed/Notice.
  [`DealFeed.tsx:104`](../../client/src/components/DealFeed.tsx#L104)
- DistanceFilter → RangeSlider: accessible name is "Within", value via `aria-valuetext`.
  [`DistanceFilter.tsx:16`](../../client/src/components/DistanceFilter.tsx#L16)
- AgeGate re-skin: keeps alertdialog + strict `!== true` check + focus-on-mount.
  [`AgeGate.tsx:24`](../../client/src/components/AgeGate.tsx#L24)

**Token a11y fix**

- New `--border-field` (#6b7280) and its consumption on form-field borders.
  [`tokens.css:146`](../../client/src/styles/tokens.css#L146)
  [`components.css:151`](../../client/src/styles/components.css#L151)

**Tests (supporting)**

- Sheet semantics, Esc/scrim/close, focus trap, cascade preserved.
  [`VehicleSelector.test.tsx:1`](../../client/src/components/VehicleSelector.test.tsx#L1)
- App integration: gear→sheet, focus-return, feed-wide gas recalculation.
  [`App.test.tsx:1`](../../client/src/App.test.tsx#L1)
- Full-`textContent` matcher pattern for span-split figure lines.
  [`DealFeed.test.tsx:11`](../../client/src/components/DealFeed.test.tsx#L11)
