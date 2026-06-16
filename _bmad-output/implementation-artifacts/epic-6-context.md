# Epic 6 Context: Apply Gma's Helper Design System to the Client

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Apply the Gma's Helper Design System — a complete, token-based visual language with Public Sans + IBM Plex Mono fonts, a `gma-*` BEM component CSS layer, and a Lucide icon set — to the React client in three disciplined layers. Story 6-1 (done) landed the token foundation. Story 6-2 builds the primitive component library. Story 6-3 re-skins the six live surfaces and reworks VehicleSelector into a bottom sheet. The client was functionally complete before epic 6 began; every story in this epic is a pure visual/accessibility addition — no data or logic changes.

## Stories

- Story 6.1: Design System Foundation — token CSS, self-hosted fonts, base.css resets (status: review)
- Story 6.2: Primitive Component Library — 10 TSX primitives + Icon component + components.css port + tests
- Story 6.3: Surface Re-skin + VehicleSelector Bottom Sheet — re-skin 6 surfaces, VehicleSelector inline→bottom sheet

## Requirements & Constraints

- Source of truth for visual decisions: `DESIGN.md` and `EXPERIENCE.md` in `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/`. When prose and CSS differ, the CSS wins (6-1 lesson).
- Design system import lives at: `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/`
- **No hardcoded hex values.** Every color in component CSS must reference a `var(--token-name)`. The token layer defines all hexes.
- **No new npm runtime dependencies.** Lucide icons are vendored as compile-time SVG path constants — no `lucide-react` package.
- **Build gate:** `cd client && npm run build` (`tsc -b && vite build`) must be clean after every story.
- **Test gate:** `vitest run` — the 198 pre-existing tests must pass unchanged. New tests are additive.
- **Scope boundary:** each story has a hard boundary. Stories must not bleed into each other's scope.

## Technical Decisions

**6-1 output (live — do not modify in 6-2):**
- `client/src/styles/tokens.css` — all `gma-*` CSS custom properties + Tailwind v4 `@theme` wiring + `@font-face` rules + base.css resets
- `client/src/assets/fonts/` — 7 vendored woff2 files (Public Sans 400/500/600/700, IBM Plex Mono 400/500/600)
- `client/src/index.css` — `@import "tailwindcss"` then `@import "./styles/tokens.css"`
- `client/src/App.css` removed (Vite demo cruft)

**CSS class system for 6-2/6-3:** `gma-*` BEM. Component styling is class-based, not Tailwind utilities. Classes are defined in `components/components.css` (the import's source) and consumed in JSX via string composition. Class names must match the CSS exactly (no type safety — typos at runtime only).

**Component architecture:** Flat primitive layer in `client/src/components/ui/`. Each component is a typed TSX file implementing the `.d.ts` contract from the design system import. Extra `className` props are appended after component-owned classes (filter-Boolean + join pattern).

**Testing stack:** Vitest + React Testing Library + `@testing-library/jest-dom`. Tests assert DOM structure and attribute output — no snapshot tests, no CSS rendering tests.

## UX & Interaction Patterns

Visual contracts are in `DESIGN.md` (component specs, spacing, color roles) and `EXPERIENCE.md` (behavioral specs, accessibility floor). Key accessibility rules:
- Every interactive element must have a visible focus ring (`:focus-visible` — from base.css token layer, already wired in 6-1)
- Icons are always `aria-hidden="true"` — callers provide accessible labels on the control
- Form controls use `useId()` for label/error/hint association
- RangeSlider: `aria-valuetext` only when `valueText` is a string type (not ReactNode)
- VehicleSelector (6-3): dialog semantics, focus trap, Esc closes, focus returns to trigger

## Cross-Story Dependencies

- **6-2 depends on 6-1:** The token layer and font vendoring from 6-1 must be in place before 6-2 components can resolve their `var()` references. 6-1 is status: review (complete). Do not modify `tokens.css` or `index.css` in 6-2 except to add the `components.css` import.
- **6-3 depends on 6-2:** Surface re-skin consumes the primitives from 6-2. 6-3 must not start until 6-2 is done.
- Existing surface components (AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector) are untouched until 6-3.
