---
baseline_commit: 229dc586f4328f85a9bf6486118d727cba8cb6c8
---

# Story 6.1: Design System Foundation — Tokens, Self-Hosted Fonts, Base Styles

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator of Gma's Helper,
I want the Gma's Helper Design System's **token layer** (colors, typography, spacing, elevation, motion), its **self-hosted fonts**, and its **base element styles** ported into the React client and wired through Tailwind v4,
so that every component built in 6-2 and every surface re-skinned in 6-3 resolves to the one authoritative design language — without inventing hexes, sizes, or radii.

## Context & Scope Decision

This is **Story 1 of Epic 6 — Apply Gma's Helper Design System to the client**. The design is final and binding (`DESIGN.md` + `EXPERIENCE.md`, status: final 2026-06-12, "spines win on conflict"). The client is functionally complete (all 4 epics done, app live) but **visually unstyled**: `client/src/index.css` is just `@import "tailwindcss";`, `App.tsx` is a placeholder `<h1>`, components use ad-hoc default Tailwind utilities, there are **zero design tokens**, no self-hosted fonts, no mono figures, no base resets.

Epic 6 phasing (ruled with Erik 2026-06-16):
- **6-1 (this story): Foundation** — token CSS + `@theme` wiring + self-hosted fonts + base.css resets. No component or surface changes.
- **6-2 (backlog): Primitive library** — the ten primitives (Button, IconButton, Badge, Card, RangeSlider, TextField, Select, Skeleton/SkeletonFeed, Notice) built to their `.d.ts` contracts + Lucide icon vendoring/component + tests.
- **6-3 (backlog): Surface re-skin** — re-skin AgeGate, Header, DealFeed, DealCard, DistanceFilter, StaleIndicator using the primitives, and rework **VehicleSelector** from inline panel → ruled **bottom sheet with scrim** (dialog semantics, focus trap, Esc, focus-return, Lucide gear).

**Why foundation-first:** the tokens are the single source of truth every later story references (`DESIGN.md → Components` says "Build from tokens — reference semantic aliases; never hardcode a hex"). Landing them first means 6-2/6-3 are pure consumption with nothing to invent.

**Behavior-preservation guarantee:** this story adds a styling layer only. It must not change any component logic or break the existing client test suite. The `@theme` block makes our design tokens **authoritative** — it replaces Tailwind v4's built-in defaults for every namespace key we define. Utilities like `bg-green-700` will resolve to `--color-green-700: #15803d` (our token). If Tailwind v4's current built-in default for any defined color name differs from our token hex, there will be a minor visual delta — this is **expected and intentional** (the design tokens win over Tailwind defaults; see Dev Notes "finding 11"). The no-regression guarantee covers component logic and layout only: no test failures, no layout breaks, and utilities that reference names we leave undefined (e.g. `min-h-screen`) are undisturbed. The visible additive deltas are: brand fonts, always-visible focus rings, tabular figures.

## Acceptance Criteria

1. **Self-hosted fonts vendored + declared.** The seven woff2 files (Public Sans 400/500/600/700, IBM Plex Mono 400/500/600) are copied from the import into the client and served locally (no Google Fonts / CDN). `@font-face` rules match the import's `tokens/fonts.css` (`font-display: swap`, correct weights/families), with `src` paths corrected to the client's vendored location. After load, body text renders in **Public Sans** and `[data-figure]`/mono contexts in **IBM Plex Mono**. The seven `@font-face` rules cover non-italic weights only; italic variants are intentionally not vendored (see Dev Notes — Italic decision).

2. **Token layer ported as the single source of truth.** All design tokens from the import's six token files — `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `fonts.css`, `base.css` — are present in the client as authoritative CSS custom properties (`--green-700`, `--surface-page`, `--text-muted`, `--action-primary-bg`, `--space-3`, `--radius-lg`, `--shadow-lg`, `--ring`, `--font-figure`, `--duration-fast`, etc.), values **verbatim** from those files (the token files win over any prose — see Dev Notes). The composite/semantic aliases resolve (e.g. `var(--surface-page)` → `#f9fafb`).

