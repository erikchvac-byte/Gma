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

**Behavior-preservation guarantee:** this story adds a styling layer only. It must not change any component logic or break the existing client test suite. Because the design system's ramp hexes are **identical to Tailwind's default palette** (e.g. `green-700` = `#15803d`, `gray-500` = `#6b7280`), the existing components' default utilities keep rendering; the base `body` background (`surface-page` = `gray-50`) already matches `App.tsx`'s current `bg-gray-50`. The visible deltas are additive: brand fonts, always-visible focus rings, tabular figures.

## Acceptance Criteria

1. **Self-hosted fonts vendored + declared.** The seven woff2 files (Public Sans 400/500/600/700, IBM Plex Mono 400/500/600) are copied from the import into the client and served locally (no Google Fonts / CDN). `@font-face` rules match the import's `tokens/fonts.css` (`font-display: swap`, correct weights/families), with `src` paths corrected to the client's vendored location. After load, body text renders in **Public Sans** and `[data-figure]`/mono contexts in **IBM Plex Mono**.

2. **Token layer ported as the single source of truth.** All design tokens from the import's six token files — `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `fonts.css`, `base.css` — are present in the client as authoritative CSS custom properties (`--green-700`, `--surface-page`, `--text-muted`, `--action-primary-bg`, `--space-3`, `--radius-lg`, `--shadow-lg`, `--ring`, `--font-figure`, `--duration-fast`, etc.), values **verbatim** from those files (the token files win over any prose — see Dev Notes). The composite/semantic aliases resolve (e.g. `var(--surface-page)` → `#f9fafb`).

3. **Tailwind v4 `@theme` wiring.** Tokens that back utility classes (palette, font families, spacing, radius) are exposed through Tailwind v4's `@theme` so brand utilities resolve to token values; tokens consumed only as `var()` in later component CSS (composite shorthands like `--font-body`, `--shadow-*`, `--ring`, motion tokens, semantic aliases) are available as `:root` custom properties. The house corner `rounded-lg` resolves to **8px** (Tailwind default already 8px — keep it; do not let any override drift it). `@import "tailwindcss";` is preserved.

4. **Base element styles applied.** The import's `base.css` resets are active app-wide: `box-sizing: border-box` universally; `body` uses `--font-body` on `--surface-page` with `--text-body` color; `h1`–`h4` map to the figure scale + weights; `:focus-visible` draws the 2px `--focus-ring` outline at `--ring-offset` on all interactive elements (never `outline: none` without replacement); `time, [data-figure]` get `font-variant-numeric: tabular-nums slashed-zero`.

5. **Reduced-motion honored at the token level.** The `@media (prefers-reduced-motion: reduce)` block collapses `--duration-fast/normal/slow` to `0ms`, exactly as `elevation.css` specifies.

6. **Dead scaffold removed; no regressions.** The orphaned Vite-scaffold `client/src/App.css` (Vite demo cruft — `.hero`, `.vite`, `#next-steps`; confirmed imported by no module) is removed. The client builds (`tsc -b && vite build`) clean and the **full client test suite passes unchanged** — no component logic touched.

7. **Scope boundary holds.** No primitive components are built (6-2). No surface is re-skinned and VehicleSelector is **not** reworked (6-3). No new runtime dependencies are added beyond the vendored font/token assets. `App.tsx`'s structure is unchanged except, optionally, removing the now-redundant inline `bg-gray-50`/font utilities that base.css now supplies (cosmetic, no behavior change).

## Tasks / Subtasks

- [ ] **Task 1 — Vendor self-hosted fonts** (AC: 1)
  - [ ] Copy the 7 woff2 files from `…/imports/gmas-helper-design-system/assets/fonts/` into the client (recommended: `client/src/assets/fonts/` so Vite fingerprints them, or `client/public/fonts/` for stable paths — pick one and be consistent in the `@font-face` `src`).
  - [ ] Port `tokens/fonts.css` `@font-face` rules into the client token layer, fixing each `src: url(...)` to the chosen vendored path. Keep `font-display: swap` and the exact family names `'Public Sans'` / `'IBM Plex Mono'` (the typography tokens reference these names).
  - [ ] Verify in the browser network tab that woff2 files load locally and body text switches to Public Sans.

