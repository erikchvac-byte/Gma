# Gma's Helper — Design System

This folder is the **Gma's Helper Design System** — a standalone CSS + React component library for the *Happy* app ("is this cannabis happy-hour deal worth the drive?"). Link `styles.css`, load `_ds_bundle.js`, and build.

**Authority:** this folder implements the finalized UX spines at `Happy/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/` (`DESIGN.md` + `EXPERIENCE.md`, status final). **The spines win on conflict with anything here**, including this file.

**Not a stoner brand.** Plain, flat, utilitarian — public-utility/finance-app posture for budget-aware adults. Never emoji, cannabis-culture slang, gradients, or tinted washes.

---

## Setup

No provider or wrapper is required. Two files do everything:

```html
<link rel="stylesheet" href="./design-system/styles.css" />
<script src="./design-system/_ds_bundle.js"></script>
<script>
  const { Button, IconButton, Badge, Card, RangeSlider,
          TextField, Select, Skeleton, SkeletonFeed, Notice }
    = window.GmaSHelperDesignSystem_45dd11;
</script>
```

`styles.css` is the only stylesheet to link — it `@import`s the token files and `components/components.css`. In a React/Vite project, `import './design-system/styles.css'` and use the `.jsx` sources directly (plain React, no extra deps).

## Styling idiom

CSS custom properties — never hardcode a hex, size, or shadow. Components style themselves via `gma-*` classes; your layout glue uses the tokens:

- **Color:** semantic aliases first — `var(--surface-page|card|sunken|inverse|urgent|error)`, `var(--text-strong|body|muted|urgent|error|link|on-primary|on-inverse)`, `var(--action-primary-bg)` (+ `-hover`/`-active`/`-fg`), `var(--border-default|strong|field|focus)`, `var(--status-fresh|stale|urgent|error)`, `var(--focus-ring)`. Raw ramps (`--green-700`, `--gray-50…900`, `--amber-*`, `--red-*`) exist so the aliases resolve.
- **Type:** `var(--font-sans)` (Public Sans) for text, `var(--font-mono)` (IBM Plex Mono) for **every** money/distance/time figure — add `data-figure` or class `gma-figure` for tabular slashed-zero numerals. Sizes `var(--text-xs…5xl)`; weights `var(--weight-regular|medium|semibold|bold)`.
- **Space/shape:** 4px grid `var(--space-1…16)`; semantic `var(--gutter-page|gap-feed|pad-card|pad-control)`; corners `var(--radius-lg)` = **8px, the house corner** (token files are the source of truth — `--radius-md` is 6px); pills `var(--radius-full)`; targets `var(--tap-min)` / `var(--control-height)` = 44px.
- **Elevation:** cards are a 1px `var(--border-default)` hairline on white, **flat — no shadows on cards**. `var(--shadow-sm|md|lg)` only on genuinely floating UI (settings sheet, overlays).

Where the truth lives: `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/elevation.css` (all reachable from `styles.css`), component states in `components/components.css`, per-component contracts in `components/<group>/<Name>.d.ts` + usage in `<Name>.prompt.md`, full app composition in `ui_kits/app/`.

## Components (props from the real `.d.ts` — the authoritative contracts)

| Component | Props (beyond native HTML attrs) |
|---|---|
| **Button** | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'` · `size: 'md'(44px)\|'sm'(36px)` · `block` · `iconLeft` / `iconRight` · `href` (renders an anchor) |
| **IconButton** | `size: 'md'\|'sm'` · `outlined` · **`aria-label` required** |
| **Badge** | `variant: 'neutral'\|'fresh'\|'stale'\|'urgent'\|'discount'` · `dot` (auto-on for fresh/stale) |
| **Card** | `padding: 'default'(12px)\|'flush'\|'roomy'(20px)` · `interactive` · `urgent` (amber tint) · `as` (tag) |
| **RangeSlider** | `label` · `value: number` · `onChange: (n) => void` · `min`/`max`/`step` · `valueText` (e.g. "25 miles") · `showTicks` · `minLabel`/`maxLabel`. 22px thumb inside a 44px hit target. |
| **TextField** | `label` · `hint` · `error` (sets aria-invalid + red border) · `mono` |
| **Select** | `label` · `options: {value,label}[]` (or `<option>` children) · `placeholder` |
| **Skeleton** | `width` · `height` · `radius` (numbers = px) |
| **SkeletonFeed** | `rows` (default 3) — the deal feed's exact loading state |
| **Notice** | `variant: 'default'\|'muted'\|'error'\|'urgent'` · `icon` |

One `primary` Button per surface. Amber (`urgent`) strictly for expiring/time-limited content. `danger` for destructive only (none exist in v1).

## Idiomatic build snippet

```jsx
<Card as="article" urgent style={{ display: 'grid', gap: 'var(--space-1)' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <h2 style={{ font: 'var(--font-heading)' }}>Remedy Tulalip</h2>
    <span data-figure style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>2.5 mi</span>
  </div>
  <Badge variant="urgent">Happy hour</Badge>
  <p>30% off — <span data-figure style={{ fontFamily: 'var(--font-mono)' }}>$1.46</span> to get there</p>
</Card>
```

## Voice (exact copy is contractual — see EXPERIENCE.md → Voice and Tone)

Plain, literal, sentence case, second person, present tense. No emoji, no exclamation marks, no cannabis slang, never title case. Numbers are facts: `9.8 mi · $1.46 · 24 min left` in tabular mono. Errors stay calm: "Couldn't load deals. Please try again later." Age gate: "You must be 21 or older to view this content." / "I am 21 or older".

## Binding behavior rules (spine rulings, 2026-06-12)

- **No net-savings figure, ever** — discount and gas cost side by side: "30% off — $1.46 to get there" (ADR-009).
- **No Save button** — a completed Year → Make → Model selection applies immediately and the sheet collapses (FR-8).
- **Vehicle cascade Selects stack one per row** (320px reflow); the sheet is a bottom sheet over a flat `rgba(17,24,39,0.45)` scrim.
- **Scraped deal descriptions display under constraint**: plain text only, ~80-char cap, blocklist-suppressed when matching therapeutic-claim / youth-appeal terms.
- **Standing disclaimer footer** under the feed footnotes (exact copy in readme.md / EXPERIENCE.md).
- **Stale sources are omitted, not badged**; one muted "N sources unavailable" line, count from the full array (ADR-026).
- **Contrast pins:** field borders use `--border-field` (gray-500); the urgent badge pair amber-700/amber-100 passes AA by 0.01 — never lighten/darken it; muted text never sits on `--surface-sunken`/gray-100.

## What NOT to do

❌ Hardcode hex values · ❌ amber outside expiring content · ❌ shadows on cards · ❌ emoji in UI · ❌ title case · ❌ a second action color · ❌ net-savings numbers · ❌ fonts beyond Public Sans + IBM Plex Mono · ❌ text below 14px except UPPERCASE overline badges · ❌ decorative gradients/washes · ❌ `--text-muted` on sunken surfaces · ❌ trusting this file over the spines.

## See also

- `readme.md` — full narrative design documentation
- `ui_kits/app/index.html` — clickable app demo (age gate → feed → settings sheet)
- `guidelines/` — visual specimen cards
- `Happy/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/` — the binding spines + decision log
- Source repo: https://github.com/erikchvac-byte/Gma · `Happy/ADR.md` — 28 architecture decisions
