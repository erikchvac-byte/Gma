# Investigation: Story 6-1 Design System Foundation — Pre-implementation Codebase Survey

## Hand-off Brief

1. **What happened.** Story 6-1 is `ready-for-dev`; this is an exploration investigation to verify all pre-conditions and map the current client state before implementation begins.
2. **Where the case stands.** Every critical pre-condition is Confirmed — sprint-status keys are correct, all 7 woff2 font files are present at the source path, App.css is confirmed orphaned, no italic font usage exists, and Tailwind v4 is wired. The two directories that Tasks 1 and 2 will create (`client/src/assets/fonts/` and `client/src/styles/`) do not yet exist (expected pre-state).
3. **What's needed next.** The codebase is ready for `bmad-dev-story` to implement 6-1 directly; no blockers found.

## Case Info

| Field            | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Ticket           | Story 6-1 — Design System Foundation                                                      |
| Date opened      | 2026-06-16                                                                                |
| Status           | Concluded                                                                                 |
| System           | Windows 11 / React 19 / Tailwind v4.3.0 / Vite / Vitest / TypeScript                    |
| Evidence sources | Story spec `6-1-design-system-foundation.md`, `client/src/` source tree, `sprint-status.yaml`, font asset directory, `client/package.json` |

## Problem Statement

Exploration: verify Story 6-1's pre-conditions against the actual codebase and produce a clean map of the current client CSS/font/test state so the dev agent can start with Confirmed ground truth rather than story assertions.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------- | ----- |
| `_bmad-output/implementation-artifacts/6-1-design-system-foundation.md` | Available | Full story spec with verbatim token CSS embedded |
| `client/src/index.css` | Available | 1 line only: `@import "tailwindcss";` |
| `client/src/main.tsx` | Available | Imports `./index.css` only (line 3); no other CSS imports |
| `client/src/App.tsx` | Available | Matches spec exactly: `AgeGate > div.min-h-screen.bg-gray-50 > h1 + DealFeed` |
| `client/src/App.css` | Available | Vite scaffold present (`.hero`, `.vite`, `#next-steps`, `.counter`) — confirmed orphaned |
| `client/src/styles/` | Missing | Dir does not yet exist — Tasks 1/2 create it (expected) |
| `client/src/assets/fonts/` | Missing | Dir does not yet exist — Task 1 creates it (expected) |
| `client/src/assets/` | Available | Contains only `hero.png`, `react.svg`, `vite.svg` |
| `client/package.json` | Available | `@tailwindcss/vite: ^4.3.0`, `tailwindcss: ^4.3.0` |
| Font source path | Available | All 7 woff2 files confirmed present (see Finding 2) |
| `sprint-status.yaml` | Available | Epic 6 keys present and correct (see Finding 3) |
| Test suite | Available | 7 test files covering all components + App root |
| `font-style: italic` usage | Missing | Zero occurrences in `client/src` — italic decision safe |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Verify token source files match verbatim values in story spec | Low | Done | Story spec embeds the token CSS verbatim from the import files; trust the spec |
| 2 | Confirm `client/public/` vs `client/src/assets/fonts/` path choice | Low | Done | Story permits either; `client/src/assets/fonts/` is recommended (Vite fingerprinting) — dev agent decides |
| 3 | Verify no snapshot tests in suite that would break on App.tsx render change | Low | Done | App.tsx is DO NOT MODIFY in this story; moot |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-06-12 | UX spines finalized (DESIGN.md + EXPERIENCE.md marked final) | memory + story spec | Confirmed |
| 2026-06-16 | Epic 6 split ruled with Erik; story 6-1 drafted + hardened (3 passes) | `sprint-status.yaml:38`, story Change Log | Confirmed |
| 2026-06-16 | `sprint-status.yaml` updated with all Epic 6 keys | `sprint-status.yaml:84–87` | Confirmed |
| 2026-06-16 | Investigation opened (exploration, pre-implementation) | this file | Confirmed |

## Confirmed Findings

### Finding 1: `client/src/index.css` is a clean single-import entry point

**Evidence:** `client/src/index.css:1` — exactly `@import "tailwindcss";` (1 line, nothing else)