3. **Tailwind v4 `@theme` wiring.** Tokens that back utility classes (palette, font families, spacing, radius) are exposed through Tailwind v4's `@theme` so brand utilities resolve to token values; tokens consumed only as `var()` in later component CSS (composite shorthands like `--font-body`, `--shadow-*`, `--ring`, motion tokens, semantic aliases) are available as `:root` custom properties. The house corner `rounded-lg` resolves to **8px** (Tailwind default already 8px — keep it; do not let any override drift it). `@import "tailwindcss";` is preserved.

4. **Base element styles applied.** The import's `base.css` resets are active app-wide: `box-sizing: border-box` universally; `body` uses `--font-body` on `--surface-page` with `--text-body` color; `h1`–`h4` map to the figure scale + weights; `:focus-visible` draws the 2px `--focus-ring` outline at `--ring-offset` on all interactive elements (never `outline: none` without replacement); `time, [data-figure]` get `font-variant-numeric: tabular-nums slashed-zero`. (Note: `[data-figure]`'s `font-family: var(--font-mono)` is set by `typography.css`'s `.gma-figure, [data-figure]` selector rule — covered by Task 2; `base.css`'s `:where(time, [data-figure])` block adds only `font-variant-numeric`. Both together satisfy AC 1's IBM Plex Mono guarantee.)

5. **Reduced-motion honored at the token level.** The `@media (prefers-reduced-motion: reduce)` block collapses `--duration-fast/normal/slow` to `0ms`, exactly as `elevation.css` specifies.

6. **Dead scaffold removed; no regressions.** The orphaned Vite-scaffold `client/src/App.css` (Vite demo cruft — `.hero`, `.vite`, `#next-steps`) is removed — **only after** Task 4's grep confirms no module imports it. The client builds (`tsc -b && vite build`) clean and the **full client test suite passes unchanged** — no component logic touched.

7. **Scope boundary holds.** No primitive components are built (6-2). No surface is re-skinned and VehicleSelector is **not** reworked (6-3). No new runtime dependencies are added beyond the vendored font/token assets. `App.tsx` is not modified in this story — the existing Tailwind utilities remain in place.

## Pre-conditions

- [ ] **Task 0 — Sprint-status pre-flight (finding 10):** Confirm `_bmad-output/implementation-artifacts/sprint-status.yaml` contains all four Epic 6 keys with the correct statuses: `epic-6: in-progress`, `6-1-design-system-foundation: ready-for-dev`, `6-2-primitive-component-library: backlog`, `6-3-surface-reskin-and-vehicle-sheet: backlog`. These keys were added 2026-06-16; if your workspace predates that commit, add them following the file's existing structure before proceeding.

## Tasks / Subtasks

- [ ] **Task 1 — Vendor self-hosted fonts** (AC: 1)
  - [ ] Copy the 7 woff2 files from `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/assets/fonts/` into the client (recommended: `client/src/assets/fonts/` so Vite fingerprints them, or `client/public/fonts/` for stable paths — pick one and be consistent in the `@font-face` `src`). Exact files: `public-sans-400.woff2`, `public-sans-500.woff2`, `public-sans-600.woff2`, `public-sans-700.woff2`, `ibm-plex-mono-400.woff2`, `ibm-plex-mono-500.woff2`, `ibm-plex-mono-600.woff2` — verify all 7 are present at that path before proceeding; if any are missing, HALT.
  - [ ] Port `tokens/fonts.css` `@font-face` rules into the client token layer, fixing each `src: url(...)` to the chosen vendored path. Keep `font-display: swap` and the exact family names `'Public Sans'` / `'IBM Plex Mono'` (the typography tokens reference these names).
  - [ ] Grep `client/src` for `font-style.*italic` — confirm zero occurrences before concluding faux-italic synthesis is safe to accept.
  - [ ] Verify in the browser network tab that woff2 files load locally and body text switches to Public Sans.

