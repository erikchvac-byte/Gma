---
name: Gma's Helper
description: Visual identity for Gma's Helper (Happy) — a flat, honest, phone-first utility answering "is this cannabis deal worth the drive?" Distilled at Finalize from .decision-log.md and imports/gmas-helper-design-system; token values lifted verbatim from the import's tokens/*.css.
status: final
updated: 2026-06-12
colors:
  # ---- Brand green ramp (the single action color) ----
  green-50: '#f0fdf4'
  green-100: '#dcfce7'
  green-200: '#bbf7d0'
  green-300: '#86efac'
  green-500: '#22c55e'
  green-600: '#16a34a'
  green-700: '#15803d'
  green-800: '#166534'
  green-900: '#14532d'
  # ---- Neutral gray ramp (the information grid) ----
  gray-50: '#f9fafb'
  gray-100: '#f3f4f6'
  gray-200: '#e5e7eb'
  gray-300: '#d1d5db'
  gray-400: '#9ca3af'
  gray-500: '#6b7280'
  gray-600: '#4b5563'
  gray-700: '#374151'
  gray-800: '#1f2937'
  gray-900: '#111827'
  white: '#ffffff'
  # ---- Amber (urgency only — countdowns, time-limited deals) ----
  # do not lighten amber-700 / darken amber-100 — urgent badge AA margin is 0.01 (4.510:1)
  amber-50: '#fffbeb'
  amber-100: '#fef3c7'
  amber-200: '#fde68a'
  amber-600: '#d97706'
  amber-700: '#b45309'
  # ---- Red (errors / destructive only) ----
  red-50: '#fef2f2'
  red-200: '#fecaca'
  red-600: '#dc2626'
  red-700: '#b91c1c'
  # ---- Semantic aliases (resolved hex; ramp source noted in prose) ----
  surface-page: '#f9fafb'
  surface-card: '#ffffff'
  surface-sunken: '#f3f4f6'
  surface-inverse: '#111827'
  surface-urgent: '#fffbeb'
  surface-error: '#fef2f2'
  text-strong: '#111827'
  text-body: '#374151'
  text-muted: '#6b7280'
  text-on-primary: '#ffffff'
  text-on-inverse: '#ffffff'
  text-urgent: '#b45309'
  text-error: '#b91c1c'
  text-link: '#15803d'
  action-primary-bg: '#15803d'
  action-primary-bg-hover: '#166534'
  action-primary-bg-active: '#14532d'
  action-primary-fg: '#ffffff'
  action-secondary-bg: '#ffffff'
  action-secondary-bg-hover: '#f9fafb'
  action-secondary-border: '#d1d5db'
  action-secondary-fg: '#374151'
  action-ghost-bg-hover: '#f3f4f6'
  action-ghost-fg: '#374151'
  border-default: '#e5e7eb'
  border-strong: '#d1d5db'
  border-field: '#6b7280' # form-field boundary — 4.83:1 on white, 3:1 non-text floor
  border-focus: '#15803d'
  status-fresh: '#16a34a'
  status-stale: '#9ca3af'
  status-urgent: '#d97706'
  status-error: '#dc2626'
  focus-ring: '#15803d'
typography:
  display:
    fontFamily: 'Public Sans'
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  heading:
    fontFamily: 'Public Sans'
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.35'
  body:
    fontFamily: 'Public Sans'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'Public Sans'
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.35'
  caption:
    fontFamily: 'Public Sans'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.35'
  figure:
    fontFamily: 'IBM Plex Mono'
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.35'
    note: 'ALL money / distance / time figures. Always tabular-nums + slashed-zero (font-feature-settings: tnum 1, zero 1). Renders at 14px (caption size) in card metadata rows.'
  overline:
    fontFamily: 'Public Sans'
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.04em
    note: 'UPPERCASE. Badge pills and slider tick micro-labels only — never running text. The only size below 14px anywhere.'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  DEFAULT: 8px
  xl: 12px
  2xl: 16px
  full: 9999px
spacing:
  '0': 0px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '10': 40px
  '12': 48px
  '16': 64px
  gutter-page: 16px
  gap-feed: 12px
  pad-card: 12px
  pad-control: 12px
  control-height: 44px
  control-height-sm: 36px
  tap-min: 44px
  content-max: 640px
  content-wide: 1120px
components:
  button-primary:
    background: '{colors.action-primary-bg}'
    background-hover: '{colors.action-primary-bg-hover}'
    background-active: '{colors.action-primary-bg-active}'
    foreground: '{colors.action-primary-fg}'
    radius: '{rounded.lg}'
    min-height: '{spacing.control-height}'
  button-secondary:
    background: '{colors.action-secondary-bg}'
    background-hover: '{colors.action-secondary-bg-hover}'
    border: '{colors.action-secondary-border}'
    foreground: '{colors.action-secondary-fg}'
    radius: '{rounded.lg}'
    min-height: '{spacing.control-height}'
  button-ghost:
    background: 'transparent'
    background-hover: '{colors.action-ghost-bg-hover}'
    foreground: '{colors.action-ghost-fg}'
    radius: '{rounded.lg}'
    min-height: '{spacing.control-height}'
  button-danger:
    background: '{colors.red-600}'
    background-hover: '{colors.red-700}'
    foreground: '{colors.white}'
    radius: '{rounded.lg}'
    min-height: '{spacing.control-height}'
  icon-button:
    size: '{spacing.control-height}'
    size-sm: '{spacing.control-height-sm}'
    radius: '{rounded.lg}'
    foreground: '{colors.action-ghost-fg}'
    background-hover: '{colors.action-ghost-bg-hover}'
  card:
    background: '{colors.surface-card}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.lg}'
    padding: '{spacing.pad-card}'
    shadow: 'none'
  badge:
    typography: '{typography.overline}'
    radius: '{rounded.full}'
    padding: '4px {spacing.2}'
  range-slider:
    track-height: 6px
    track-color: '{colors.gray-200}'
    thumb-size: 22px
    thumb-hit-target: 44px # transparent expanded hit area; painted thumb stays 22px
    thumb-color: '{colors.action-primary-bg}'
    thumb-border: '3px solid {colors.white}'
    value-typography: '{typography.figure}'
  text-field:
    background: '{colors.white}'
    border: '1px solid {colors.border-field}'
    border-focus: '{colors.border-focus}'
    radius: '{rounded.lg}'
    min-height: '{spacing.control-height}'
  select:
    background: '{colors.white}'
    border: '1px solid {colors.border-field}'
    border-focus: '{colors.border-focus}'
    radius: '{rounded.lg}'
    min-height: '{spacing.control-height}'
    chevron-color: '{colors.gray-500}'
  skeleton:
    background: '{colors.gray-200}'
    radius: '{rounded.lg}'
    animation: 'opacity pulse 1.4s (none under reduced motion)'
  notice:
    background: '{colors.surface-sunken}'
    foreground: '{colors.text-body}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.lg}'
    typography: '{typography.caption}'
  focus-ring:
    color: '{colors.focus-ring}'
    width: 2px
    offset: 2px
---

## Brand & Style

Gma's Helper is a clean, flat, utilitarian tool — closer in posture to a trustworthy public-utility or finance app than to anything in the cannabis aesthetic. It is deliberately **not** stoner-branded and not youth-marketed: the audience is budget-aware adults (the returning buyer, the careful regular, the newcomer) deciding whether a deal is worth the gas to reach it. The whole product is a single honest comparison, so the design language is plain, flat, and honest to match.

The signature is the figures. Every dollar, mile, and minute is set in tabular, slashed-zero IBM Plex Mono so the numbers align and read as measured fact: `9.8 mi · $1.46 · 24 min left`. Around them, Public Sans (civic, plain, highly legible — a fit for a product built on government data sources like EIA and fueleconomy.gov) carries everything readable. There is essentially no imagery: no photography, no illustration, no cannabis-leaf anything. Surfaces are solid flat fills; the only pictures are 2px-stroke Lucide line icons that support, never decorate.

The system is **light-only on purpose**. Dark mode is a stated future consideration, not a v1 surface. The primary surface is a phone in a driveway, deciding whether to turn the key — everything below is tuned for that moment.

Import gallery references: [brand wordmark](imports/gmas-helper-design-system/guidelines/brand-wordmark.card.html) · [brand voice](imports/gmas-helper-design-system/guidelines/brand-voice.card.html) · [readme](imports/gmas-helper-design-system/readme.md). The wordmark is a {colors.green-700} rounded square holding the Lucide `navigation` icon beside "Gma's Helper" in bold sans.

## Colors

Token values are lifted verbatim from [tokens/colors.css](imports/gmas-helper-design-system/tokens/colors.css); specimen cards: [brand](imports/gmas-helper-design-system/guidelines/colors-brand.card.html), [neutral](imports/gmas-helper-design-system/guidelines/colors-neutral.card.html), [semantic](imports/gmas-helper-design-system/guidelines/colors-semantic.card.html). Color is used sparingly and always means something:

- **Green-700 (`#15803d`)** is the *only* action color — the "go" of the age-gate confirm, the link color, the slider thumb, and the focus ring. Hover darkens one step to {colors.green-800}; press darkens a second step to {colors.green-900}. The green never appears as decoration, tint wash, or background flourish.
- **The gray ramp** is the information grid: {colors.surface-page} page, {colors.surface-card} cards, {colors.border-default} hairlines, {colors.text-body} body, {colors.text-muted} metadata (distance, windows, footnotes), {colors.text-strong} headings and dispensary names. {colors.surface-inverse} (gray-900) is reserved for full-screen takeovers — in practice, the age gate.
- **Amber** is reserved *strictly* for urgency — happy-hour countdowns and time-sensitive deals — so it always means "this expires." {colors.status-urgent} for accents, {colors.text-urgent} for countdown text, {colors.surface-urgent} + {colors.amber-200} border for the urgent card tint.
- **Red** is errors only: {colors.status-error} / {colors.text-error} on {colors.surface-error}. Never used for urgency, emphasis, or discounts.
- **Status accents**: {colors.status-fresh} (fresh source dot), {colors.status-stale} (muted gray-400 — stale status is deliberately non-intrusive per ADR-026).

Components reference the semantic aliases (`action-primary-bg`, `border-default`, `text-muted`…), never raw ramp steps — the ramps exist so the aliases resolve, and so downstream code never invents a hex.

Load-bearing combinations meet WCAG AA: {colors.text-body} and {colors.text-muted} on white, {colors.text-strong} on {colors.surface-page}, and white on {colors.green-700} (the action pair) all clear 4.5:1. The tint pairs hold too: {colors.text-urgent} on {colors.surface-urgent} (4.84:1), {colors.text-error} on {colors.surface-error} (5.91:1), and the urgent badge's amber-700 on amber-100 (4.510:1 — knife-edge, pinned by the frontmatter comment; never lighten amber-700 or darken amber-100). {colors.status-stale} (gray-400, 2.54:1 on white) must always be paired with text — as it is today in "N sources unavailable" — and never used as a sole indicator.

Avoid: gradients, tinted brand washes, purple/blue accents, color-coding deal categories, red for anything but errors, amber for anything that doesn't expire.

## Typography

Two families, both self-hosted ([tokens/fonts.css](imports/gmas-helper-design-system/tokens/fonts.css), woff2 latin subset; scale in [tokens/typography.css](imports/gmas-helper-design-system/tokens/typography.css); specimens: [families](imports/gmas-helper-design-system/guidelines/type-families.card.html), [scale](imports/gmas-helper-design-system/guidelines/type-scale.card.html), [figures](imports/gmas-helper-design-system/guidelines/type-figures.card.html)):

- **Public Sans** (400 / 500 / 600 / 700) — everything readable. Headings are semibold/bold {colors.text-strong}; body is regular {colors.text-body}.
- **IBM Plex Mono** (400 / 500 / 600) — every money, distance, and time figure, always with `font-variant-numeric: tabular-nums slashed-zero`. This is non-negotiable: numbers are the product, and they must align and read as fact, not marketing.

Roles: {typography.display} (page title), {typography.heading} (age-gate prompt, sheet titles), {typography.body} (deal descriptions), {typography.label} / {typography.caption} (form labels, metadata, footnotes), {typography.figure} (figures — drops to 14px in card metadata rows like distance and windows), {typography.overline} (uppercase badge pills only).

The floor: **nothing readable sits below 14px on primary surfaces.** The 12px {typography.overline} size exists solely for uppercase badge micro-labels and slider tick marks. Sentence case everywhere; UPPERCASE only in overline badges; never title case for UI copy. The raw scale (12/14/16/18/20/24/30/36/48px) and tracking tokens (−0.02em display, +0.04em overline) live in the import token file; the larger display sizes are reserved for future marketing surfaces, not the app.

## Layout & Spacing

A **4px base grid** ([tokens/spacing.css](imports/gmas-helper-design-system/tokens/spacing.css); specimen: [spacing scale](imports/gmas-helper-design-system/guidelines/spacing-scale.card.html)). The feed is tight and scannable — an information density closer to a ledger than a marketing page: {spacing.pad-card} (12px) card padding, {spacing.gap-feed} (12px) between cards, {spacing.gutter-page} (16px) page gutter.

The reading column is capped at {spacing.content-max} (**640px**) and never sprawls. The app is **phone-first, single column**; on larger screens the column simply centers on the {colors.surface-page} gray page. The space either side of the column is deliberately unspecced — a future consideration (possibly ads, per the product's non-intrusive-ads-only rule), not a layout. {spacing.content-wide} (1120px) exists in the tokens for a future marketing/desktop shell and is not used by the app.

Hit targets are mobile-first: {spacing.tap-min} (44px) minimum, {spacing.control-height} (44px) standard control height, {spacing.control-height-sm} (36px) only for dense toolbar contexts.

## Elevation & Depth

The brand is **flat and honest** ([tokens/elevation.css](imports/gmas-helper-design-system/tokens/elevation.css); specimen: [elevation](imports/gmas-helper-design-system/guidelines/elevation.card.html)). Cards are defined by a **1px {colors.border-default} hairline on {colors.surface-card}**, not by drop shadows — the feed is shadowless. Shadows appear only on genuinely floating UI:

- `shadow-sm` — the quiet lift on interactive-card hover (the only shadow a card may ever carry, and only while hovered).
- `shadow-md` / `shadow-lg` — the settings sheet and overlays. The sheet floats; the feed does not.
- No element ever has both a heavy border *and* a shadow.

The token values, restated from [tokens/elevation.css](imports/gmas-helper-design-system/tokens/elevation.css) so this section stands alone: shadow-xs `0 1px 2px 0 rgba(17,24,39,0.05)`; shadow-sm `0 1px 3px 0 rgba(17,24,39,0.08), 0 1px 2px -1px rgba(17,24,39,0.08)`; shadow-md `0 4px 12px -2px rgba(17,24,39,0.10), 0 2px 6px -2px rgba(17,24,39,0.06)`; shadow-lg `0 12px 28px -6px rgba(17,24,39,0.16), 0 4px 10px -4px rgba(17,24,39,0.08)`. Never quote `_imported-CLAUDE.md.txt` for values — its radius/shadow numbers are wrong; the token files are the source.

The settings-sheet scrim is a flat `rgba(17,24,39,0.45)` — no glassmorphism, no backdrop blur, anywhere.

Focus is its own depth cue: a 2px {colors.focus-ring} outline with a 2px offset (a white-gap ring on filled controls) — always visible, WCAG AA.

Motion is functional, never decorative or bouncy: quick fades and color transitions at 120–240ms on a standard ease. The slider thumb scales 1.08 on hover; the loading feed uses a soft opacity pulse. No infinite loops on content, and every duration collapses to 0ms under `prefers-reduced-motion`.

## Shapes

**8px is the house corner** — buttons, cards, inputs, selects, and notices all share {rounded.lg} / {rounded.DEFAULT}. Pills (badges, the slider thumb and track) are fully round ({rounded.full}). The settings bottom sheet uses a larger {rounded.2xl} (16px) top radius to read as a distinct floating layer. {rounded.sm} and {rounded.md} exist in the scale for fine-grained needs but no shipping component uses them; {rounded.xl} (12px) is unassigned. Specimen: [radius](imports/gmas-helper-design-system/guidelines/radius.card.html).

**Naming note (binding ruling):** the import's prose claims `--radius-md: 8px` is the house corner, but [tokens/spacing.css](imports/gmas-helper-design-system/tokens/spacing.css) defines `--radius-lg: 8px` as the default and is internally consistent across components.css. **The token files win**: the house corner is `radius-lg: 8px`, mapped here as {rounded.lg} and {rounded.DEFAULT}.

## Components

The system is ten primitives plus the composed app surfaces. Visual specs below; behavior lives in `EXPERIENCE.md → Component Patterns`. Consumers link one stylesheet — [styles.css](imports/gmas-helper-design-system/styles.css), the import manifest — which pulls the token files plus [tokens/base.css](imports/gmas-helper-design-system/tokens/base.css) (element resets that make raw HTML on-brand: body on {colors.surface-page}, always-visible focus outlines, tabular figures on `time`/`[data-figure]`). All component states are styled in [components/components.css](imports/gmas-helper-design-system/components/components.css); live specimens: [core](imports/gmas-helper-design-system/components/core/core.card.html), [forms](imports/gmas-helper-design-system/components/forms/forms.card.html), [feedback](imports/gmas-helper-design-system/components/feedback/feedback.card.html). Per-component prompt/type contracts sit beside each `.jsx` (e.g. [Button.d.ts](imports/gmas-helper-design-system/components/core/Button.d.ts)).

- **Button** — Variants: `primary` (the single green "go" affordance — {components.button-primary}), `secondary` (white, {colors.action-secondary-border} outline), `ghost` (transparent, {colors.action-ghost-bg-hover} hover fill), `danger` ({colors.red-600}, errors/destructive only). Sizes `md` (44px) / `sm` (36px); `block` stretches full-width for mobile CTAs. Semibold {typography.body}-size label, {rounded.lg} corner, optional leading/trailing icon. Hover darkens one step, press two; disabled is 50% opacity, no pointer events; focus shows the white-gap ring.
- **IconButton** — Square 44px (sm: 36px), {rounded.lg}, transparent with {colors.action-ghost-bg-hover} hover; `outlined` adds {colors.action-secondary-border} + white fill. Icon-only — `aria-label` is required. Used for the settings gear and sheet close.
- **Badge** — Small uppercase pill, {typography.overline} in a {rounded.full} capsule. Variants: `neutral` (gray-100/gray-600 — "Daily deal"), `urgent` (amber-100/amber-700 — "Happy hour"), `fresh` (green-50/green-800, dotted), `stale` (gray-100/{colors.gray-600}, dotted — 6.87:1, matching the neutral badge), `discount` (solid {colors.green-700}/white % chip). The 6px status dot inherits currentColor. Pills size from their content — padding only, never fixed width/height or clipping, so user text-spacing overrides never truncate the label (1.4.12).
- **Card** — The brand's core surface: {colors.surface-card} with a 1px {colors.border-default} hairline, {rounded.lg}, **no shadow**. Padding `default` (12px) / `flush` / `roomy` (20px). `interactive` darkens the border to {colors.border-strong} and gains `shadow-sm` on hover only. `urgent` tints to {colors.surface-urgent} with an {colors.amber-200} border for happy-hour content.
- **RangeSlider** — The distance filter: label left in {typography.label}, current value right in semibold {typography.figure} ("25 miles"), a 6px {colors.gray-200} pill track with a 22px {colors.action-primary-bg} thumb ringed by 3px white, optional {typography.overline}-scale tick labels ("1 mi" / "50 mi") in {colors.text-muted}. Thumb scales 1.08 on hover, darkens on press; keyboard focus draws the 2px outline offset from the track.
- **TextField** — Stacked label ({typography.label}), input (white, 1px {colors.border-field}, {rounded.lg}, 44px), then hint ({colors.text-muted}) or error ({colors.text-error}, with `aria-invalid` red border). `mono` switches to tabular {typography.figure} for numeric entry. Focus swaps the border to {colors.border-focus} plus the ring. The border is the field's only extent indicator, so it uses {colors.border-field} (4.83:1 — clears the 3:1 non-text floor); {colors.border-strong} stays on the secondary button, where the label carries the meaning.
- **Select** — Native select with brand chrome: same field metrics as TextField, CSS-drawn {colors.gray-500} chevron, disabled state at 50% opacity on {colors.gray-50}. Used as the Year → Make → Model cascade.
- **Skeleton / SkeletonFeed** — {colors.gray-200} blocks, {rounded.lg}, 1.4s opacity pulse (static under reduced motion). `SkeletonFeed` is the deal feed's exact loading state: stacked card-height rows (default 3).
- **Notice** — Inline message line in {typography.caption}: `default` ({colors.surface-sunken} box, {colors.text-body} text — 9.4:1; never {colors.text-muted} on sunken), `muted` (bare {colors.text-muted} line — the stale-source and last-updated footnotes), `error` ({colors.surface-error}/{colors.text-error}), `urgent` ({colors.surface-urgent}/{colors.text-urgent}). Optional leading 16px icon.

**Composed surfaces** (clickable reference: [ui_kits/app/index.html](imports/gmas-helper-design-system/ui_kits/app/index.html) — age gate → header → feed → settings sheet; sources [feed.jsx](imports/gmas-helper-design-system/ui_kits/app/feed.jsx), [settings.jsx](imports/gmas-helper-design-system/ui_kits/app/settings.jsx), [data.js](imports/gmas-helper-design-system/ui_kits/app/data.js)):

- **Age gate** — Full-screen {colors.surface-inverse} takeover. Centered: `shield-check` icon in {colors.green-300}, the attestation line in white {typography.heading}-scale regular, one primary Button. Nothing else.
- **Header** — Sticky, {colors.surface-card} with a {colors.border-default} bottom hairline: wordmark left, settings IconButton (gear) right.
- **Deal card** — A Card (urgent variant for happy hours): dispensary name in semibold 16px {colors.text-strong} with right-aligned distance in 14px {typography.figure} {colors.text-muted}; a Badge ("Happy hour" urgent / "Daily deal" neutral); the description in {typography.body}; the Discount Display line — discount % in semibold {colors.green-700}, then "— $X.XX to get there" with the figure in mono; footer row with the window in 14px mono {colors.text-muted} and, when timed, an amber countdown ("24 min left", clock icon, semibold {colors.text-urgent}).
- **Settings sheet** — Bottom sheet on {colors.surface-card}, {rounded.2xl} top corners, `shadow-lg`, over the flat scrim. Title row ("Your vehicle" + car icon in {colors.green-700}, close IconButton), explainer caption, three stacked Selects (one per row — see EXPERIENCE.md for the reflow rationale), a fuel-icon Notice showing the resolved MPG, and an action row.

Iconography throughout is **Lucide** (2px stroke, rounded caps), self-hosted ([assets/icons.js](imports/gmas-helper-design-system/assets/icons.js), [iconography specimen](imports/gmas-helper-design-system/guidelines/iconography.card.html)), sized 12–22px, recolored via currentColor. Icons support, never decorate: `clock` countdowns, `navigation` brand/distance, `fuel`/`car` gas math, `settings` gear, `shield-check` age gate, `triangle-alert`/`info` notices.

## Do's and Don'ts

| Do | Don't |
|---|---|
| One action color: {colors.green-700}, darkening on hover/press | Use green decoratively, or introduce a second accent |
| Amber strictly for "this expires" (countdowns, happy hours) | Use amber for emphasis, warnings-in-general, or branding |
| Red for errors only | Color-code categories, sentiment, or deal quality |
| Cards = 1px {colors.border-default} hairline on white, flat | Drop shadows on cards (shadows belong to floating UI only) |
| Every money/distance/time figure in tabular slashed-zero IBM Plex Mono | Set figures in the sans, or let numbers wiggle as they tick |
| Show discount and gas cost side by side ("30% off — $1.46 to get there") | Collapse them into an invented "you save $X" (ADR-009) |
| Sentence case; plain literal copy; no emoji | Title case, exclamation marks, cannabis-culture slang, 🔥 anything |
| ≥14px for all readable text; 12px only in uppercase badges | Shrink body or metadata below 14px to fit more in |
| Muted text on white or {colors.surface-page} only | Set {colors.text-muted} on {colors.surface-sunken} or gray-100 (4.39:1 — fails AA) |
| Solid flat fills; one flat scrim | Gradients, glassmorphism, backdrop blur, tinted washes |
| Quick functional motion (120–240ms), honoring reduced-motion | Bouncy, looping, or decorative animation |
| Build from tokens — reference semantic aliases | Hardcode a hex or restyle a primitive ad hoc |
| Lucide line icons that support the data | Emoji-as-icon, filled icon sets, cannabis-leaf imagery |