**Detail:** The token layer can be appended immediately after this import with no conflicts. `main.tsx:3` imports only `./index.css`, so any CSS file reachable from `index.css` is globally loaded.

---

### Finding 2: All 7 woff2 source files are present at the story-specified path

**Evidence:** Glob of `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/assets/fonts/*.woff2` returns exactly:
- `public-sans-400.woff2`, `public-sans-500.woff2`, `public-sans-600.woff2`, `public-sans-700.woff2`
- `ibm-plex-mono-400.woff2`, `ibm-plex-mono-500.woff2`, `ibm-plex-mono-600.woff2`

**Detail:** Task 1 HALT condition is not triggered — all 7 files exist. No action needed before copying.

---

### Finding 3: Task 0 sprint-status pre-flight passes

**Evidence:** `_bmad-output/implementation-artifacts/sprint-status.yaml:84–87`
```
epic-6: in-progress
6-1-design-system-foundation: ready-for-dev
6-2-primitive-component-library: backlog
6-3-surface-reskin-and-vehicle-sheet: backlog
```

**Detail:** All four Epic 6 keys are present with exactly the required statuses. Task 0 pre-condition is satisfied — no manual key addition needed.

---

### Finding 4: `App.css` is confirmed orphaned — safe to delete in Task 4

**Evidence:** Grep for `App\.css` across `client/src` returns zero matches. `client/src/main.tsx:3` imports only `./index.css`.

**Detail:** `client/src/App.css` contains Vite scaffold classes (`.counter`, `.hero`, `.vite`, `#next-steps`, `#center`, `#docs`, `.ticks`). None of these classes appear in any component. Task 4 deletion is safe without risk of removing used styles.

---

### Finding 5: `App.tsx` matches story spec exactly

**Evidence:** `client/src/App.tsx:1–15` — imports `AgeGate`, `DealFeed`; renders `<AgeGate><div className="min-h-screen bg-gray-50"><h1 …>Gma&apos;s Helper</h1><DealFeed /></div></AgeGate>`

**Detail:** The DO NOT MODIFY constraint is easy to honor — no aspect of this story requires touching App.tsx. The `min-h-screen` and `bg-gray-50` utilities are undisturbed by the token layer (neither is overridden in `@theme`; `bg-gray-50` will map to our `--color-gray-50: #f9fafb` token if we expose it in `@theme`, which is the intended behavior per story spec finding 11).

---

### Finding 6: Tailwind v4 is confirmed — no config migration needed

**Evidence:** `client/package.json:19` — `"@tailwindcss/vite": "^4.3.0"`; `package.json:32` — `"tailwindcss": "^4.3.0"`

**Detail:** CSS-first config (no `tailwind.config.js`). The `@theme { }` block approach specified in the story is the correct v4 pattern.

---

### Finding 7: Zero italic font declarations — faux-italic risk is absent

**Evidence:** Grep for `font-style.*italic` across `client/src` returns zero matches.

**Detail:** The italic-variants-not-vendored decision (story Dev Notes) is confirmed data-grounded. No component will attempt to load a missing italic woff2 file.

---

### Finding 8: Test suite has 7 files covering all components

**Evidence:** `client/src/App.test.tsx`, `client/src/components/AgeGate.test.tsx`, `DealFeed.test.tsx`, `DealCard.test.tsx`, `DistanceFilter.test.tsx`, `StaleIndicator.test.tsx`, `VehicleSelector.test.tsx`

**Detail:** All are RTL-based. This is a CSS/asset-only story — no component logic changes — so the suite should pass unchanged after implementation. The Task 4 regression gate (`vitest run` all green) is the correct verification method.

---

### Finding 9: Target directories for Task 1 and Task 2 do not yet exist (expected)

**Evidence:** 
- Glob of `client/src/styles/**` → no files found
- Glob of `client/src/assets/fonts/**` (only `hero.png`, `react.svg`, `vite.svg` exist in `assets/`)

**Detail:** `client/src/styles/` and `client/src/assets/fonts/` must be created. This is the expected pre-state for a story that says "NEW" for these targets. The dev agent must `mkdir` both before writing files.

## Deduced Conclusions

### Deduction 1: No blockers exist; story is implementation-ready

**Based on:** Findings 1–9