- [ ] **Task 2 — Port the token layer** (AC: 2, 3, 5)
  - [ ] Bring the contents of `colors.css`, `typography.css`, `spacing.css`, `elevation.css` (and the `fonts.css` `@font-face` from Task 1) into the client's CSS, values **verbatim**. Recommended layout: a `client/src/styles/tokens.css` (or split mirroring the import) imported from `index.css` after `@import "tailwindcss";`.
  - [ ] Wire Tailwind v4 `@theme`: expose the palette (`--color-green-700: #15803d` …), font families (`--font-sans`, `--font-mono`), spacing (4px grid), and radius so brand utilities generate. Keep semantic aliases (`--action-primary-bg`, `--surface-page`, `--text-muted`…), composite shorthands (`--font-body`/`--font-figure`/`--font-heading`/`--font-display`/`--font-label`/`--font-caption`), shadows (`--shadow-xs…lg`), the `--ring` composition, border widths, control heights, and motion tokens as `:root`/`@theme inline` custom properties for `var()` consumption. **Verify the exact `@theme` namespace rules against current Tailwind v4 docs** (see Latest Tech).
  - [ ] Include the `@media (prefers-reduced-motion: reduce)` override that zeroes the duration tokens.
  - [ ] Confirm `rounded-lg` still resolves to 8px and the default Tailwind palette still works (so existing components don't visually regress).

- [ ] **Task 3 — Apply base element styles** (AC: 4)
  - [ ] Port `base.css` verbatim into the token layer (after the `:root` token definitions so its `var()` refs resolve): box-sizing reset, `body` font/color/background, `h1`–`h4` scale, link styling, the `:where(...):focus-visible` ring, and the `:where(time, [data-figure])` tabular-figure rule. Note: `base.css`'s `[data-figure]` rule sets only `font-variant-numeric`; `font-family: var(--font-mono)` on `[data-figure]` is set by `typography.css`'s `.gma-figure, [data-figure]` block (already ported in Task 2).
  - [ ] Confirm the focus ring is visible on the existing age-gate button and slider (keyboard-tab), and that `body` background is `--surface-page`.

- [ ] **Task 4 — Remove dead scaffold + verify no regressions** (AC: 6, 7)
  - [ ] Confirm `client/src/App.css` is imported by **no** module (grep `App.css` across `client/src`), then remove it. (It is Vite demo cruft; `main.tsx` imports only `index.css`.)
  - [ ] Run `cd client && npm run build` (`tsc -b && vite build`) — clean.
  - [ ] Run the full client test suite (`npm test` / `vitest run`) — all green, unchanged.
  - [ ] **Token spot-check (finding 9 mitigation):** Grep the token CSS file for nine sentinel properties — `--green-700`, `--surface-page`, `--text-body`, `--font-sans`, `--font-mono`, `--space-4`, `--radius-lg`, `--shadow-sm`, `--duration-fast` — and confirm each appears at least once. This is a presence check only; token name typos on non-checked properties are not caught here and surface at Task 5 visual smoke or during 6-2/6-3 consumption.

- [ ] **Task 5 — Visual smoke verification** (AC: 1–5)
  - [ ] Run `npm run dev`, load the app: body is Public Sans on `#f9fafb`, the age-gate button shows the green-700 fill + a visible focus ring on tab, and a quick `<span data-figure>9.8</span>` test (or the existing distance text once 6-3 lands) renders tabular slashed-zero mono. Capture nothing permanent — this is a manual gate, not a committed test.
  - [ ] Confirm reduced-motion: with OS "reduce motion" on, the duration tokens read 0ms (DevTools computed styles on `:root`).

## Dev Notes

### What to touch (all in `client/`)
- `client/src/index.css` — **UPDATE** (keep `@import "tailwindcss";`, add token import + `@theme`)
- `client/src/styles/tokens.css` (or equivalent) — **NEW** (the ported token layer + `@font-face` + base.css)
- `client/src/assets/fonts/*.woff2` (or `client/public/fonts/`) — **NEW** (7 vendored woff2 files)
- `client/src/App.css` — **DELETE** (orphaned Vite scaffold; confirm unreferenced first)
- `client/src/App.tsx` — **DO NOT MODIFY** (existing utilities stay; no trim in this story)

### Source of truth — token files win, prose lies
**Authoritative:** the six `tokens/*.css` files (read into this story below). **Do NOT** quote `imports/.../_imported-CLAUDE.md.txt` for any value — its radius and shadow numbers are wrong, and its component prop tables are fictional (reconcile §4). Binding ruling (`DESIGN.md:288`, reconcile O1/O3): the house corner is **`--radius-lg: 8px`** (not the prose's "radius-md: 8px"); shadows are the **dual-layer gray-900-based** values in `elevation.css` (not the prose's single-layer black). The token files are internally consistent with `components.css` and the guideline cards.

### Exact token values (verbatim source CSS)

Copy these declarations directly — no reconstruction needed. The `src` paths in `fonts.css` use the import-relative path `../assets/fonts/`; Task 1 corrects them to the client's vendored location.

**colors.css**
```css
:root {
  /* ---- Brand green (primary action) ---- */
  --green-50:  #f0fdf4;
  --green-100: #dcfce7;
  --green-200: #bbf7d0;
  --green-300: #86efac;
  --green-500: #22c55e;
  --green-600: #16a34a;
  --green-700: #15803d; /* primary — the confirm/go color from the app */
  --green-800: #166534; /* primary hover */
  --green-900: #14532d;

  /* ---- Neutral gray ramp (the information grid) ---- */
  --gray-50:  #f9fafb; /* page background */
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb; /* default hairline border */
  --gray-300: #d1d5db; /* control track / strong border */
  --gray-400: #9ca3af; /* slider thumb / disabled fg */
  --gray-500: #6b7280; /* muted / secondary text */
  --gray-600: #4b5563;
  --gray-700: #374151; /* body text */
  --gray-800: #1f2937;
  --gray-900: #111827; /* headings, inverse surfaces (age gate) */
  --white:    #ffffff;

  /* ---- Amber (urgency only — time-limited deals, countdowns) ---- */
  --amber-50:  #fffbeb;
  --amber-100: #fef3c7;
  --amber-200: #fde68a;
  --amber-600: #d97706;
  --amber-700: #b45309;

  /* ---- Red (errors / destructive) ---- */
  --red-50:  #fef2f2;
  --red-200: #fecaca;
  --red-600: #dc2626;
  --red-700: #b91c1c;

  /* Surfaces */
  --surface-page:     var(--gray-50);
  --surface-card:     var(--white);
  --surface-sunken:   var(--gray-100);
  --surface-inverse:  var(--gray-900);
  --surface-urgent:   var(--amber-50);
  --surface-error:    var(--red-50);

  /* Text */
  --text-strong:      var(--gray-900);
  --text-body:        var(--gray-700);
  --text-muted:       var(--gray-500);
  --text-on-primary:  var(--white);
  --text-on-inverse:  var(--white);
  --text-urgent:      var(--amber-700);
  --text-error:       var(--red-700);
  --text-link:        var(--green-700);

  /* Action — primary */
  --action-primary-bg:        var(--green-700);
  --action-primary-bg-hover:  var(--green-800);
  --action-primary-bg-active: var(--green-900);
  --action-primary-fg:        var(--white);

  /* Action — secondary */
  --action-secondary-bg:        var(--white);
  --action-secondary-bg-hover:  var(--gray-50);
  --action-secondary-border:    var(--gray-300);
  --action-secondary-fg:        var(--gray-700);

  /* Action — ghost */
  --action-ghost-bg-hover:      var(--gray-100);
  --action-ghost-fg:            var(--gray-700);

  /* Borders */
  --border-default:   var(--gray-200);
  --border-strong:    var(--gray-300);
  --border-focus:     var(--green-700);

  /* Status accents */
  --status-fresh:     var(--green-600);
  --status-stale:     var(--gray-400);
  --status-urgent:    var(--amber-600);
  --status-error:     var(--red-600);

  /* Focus ring */
  --focus-ring:       var(--green-700);
}
```

**typography.css**
```css
:root {
  --font-sans: 'Public Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', 'Menlo', monospace;

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;
  --text-5xl:  3rem;

  --leading-tight:   1.2;
  --leading-snug:    1.35;
  --leading-normal:  1.5;
  --leading-relaxed: 1.65;

  --tracking-tight:  -0.02em;
  --tracking-normal: 0;
  --tracking-wide:   0.04em;

  --font-display:  var(--weight-bold)     var(--text-2xl)/var(--leading-tight) var(--font-sans);
  --font-heading:  var(--weight-semibold) var(--text-lg)/var(--leading-snug)   var(--font-sans);
  --font-body:     var(--weight-regular)  var(--text-base)/var(--leading-normal) var(--font-sans);
  --font-label:    var(--weight-medium)   var(--text-sm)/var(--leading-snug)   var(--font-sans);
  --font-caption:  var(--weight-regular)  var(--text-sm)/var(--leading-snug)   var(--font-sans);
  --font-figure:   var(--weight-medium)   var(--text-base)/var(--leading-snug) var(--font-mono);
}

.gma-figure,
[data-figure] {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1, 'zero' 1;
  font-variant-numeric: tabular-nums slashed-zero;
}
```

**spacing.css**
```css
:root {
  --space-0:  0;
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-5:  1.25rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;

  --gutter-page:    var(--space-4);
  --gap-feed:       var(--space-3);
  --pad-card:       var(--space-3);
  --pad-control:    var(--space-3);

  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-xl:   12px;
  --radius-2xl:  16px;
  --radius-full: 9999px;

  --border-hairline: 1px;
  --border-thick:    2px;

  --control-height:    44px;
  --control-height-sm: 36px;
  --tap-min:           44px;

  --content-max:   640px;
  --content-wide:  1120px;
}
```

**elevation.css**
```css
:root {
  --shadow-none: none;
  --shadow-xs:   0 1px 2px 0 rgba(17, 24, 39, 0.05);
  --shadow-sm:   0 1px 3px 0 rgba(17, 24, 39, 0.08), 0 1px 2px -1px rgba(17, 24, 39, 0.08);
  --shadow-md:   0 4px 12px -2px rgba(17, 24, 39, 0.10), 0 2px 6px -2px rgba(17, 24, 39, 0.06);
  --shadow-lg:   0 12px 28px -6px rgba(17, 24, 39, 0.16), 0 4px 10px -4px rgba(17, 24, 39, 0.08);

  --ring-offset: 2px;
  --ring-width:  2px;
  --ring:        0 0 0 var(--ring-offset) var(--surface-card),
                 0 0 0 calc(var(--ring-offset) + var(--ring-width)) var(--focus-ring);

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-out:      cubic-bezier(0, 0, 0.2, 1);
  --duration-fast:   120ms;
  --duration-normal: 180ms;
  --duration-slow:   240ms;

  --transition-control: background-color var(--duration-fast) var(--ease-standard),
                        border-color var(--duration-fast) var(--ease-standard),
                        color var(--duration-fast) var(--ease-standard),
                        box-shadow var(--duration-fast) var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast:   0ms;
    --duration-normal: 0ms;
    --duration-slow:   0ms;
  }
}
```

**fonts.css** (fix `src` paths to match the client's vendored location — see Task 1)
```css
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../assets/fonts/public-sans-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('../assets/fonts/public-sans-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('../assets/fonts/public-sans-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../assets/fonts/public-sans-700.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../assets/fonts/ibm-plex-mono-400.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('../assets/fonts/ibm-plex-mono-500.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('../assets/fonts/ibm-plex-mono-600.woff2') format('woff2');
}
```

**base.css**
```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  margin: 0;
  font: var(--font-body);
  color: var(--text-body);
  background: var(--surface-page);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4 {
  margin: 0;
  color: var(--text-strong);
  font-family: var(--font-sans);
  line-height: var(--leading-snug);
}

h1 { font-size: var(--text-2xl); font-weight: var(--weight-bold); }
h2 { font-size: var(--text-lg);  font-weight: var(--weight-semibold); }
h3 { font-size: var(--text-base); font-weight: var(--weight-semibold); }

p { margin: 0; }

a {
  color: var(--text-link);
  text-decoration: none;
}
a:hover { text-decoration: underline; }

:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: var(--border-thick) solid var(--focus-ring);
  outline-offset: var(--ring-offset);
}

:where(time, [data-figure]) {
  font-variant-numeric: tabular-nums slashed-zero;
}
```

### Current client state (read these before starting)
- `client/src/index.css:1` — `@import "tailwindcss";` (only line). Tailwind v4 via `@tailwindcss/vite` (`client/package.json:19,32`, `tailwindcss ^4.3.0`), React 19, Vitest 4, TS ~6.0.
- `client/src/main.tsx:3` — imports `./index.css` only (so the token layer must be reachable from `index.css`).
- `client/src/App.tsx` — placeholder: `<AgeGate><div className="min-h-screen bg-gray-50"><h1 …>Gma's Helper</h1><DealFeed/></div></AgeGate>`. The `<h1>` and wordmark are 6-3's concern; leave structure.
- `client/src/App.css` — Vite scaffold, orphaned (not imported). Safe to delete after confirming.
- Existing components (`AgeGate`, `DealFeed`, `DealCard`, `DistanceFilter`, `StaleIndicator`, `VehicleSelector`) already use default Tailwind utilities whose hexes match the tokens — they keep working and are NOT modified here.

### Testing standards
- Framework: **Vitest** + React Testing Library (`client/`), TS strict (CLAUDE.md). Tests colocate `*.test.tsx`.
- This story is CSS/asset-only — no new unit tests are required for tokens themselves, but the **existing suite must stay green** (proves no regression). If you trim `App.tsx`, ensure any snapshot/render assertions still pass.
- Verification of tokens/fonts/base is a **manual visual smoke** (Task 5) — do not fabricate a passing automated test for visual rendering.
- **Token name correctness (finding 9):** CSS custom property name typos (e.g. `--grreen-700`) are **not** caught by `tsc -b` or `vite build`. Mitigation: copy all declarations verbatim from the "Exact token values" source CSS in Dev Notes — do not reconstruct from memory. The Task 4 spot-check grep provides a minimal presence check for critical properties; typos on non-checked names surface only at Task 5 visual smoke or during 6-2/6-3 consumption.

### Project Structure Notes
- Epic 6 has no PRD/epics.md entry — it's a cross-cutting design-application epic created 2026-06-16 (same individually-tracked pattern as `5-1-deploy-scraper-service`, `data-hardening`). Tracked under new keys `epic-6` + `6-1/6-2/6-3` in `sprint-status.yaml`.
- All changes confined to `client/`. The import folder (`_bmad-output/planning-artifacts/ux-designs/.../imports/`) is the **source** to copy from — do not modify it.
- Per CLAUDE.md ADR rule: this story makes no architectural decision (it implements the already-ruled design contract), so no new ADR is required; if the Tailwind v4 `@theme` wiring strategy proves non-obvious, record it as a short ADR.

### Latest Tech — Tailwind CSS v4 `@theme`
- The client is on Tailwind **v4** (CSS-first config: no `tailwind.config.js`; `@import "tailwindcss";` + `@tailwindcss/vite`). In v4, design tokens live in an `@theme { … }` block and are emitted as `:root` custom properties **and** drive utility generation, but only for recognized namespaces (`--color-*`, `--font-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--text-*`, etc.).
- **Strategy:** put utility-backing tokens in `@theme` using the v4 namespace names (e.g. `--color-action-primary-bg`, `--radius-lg`); put the import's raw `--green-700`-style vars + composite shorthands + semantic aliases that 6-2 consumes via `var()` in a plain `:root` (or `@theme inline` if you want both a utility and a var). **Verify the current v4 namespace + `@theme inline` semantics against the official Tailwind v4 docs before finalizing** — this is the one area where the exact syntax must be confirmed, not assumed.
- Do not add `tailwindcss-animate` or other plugins; motion is handled by the token-level transitions.

**`@theme` replaces Tailwind defaults (finding 11):** Every namespace key you define in `@theme` (e.g. `--color-green-700`) overrides Tailwind v4's built-in default for that name. `bg-green-700` will resolve to our `#15803d` token rather than any Tailwind v4 built-in value. If Tailwind v4's built-in `green-700` was already `#15803d`, there is no visual change; if it differs, there is a minor color delta. Either outcome is acceptable — the design tokens are the authority. The no-regression guarantee in Context & Scope covers component logic and layout, not pixel-identical preservation of Tailwind's defaults.

### Italic font variants — design decision

The import contains **only non-italic woff2 files** (Public Sans 400/500/600/700, IBM Plex Mono 400/500/600 — all `font-style: normal`). The current client components and `base.css` use zero `font-style: italic` declarations.

**Decision: italic variants are not vendored for 6-1.** Rationale: the design system's base styles do not assign italic to any element; `<em>` / `<i>` in rendered content (if any) will produce browser faux-italic synthesis — acceptable for this app's content domain (deal cards, distances, prices, navigation). If a 6-2 or 6-3 component needs true italic, source the italic woff2 files at that time and add the `@font-face` rules then.

Task 1 grep (above) confirms the zero-usage baseline before implementation begins, so the decision is data-grounded, not assumed.

### References
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/DESIGN.md] — frontmatter token map; Colors/Typography/Layout/Elevation/Shapes sections; `:288` house-corner ruling; `:276` shadow values
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/EXPERIENCE.md#Foundation] — Tailwind v4 stack (`:21`); Accessibility Floor focus ring (`:128`)
- [Source: …/imports/gmas-helper-design-system/tokens/{colors,typography,spacing,elevation,fonts,base}.css] — verbatim token values to port
- [Source: …/imports/gmas-helper-design-system/styles.css] — import manifest (order: fonts → colors → typography → spacing → elevation → base → components); 6-1 ports all but `components.css` (that's 6-2)
- [Source: …/reconcile-gmas-helper-design-system.md §2 O1/O3, §4] — token-files-win ruling; never quote `_imported-CLAUDE.md.txt`
- [Source: client/src/index.css, main.tsx, App.tsx, App.css, package.json] — current client state
- [Source: _bmad-output/implementation-artifacts/5-1-deploy-scraper-service.md] — precedent for a cross-cutting individually-tracked story

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Description |
|------|-------------|
| 2026-06-16 | Story drafted (create-story). Epic 6 split ruled with Erik: foundation (6-1) → primitives (6-2) → surface re-skin + VehicleSelector sheet (6-3). 6-1 scope = token layer + Tailwind v4 `@theme` + self-hosted fonts + base.css; VehicleSelector bottom-sheet ruling (`.decision-log.md:48`) baked into 6-3, not here. |
| 2026-06-16 | Spec hardening: (1) AC 6 "confirmed" removed — verification is now a Task 4 precondition, not a pre-stated fact; (2) Italic font variants design decision documented in Dev Notes + AC 1 footnote + Task 1 grep sub-task added. |
| 2026-06-16 | Spec hardening pass 2 (edge-case review items 6–8): (6) AC 4 + Task 3 now explicitly note that `[data-figure]`'s `font-family` comes from `typography.css`'s selector rule (Task 2 scope), not `base.css` — closes the AC 1 ↔ AC 4 gap; (7) optional App.tsx trim removed entirely — App.tsx is DO NOT MODIFY this story, eliminating the undefined "done" state and snapshot-break risk; (8) Task 1 ellipsis path replaced with full verified project-root-relative path + explicit 7-file list with HALT condition. |
| 2026-06-16 | Spec hardening pass 3 (edge-case review items 9–11): (9) Token name correctness: explicit risk acceptance added to Testing standards (tsc/vite won't catch misspelled custom properties) + Task 4 spot-check grep for nine sentinel properties; (10) Sprint-status tracking: parenthetical assertion converted to explicit Task 0 pre-flight check with verification step; (11) Behavior-preservation guarantee reframed — `@theme` replaces Tailwind v4 defaults by design, minor color deltas are expected/intentional, the guarantee covers component logic + layout only. |