- [ ] **Task 2 — Port the token layer** (AC: 2, 3, 5)
  - [ ] Bring the contents of `colors.css`, `typography.css`, `spacing.css`, `elevation.css` (and the `fonts.css` `@font-face` from Task 1) into the client's CSS, values **verbatim**. Recommended layout: a `client/src/styles/tokens.css` (or split mirroring the import) imported from `index.css` after `@import "tailwindcss";`.
  - [ ] Wire Tailwind v4 `@theme`: expose the palette (`--color-green-700: #15803d` …), font families (`--font-sans`, `--font-mono`), spacing (4px grid), and radius so brand utilities generate. Keep semantic aliases (`--action-primary-bg`, `--surface-page`, `--text-muted`…), composite shorthands (`--font-body`/`--font-figure`/`--font-heading`/`--font-display`/`--font-label`/`--font-caption`), shadows (`--shadow-xs…lg`), the `--ring` composition, border widths, control heights, and motion tokens as `:root`/`@theme inline` custom properties for `var()` consumption. **Verify the exact `@theme` namespace rules against current Tailwind v4 docs** (see Latest Tech).
  - [ ] Include the `@media (prefers-reduced-motion: reduce)` override that zeroes the duration tokens.
  - [ ] Confirm `rounded-lg` still resolves to 8px and the default Tailwind palette still works (so existing components don't visually regress).

- [ ] **Task 3 — Apply base element styles** (AC: 4)
  - [ ] Port `base.css` verbatim into the token layer (after the `:root` token definitions so its `var()` refs resolve): box-sizing reset, `body` font/color/background, `h1`–`h4` scale, link styling, the `:where(...):focus-visible` ring, and the `:where(time, [data-figure])` tabular-figure rule.
  - [ ] Confirm the focus ring is visible on the existing age-gate button and slider (keyboard-tab), and that `body` background is `--surface-page`.

- [ ] **Task 4 — Remove dead scaffold + verify no regressions** (AC: 6, 7)
  - [ ] Confirm `client/src/App.css` is imported by **no** module (grep `App.css` across `client/src`), then remove it. (It is Vite demo cruft; `main.tsx` imports only `index.css`.)
  - [ ] Optionally simplify `App.tsx`'s placeholder `bg-gray-50` / font utilities now that base.css supplies them — cosmetic only, keep `AgeGate`/`DealFeed` structure intact.
  - [ ] Run `cd client && npm run build` (`tsc -b && vite build`) — clean.
  - [ ] Run the full client test suite (`npm test` / `vitest run`) — all green, unchanged.

- [ ] **Task 5 — Visual smoke verification** (AC: 1–5)
  - [ ] Run `npm run dev`, load the app: body is Public Sans on `#f9fafb`, the age-gate button shows the green-700 fill + a visible focus ring on tab, and a quick `<span data-figure>9.8</span>` test (or the existing distance text once 6-3 lands) renders tabular slashed-zero mono. Capture nothing permanent — this is a manual gate, not a committed test.
  - [ ] Confirm reduced-motion: with OS "reduce motion" on, the duration tokens read 0ms (DevTools computed styles on `:root`).

## Dev Notes

### What to touch (all in `client/`)
- `client/src/index.css` — **UPDATE** (keep `@import "tailwindcss";`, add token import + `@theme`)
- `client/src/styles/tokens.css` (or equivalent) — **NEW** (the ported token layer + `@font-face` + base.css)
- `client/src/assets/fonts/*.woff2` (or `client/public/fonts/`) — **NEW** (7 vendored woff2 files)
- `client/src/App.css` — **DELETE** (orphaned Vite scaffold; confirm unreferenced first)
- `client/src/App.tsx` — **OPTIONAL TRIM** (placeholder utilities base.css now covers; no behavior change)

### Source of truth — token files win, prose lies
**Authoritative:** the six `tokens/*.css` files (read into this story below). **Do NOT** quote `imports/.../_imported-CLAUDE.md.txt` for any value — its radius and shadow numbers are wrong, and its component prop tables are fictional (reconcile §4). Binding ruling (`DESIGN.md:288`, reconcile O1/O3): the house corner is **`--radius-lg: 8px`** (not the prose's "radius-md: 8px"); shadows are the **dual-layer gray-900-based** values in `elevation.css` (not the prose's single-layer black). The token files are internally consistent with `components.css` and the guideline cards.

### Exact token values (verbatim — copy these, do not paraphrase)

**colors.css** — green ramp 50→900 (`--green-700: #15803d`, hover `--green-800: #166534`, active `--green-900: #14532d`), gray ramp 50→900 + white, amber (50/100/200/600/700), red (50/200/600/700). Semantic aliases: surfaces (`--surface-page: var(--gray-50)`, `--surface-card: var(--white)`, `--surface-sunken: var(--gray-100)`, `--surface-inverse: var(--gray-900)`, `--surface-urgent: var(--amber-50)`, `--surface-error: var(--red-50)`); text (`--text-strong: var(--gray-900)`, `--text-body: var(--gray-700)`, `--text-muted: var(--gray-500)`, `--text-on-primary/-inverse: var(--white)`, `--text-urgent: var(--amber-700)`, `--text-error: var(--red-700)`, `--text-link: var(--green-700)`); actions primary/secondary/ghost; borders (`--border-default: var(--gray-200)`, `--border-strong: var(--gray-300)`, `--border-focus: var(--green-700)`); status (`--status-fresh: var(--green-600)`, `--status-stale: var(--gray-400)`, `--status-urgent: var(--amber-600)`, `--status-error: var(--red-600)`); `--focus-ring: var(--green-700)`.

**typography.css** — `--font-sans: 'Public Sans', system-ui, -apple-system, 'Segoe UI', sans-serif`; `--font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', 'Menlo', monospace`. Weights 400/500/600/700. Scale `--text-xs:0.75rem` … `--text-2xl:1.5rem` … `--text-5xl:3rem`. Leadings tight/snug/normal/relaxed (1.2/1.35/1.5/1.65). Tracking tight/normal/wide (−0.02em/0/0.04em). Role shorthands: `--font-display`, `--font-heading`, `--font-body`, `--font-label`, `--font-caption`, `--font-figure` (each a `font:` shorthand). Plus the `.gma-figure, [data-figure]` rule (`font-feature-settings:'tnum' 1,'zero' 1`).

**spacing.css** — 4px grid `--space-0…16`; semantic `--gutter-page/--gap-feed/--pad-card/--pad-control: var(--space-4/3/3/3)`; radius `--radius-sm:4px / -md:6px / -lg:8px / -xl:12px / -2xl:16px / -full:9999px`; `--border-hairline:1px / --border-thick:2px`; `--control-height:44px / -sm:36px / --tap-min:44px`; `--content-max:640px / --content-wide:1120px`.

**elevation.css** — `--shadow-none/xs/sm/md/lg` (xs `0 1px 2px 0 rgba(17,24,39,.05)`; lg `0 12px 28px -6px rgba(17,24,39,.16), 0 4px 10px -4px rgba(17,24,39,.08)`); `--ring-offset:2px / --ring-width:2px`; `--ring` composition; motion `--ease-standard/-out`, `--duration-fast:120ms/-normal:180ms/-slow:240ms`, `--transition-control`; the reduced-motion `@media` block zeroing durations.

**base.css** — box-sizing reset; `html` text-size-adjust; `body { font: var(--font-body); color: var(--text-body); background: var(--surface-page); }`; `h1`–`h4` (h1 `--text-2xl`/bold, h2 `--text-lg`/semibold, h3 `--text-base`/semibold); link color `--text-link` underline-on-hover; `:where(a,button,input,select,textarea,[tabindex]):focus-visible { outline: var(--border-thick) solid var(--focus-ring); outline-offset: var(--ring-offset); }`; `:where(time,[data-figure]) { font-variant-numeric: tabular-nums slashed-zero; }`.

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

### Project Structure Notes
- Epic 6 has no PRD/epics.md entry — it's a cross-cutting design-application epic created 2026-06-16 (same individually-tracked pattern as `5-1-deploy-scraper-service`, `data-hardening`). Tracked under new keys `epic-6` + `6-1/6-2/6-3` in `sprint-status.yaml`.
- All changes confined to `client/`. The import folder (`_bmad-output/planning-artifacts/ux-designs/.../imports/`) is the **source** to copy from — do not modify it.
- Per CLAUDE.md ADR rule: this story makes no architectural decision (it implements the already-ruled design contract), so no new ADR is required; if the Tailwind v4 `@theme` wiring strategy proves non-obvious, record it as a short ADR.

### Latest Tech — Tailwind CSS v4 `@theme`
- The client is on Tailwind **v4** (CSS-first config: no `tailwind.config.js`; `@import "tailwindcss";` + `@tailwindcss/vite`). In v4, design tokens live in an `@theme { … }` block and are emitted as `:root` custom properties **and** drive utility generation, but only for recognized namespaces (`--color-*`, `--font-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--text-*`, etc.).
- **Strategy:** put utility-backing tokens in `@theme` using the v4 namespace names (e.g. `--color-action-primary-bg`, `--radius-lg`); put the import's raw `--green-700`-style vars + composite shorthands + semantic aliases that 6-2 consumes via `var()` in a plain `:root` (or `@theme inline` if you want both a utility and a var). **Verify the current v4 namespace + `@theme inline` semantics against the official Tailwind v4 docs before finalizing** — this is the one area where the exact syntax must be confirmed, not assumed.
- Do not add `tailwindcss-animate` or other plugins; motion is handled by the token-level transitions.

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