**Reasoning:** Every pre-condition the story asserts (Task 0 sprint-status check, 7 fonts present, App.css orphaned, no italic usage, Tailwind v4 active, entry point clean) has been independently verified as Confirmed. The only "gaps" (target dirs missing) are the expected pre-implementation state.

**Conclusion:** The dev agent can begin Task 0 → Task 1 in order without any preliminary remediation.

## Hypothesized Paths

### Hypothesis 1: Tailwind v4 `@theme` namespace semantics may require doc verification

**Status:** Open

**Theory:** The story's Dev Notes explicitly warn: "Verify the current v4 namespace + `@theme inline` semantics against the official Tailwind v4 docs before finalizing." The exact behavior of `@theme inline` (emitting both a CSS custom property and driving utilities) may have nuances not captured in the story spec.

**Supporting indicators:** Tailwind v4 is a relatively new major version with documented breaking changes from v3; `@theme inline` is a non-obvious feature.

**Would confirm:** Dev agent reads the current Tailwind v4 `@theme` docs and finds the story's proposed `@theme` / `:root` split strategy needs adjustment.

**Would refute:** The story's strategy (utility-backing tokens in `@theme`, semantic aliases in `:root`) works exactly as described with no doc-discovered edge cases.

**Resolution:** The story's instruction to verify against docs before finalizing is the correct mitigating action; this hypothesis resolves during Task 2 execution.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Current Tailwind v4 `@theme inline` behavior (live docs) | Affects whether semantic aliases need `@theme inline` vs `:root` | Dev agent checks official Tailwind v4 docs during Task 2 |
| Actual pixel rendering of existing components after token layer added | Confirms no layout regressions | Task 5 visual smoke (dev agent, manual, not automated) |

## Source Code Trace

| Element | Detail |
| ------- | ------- |
| CSS entry point | `client/src/index.css:1` — `@import "tailwindcss";` |
| CSS consumer | `client/src/main.tsx:3` — `import './index.css'` |
| Target: token layer | `client/src/styles/tokens.css` (to be created in Task 2) |
| Target: font assets | `client/src/assets/fonts/*.woff2` (to be created in Task 1) |
| Font source | `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/assets/fonts/` |
| Token source | `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/tokens/{colors,typography,spacing,elevation,fonts,base}.css` |
| Dead file for deletion | `client/src/App.css` — Vite scaffold, zero imports |
| Test files | `client/src/` — 7 `*.test.tsx` files (all components + App) |

## Conclusion

**Confidence:** High

All 9 Confirmed Findings establish a clean, implementation-ready baseline. The story's pre-condition assertions are independently verified against disk. The only open hypothesis (Tailwind v4 `@theme inline` nuances) is already mitigated by the story's own instruction to verify docs during Task 2 — it is not a blocker.

## Recommended Next Steps

### Fix direction

No fixes required. This is an exploration investigation confirming implementation readiness.

### Diagnostic

None needed — all pre-conditions pass.

## Reproduction Plan

N/A — exploration case. Verification plan for implementation:

1. Task 0: Sprint-status check — **already Confirmed** (Finding 3)
2. Task 1: Copy 7 woff2 from source path to `client/src/assets/fonts/` — **source confirmed present** (Finding 2)
3. Task 2: Create `client/src/styles/tokens.css`, import into `index.css` after Tailwind import, wire `@theme` — **entry point is clean** (Finding 1)
4. Task 3: Port `base.css` into token layer — no obstacles identified
5. Task 4: `grep App.css client/src` → 0 matches (pre-confirmed Finding 4), then delete; `vitest run` all green
6. Task 5: Visual smoke — `npm run dev`, verify Public Sans + focus ring + tabular figures

## Side Findings

- `client/src/assets/` contains `hero.png`, `react.svg`, `vite.svg` — these are also Vite scaffold files unreferenced by the current app. They are out of scope for 6-1 (only `App.css` is called out), but are candidates for a future cleanup commit.
- The `App.css` scaffold includes a reference to `var(--accent)`, `var(--accent-bg)`, `var(--accent-border)`, `var(--shadow)` — CSS custom properties that are NOT in our design system. This confirms the file is stale Vite defaults-era CSS, not design system CSS. Reinforces safe deletion.
