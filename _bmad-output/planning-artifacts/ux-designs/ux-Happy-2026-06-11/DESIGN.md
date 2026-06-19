---
name: gmas list
description: Visual identity for gmas list (Happy) — a precise, dark, finance/transit-energy utility that ranks legal cannabis deals by TRUE cost (sticker + gas to get there). "Tidewater" direction. Distilled 2026-06-18 from imports/GMAS_LIST_BRIEF.md (canonical) and .decision-log.md. Supersedes the Epic-6 light/green identity. Token values lifted verbatim from the brief's §2–§6; derivations are tagged [DERIVED] in prose.
status: final
updated: 2026-06-19
colors:
  # ---- Surfaces (dark is default & primary) ----
  bg: '#0E1417'              # app background
  surface: '#161F23'        # cards, rows
  surface-raised: '#1F2A30' # chips, inputs, tiles
  border: '#2C3A41'         # hairlines, card borders
  border-strong: '#3C4D55'  # [DERIVED] brightened hover border (brief §6)
  # ---- Text ----
  text: '#E8EFF2'           # primary
  text-muted: '#9DB0B8'     # secondary / labels
  text-faint: '#5E6E76'     # metadata, struck prices, captions
  # ---- Accent (single locked brand color) ----
  accent: '#4FD1C5'         # teal — primary accent ON DARK
  accent-hover: '#6FE0D6'   # hover/active state of accent
  accent-soft: '#14302E'    # low-emphasis teal fill (selected row bg)
  accent-on-light: '#18A294'# deeper teal for use on LIGHT backgrounds
  # ---- Ink (light surfaces / print) ----
  ink: '#14212A'
  # ---- Semantic (meaning only, never decoration) ----
  success: '#5BD6A0'        # savings / best total
  warning: '#E8C36A'        # caution
  danger: '#E87E6E'         # worst total / error
  # ---- Focus ----
  focus-ring: '#4FD1C5'     # [DERIVED] = accent; visible ring on dark
  scrim: 'rgba(6,10,12,0.62)' # [DERIVED] flat sheet scrim, no blur
typography:
  display:
    fontFamily: 'Space Grotesk'
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: '-0.02em'
  heading:
    fontFamily: 'Space Grotesk'
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: '-0.02em'
  wordmark:
    fontFamily: 'Space Grotesk'
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: '-0.01em'
    note: 'lowercase "gmas list" + teal set-dot. Never capitalize, never add a pictorial icon.'
  body:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.35'
  button:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 16px
    fontWeight: '700'
    lineHeight: '1'
  caption:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.35'
  price-hero:
    fontFamily: 'Space Grotesk'
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.1'
    note: 'The big sticker price only. Space Mono not required here (brief §5b); the breakdown IS Space Mono.'
  figure:
    fontFamily: 'Space Mono'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.35'
    note: 'EVERY compared number — price breakdown, drive cost, true-cost total, distance, miles, countdowns. Always tabular. This is a signature, not optional (brief §3).'
rounded:
  dot: 2px        # the teal set-dot
  input: 12px     # inputs, selects (brief §6: 12–13)
  button: 13px    # buttons (brief §5a: radius 13)
  card: 14px      # deal cards (brief §5b)
  sheet: 20px     # bottom sheets, gate card (brief §5a/§6)
  full: 9999px    # pills
  DEFAULT: 14px   # house corner = card radius
spacing:
  '0': 0px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 28px
  '7': 40px
  gutter-page: 16px
  gap-feed: 12px
  pad-card: 16px         # [DERIVED] roomier than feed gap; brief implies calm density
  tap-min: 44px
  control-height: 44px
  control-height-cta: 52px  # primary CTA (brief §5a)
  content-max: 480px        # [DERIVED] phone-first reading column; gate card maxes ~404px
components:
  button-primary:
    background: '{colors.accent}'
    background-hover: '{colors.accent-hover}'
    foreground: '{colors.bg}'        # ALWAYS bg, never white (brief §2/§8)
    radius: '{rounded.button}'
    min-height: '{spacing.control-height-cta}'
    typography: '{typography.button}'
  button-secondary:
    background: 'transparent'
    border: '1px solid {colors.border}'
    foreground: '{colors.text-muted}'
    radius: '{rounded.button}'
    min-height: '{spacing.control-height}'
    typography: '{typography.button}'
  card:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.card}'
    padding: '{spacing.pad-card}'
    shadow: 'none'
  card-best:
    background: '{colors.surface}'
    border: '1.5px solid {colors.accent}'
    radius: '{rounded.card}'
    note: 'lowest true-cost total; carries the "Best true cost" badge'
  badge-best:
    background: '{colors.accent}'
    foreground: '{colors.bg}'
    radius: '{rounded.full}'
    typography: '{typography.figure}'
  text-field:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border}'
    border-focus: '{colors.accent}'
    foreground: '{colors.text}'
    radius: '{rounded.input}'
    min-height: '{spacing.control-height}'
  select:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border}'
    border-focus: '{colors.accent}'
    foreground: '{colors.text}'
    radius: '{rounded.input}'
    min-height: '{spacing.control-height}'
    chevron-color: '{colors.text-muted}'
  range-slider:
    track-height: 6px
    track-color: '{colors.surface-raised}'
    fill-color: '{colors.accent}'
    thumb-size: 22px
    thumb-hit-target: 44px
    thumb-color: '{colors.accent}'
    value-typography: '{typography.figure}'
  pill:
    background: '{colors.surface-raised}'
    foreground: '{colors.text-muted}'
    border: '1px solid {colors.border}'
    radius: '{rounded.full}'
    note: 'location pill, chips'
  sheet:
    background: '{colors.surface}'
    radius-top: '{rounded.sheet}'
    scrim: '{colors.scrim}'
    max-width: 480px
  focus-ring:
    color: '{colors.focus-ring}'
    width: 2px
    offset: 2px
---

## Brand & Style

gmas list is a **precise utility tool** — finance/transit-app energy, not a dispensary. The product sells one insight: the cheapest sticker price is often **not** the cheapest way to actually obtain the product once the drive is included. Everything in the design serves that single honest comparison.

The posture is **sober, calm, trustworthy, dark, no-gimmick**. Restraint over decoration: clean data rows, mono numerals, one confident accent. There are **no** gradients-as-decoration, no emoji, and no cannabis-leaf / bud / smoke / neon-green / "420" iconography — the last is also a legal constraint (`EXPERIENCE.md → regulated content`; WA WAC 314-55-155). The teal-dot brand is intentionally abstract; keep it that way.

The signature is the **numbers**. Prices, distances, drive costs, and "true cost" totals carry the UI — any figure a user compares is set in tabular **Space Mono** so the values align and read as measured fact. Around them, **Space Grotesk** (geometric, slightly technical) sets the wordmark and headings; **Plus Jakarta Sans** (humanist, neutral) carries everything readable.

The system is **dark by default and primary** (`--bg #0E1417`). Light surfaces are rare; when they occur the accent swaps to `{colors.accent-on-light}` so the teal stays legible.

**Wordmark (locked):** lowercase `gmas list` in {typography.wordmark} (Space Grotesk Medium, ls −0.01em, closed up tight), followed by a **teal square "set-dot"** — the brand signature. The dot ≈ 0.21× cap height, `{rounded.dot}` (2px), sits near the baseline just right of the final "t". On dark: text `{colors.text}`, dot `{colors.accent}`. On light: text `{colors.ink}`, dot `{colors.accent-on-light}`. Monochrome: dot matches text. **Never** capitalize, never add a pictorial icon, never a cannabis leaf. Minimum width 96px; clear space all sides = cap height; below 96px use the app-icon mark. The in-product brand text is **always** `gmas list` lowercase (the spoken "grandma's" is never leaned on, never written out).

**App icon / favicon — "g + dot":** lowercase `g` in Space Grotesk Bold + the teal set-dot, centered in a rounded-square tile (corner ≈ 24% of size). Standard: `{colors.text}` "g" + `{colors.accent}` dot on `{colors.bg}` tile. Alt: `{colors.bg}` "g" + `{colors.bg}` dot on `{colors.accent}` tile. Ship 16/32/56/96 + 180 (apple-touch) + 512.

## Colors

"Tidewater" — a dark base with a single teal accent. Tokens are CSS custom properties; dark is the default and primary mode. Color is used sparingly and always means something.

- **Surfaces** layer by lightness: `{colors.bg}` app background, `{colors.surface}` cards and rows, `{colors.surface-raised}` chips/inputs/tiles, `{colors.border}` hairlines and card borders. Depth comes from these steps and from borders — not from shadow (see Elevation & Depth).
- **Text** runs three steps: `{colors.text}` primary, `{colors.text-muted}` secondary/labels, `{colors.text-faint}` metadata, struck prices, captions.
- **Accent** `{colors.accent}` `#4FD1C5` is the **locked brand color** — the single teal. Use it sparingly: the best-deal highlight, primary buttons, the logo dot, key totals. Hover/active brightens to `{colors.accent-hover}`. `{colors.accent-soft}` is a low-emphasis teal fill for a selected-row background. On the rare light surface, swap to `{colors.accent-on-light}` `#18A294`. **Text on an accent fill is always `{colors.bg}` `#0E1417`, never white** (brief §2/§8).
- **Semantic** colors mean state, never decoration: `{colors.success}` savings / best total, `{colors.warning}` caution, `{colors.danger}` worst total / error.

The true-cost total is the one place accent and semantic color carry ranking: the winning total reads `{colors.accent}` (or `{colors.success}`), mid totals `{colors.text-muted}`, and the worst total `{colors.danger}` — color stating fact, not urging.

**Contrast — VERIFIED against WCAG 2.2 AA (2026-06-19).** Audit of the load-bearing dark pairs (computed sRGB ratios):

| Pair | Ratio | Verdict |
|---|---|---|
| `{colors.text}` on `{colors.surface}` / `{colors.bg}` | 14.4 / 16.0 | AA ✓ (primary text) |
| `{colors.text-muted}` on `{colors.surface}` / `{colors.surface-raised}` / `{colors.bg}` | 7.4 / 6.5 / 8.3 | AA ✓ (labels, gate context, **legal small print**, stale-source line) |
| `{colors.bg}` on `{colors.accent}` / `{colors.accent-hover}` | 9.95 / 11.8 | AA ✓ (the action pair — button label) |
| `{colors.accent}` on `{colors.surface}` / `{colors.bg}` / `{colors.accent-soft}` | 9.0 / 9.95 / 7.6 | AA ✓ (accent totals, focus ring, selected row) |
| `{colors.success}` / `{colors.warning}` / `{colors.danger}` on `{colors.surface}` | 9.2 / 9.9 / 6.1 | AA ✓ (semantic totals) |
| `{colors.text-faint}` on `{colors.surface}` / `{colors.bg}` | 3.16 / 3.51 | **Below 4.5:1** — permitted *only* in non-essential roles |
| `{colors.border}` / `{colors.border-strong}` vs adjacent surfaces | 1.4–2.1 | **Below 1.4.11's 3:1** — decorative boundary only |

**Resolutions.** `{colors.text-faint}` is confined to incidental/non-essential text (input placeholder, struck original price [a deferred feature], unrendered badge specimens) where it is never the sole indicator (WCAG 1.4.3 incidental). It must **never** carry essential readable content — the stale-source line correctly uses `{colors.text-muted}` (Notice `muted`), not faint. Card and resting field **borders** fall below 1.4.11's 3:1, but cards/dividers are not controls and the required focus *state* is carried by the teal focus ring (`{colors.accent}` on `{colors.bg}` = 9.95:1 ✓); the surface ladder + labels identify fields. Two visual-polish follow-ups (raise hairline to `{colors.border-strong}` for crisper card edges; bump `text-faint` toward AA if it is ever promoted to readable copy) are logged in `deferred-work.md`, not blockers.

Avoid: gradients, tinted brand washes, a second accent, neon green, color-coding deal categories, semantic color used decoratively.

## Typography

Three families, loaded from Google Fonts (`Space Grotesk` 400–700, `Plus Jakarta Sans` 400–700, `Space Mono` 400/700):

- **Space Grotesk** — display, wordmark, UI headings. Headings weight 700, letter-spacing ≈ −0.02em.
- **Plus Jakarta Sans** — body, labels, buttons. Weights 400–700.
- **Space Mono** — every number a user compares: price, miles, drive cost, true-cost total, any tabular figure. **This is a signature, not optional** (brief §3).

Roles: {typography.display} (page/section title), {typography.heading} (gate prompt, sheet titles), {typography.wordmark} (the locked logotype), {typography.body} (deal descriptions, running copy), {typography.label} / {typography.caption} (form labels, metadata, footnotes), {typography.button} (button labels), {typography.price-hero} (the big sticker price — Space Grotesk, the one figure exempt from mono), {typography.figure} (all compared numbers — Space Mono, tabular).

The readable floor carries over from the prior spine as an accessibility rule: **nothing readable sits below 14px on primary surfaces.** Sentence case everywhere; the wordmark is the only lowercase-locked element; never title case for UI copy.

## Layout & Spacing

Spacing scale (brief §6): **4 / 8 / 12 / 16 / 20 / 28 / 40 px** ({spacing.1}…{spacing.7}), with {spacing.gutter-page} (16px) page gutter, {spacing.gap-feed} (12px) between deal cards, and {spacing.pad-card} (16px) card padding. Tabular figures wherever numbers align — the rows read like a ledger, dense but calm.

The app is **phone-first, single column**; the reading column caps around {spacing.content-max} ([DERIVED] 480px) and the age-gate card maxes ~404px. On larger screens the column simply centers on the `{colors.bg}` page; the surrounding space is deliberately unspecced (a future consideration, not a layout today — and any future ad inventory needs a cannabis-compliant network per `EXPERIENCE.md`).

Hit targets are **≥ {spacing.tap-min}** (44px). Standard control height is 44px; the primary CTA is taller at {spacing.control-height-cta} (52px, brief §5a). Borders are 1px `{colors.border}`; selected/important is 1.5px `{colors.accent}`.

## Elevation & Depth

The system is **border-led, not shadow-led** — natural to a dark UI where drop shadows read weakly. Depth comes from the surface ladder (`{colors.bg}` → `{colors.surface}` → `{colors.surface-raised}`) and from borders. Cards are a flat `{colors.surface}` fill with a **1px `{colors.border}` hairline** and **no shadow**; the best card raises its border to **1.5px `{colors.accent}`**, not a shadow.

The only genuinely floating layer is the **bottom sheet** (settings/vehicle). It sits over a **flat scrim `{colors.scrim}`** — no glassmorphism, no backdrop blur, anywhere ([DERIVED] scrim value; brief mandates no blur). A soft `shadow-lg` on the sheet edge is permitted to lift it off the feed; nothing else in the app carries a shadow. No element ever has both a heavy border and a shadow.

**Focus is its own depth cue:** a 2px `{colors.focus-ring}` (teal) outline at 2px offset — always visible, never removed without replacement. On dark this teal ring reads clearly against every surface.

**Hover** = lighten, never shift layout: accent elements brighten to `{colors.accent-hover}`; bordered elements brighten their border toward `{colors.border-strong}` (~#3C4D55). Motion is functional only — quick fades/color transitions, no bounce, no loops on content; every duration collapses to 0ms under `prefers-reduced-motion`.

## Shapes

Corners step by role (brief §6): inputs and selects {rounded.input} (12px), buttons {rounded.button} (13px), **deal cards {rounded.card} (14px) — the house corner ({rounded.DEFAULT})**, bottom sheets and the gate card {rounded.sheet} (20px), and pills/chips/badges {rounded.full}. The app-icon tile is ~24% of its size (relative, not a fixed token). The teal set-dot is {rounded.dot} (2px). Borders are 1px `{colors.border}`; the important/selected boundary is 1.5px `{colors.accent}`.

## Components

Visual specs below; behavior lives in `EXPERIENCE.md → Component Patterns`. Components reference the semantic tokens above, never raw hex.

- **Button** — `primary`: `{colors.accent}` fill, `{colors.bg}` label (never white), {rounded.button}, 52px CTA height, {typography.button} (weight 700), hover `{colors.accent-hover}`; one primary per surface. `secondary`: transparent, 1px `{colors.border}`, `{colors.text-muted}` label, 44px. Disabled = reduced opacity, no pointer events; focus shows the 2px teal ring.
- **Deal card** — A Card (`{colors.surface}`, 1px `{colors.border}`, {rounded.card}, no shadow). Holds: dispensary name, "Strain · ⅛ oz" line, the **big sticker price** in {typography.price-hero}, the **struck original price** in `{colors.text-faint}`, and a right-aligned **breakdown** — `+$X drive` in {typography.figure} `{colors.text-faint}` over **`$Y total`** in bold {typography.figure}. The total is colored by rank: `{colors.accent}` on the best, `{colors.text-muted}` mid, `{colors.danger}` when it is the worst total. *(The sticker+drive=total model and ranking behavior are governed by `EXPERIENCE.md` and are pending Erik's product-model ruling — the visual spec here is the brief's, not a behavioral commitment.)*
- **Best card** — The lowest true-cost total: `card-best` (1.5px `{colors.accent}` border) plus a **"Best true cost" badge** (`{colors.accent}` fill, `{colors.bg}` text, {rounded.full}).
- **TextField** — Stacked label ({typography.label}), input on `{colors.surface-raised}` with 1px `{colors.border}`, {rounded.input}, 44px, `{colors.text}` value. Focus swaps the border to `{colors.accent}` plus the ring. `mono` switches the value to {typography.figure} for numeric entry.
- **Select** — Same field metrics as TextField; CSS-drawn `{colors.text-muted}` chevron; disabled at reduced opacity. The Year → Make → Model cascade.
- **RangeSlider** — The distance filter: label left in {typography.label}, current value right in {typography.figure} ("25 miles"); a 6px `{colors.surface-raised}` track with an `{colors.accent}` fill to the thumb; 22px `{colors.accent}` thumb inside a 44px hit target; tick micro-labels in `{colors.text-muted}`. Keyboard focus draws the 2px teal ring offset from the track.
- **Pill / location chip** — `{colors.surface-raised}` fill, 1px `{colors.border}`, `{colors.text-muted}` text, {rounded.full}. The header location pill ("Denver, CO" style) and any chips.
- **Badge** — Small {rounded.full} pill in {typography.figure}/uppercase-as-needed. `best` (`{colors.accent}` fill, `{colors.bg}` text). Other states (neutral, caution) use `{colors.surface-raised}`/`{colors.text-muted}` and the semantic colors for meaning only.
- **Notice** — Inline message line in {typography.caption}: `default` (`{colors.surface-raised}` box, `{colors.text}` text), `muted` (bare `{colors.text-muted}` line — last-updated, stale-source, disclaimer footnotes), `error` (`{colors.danger}`). Optional leading line icon.
- **Sheet (vehicle / settings)** — Bottom sheet on `{colors.surface}`, {rounded.sheet} top corners, over the flat `{colors.scrim}`. Title row + close, explainer caption, stacked Selects (one per row), a fuel Notice showing resolved MPG, an action row. *(Full settings/vehicle-sheet spec is [DERIVED] beyond brief §5 — see EXPERIENCE.md reconciliation.)*
- **21+ Age gate** — Full-bleed `{colors.bg}`, centered card (`{colors.surface}`, 1px `{colors.border}`, {rounded.sheet} 20px, max-width ~404px). Wordmark above the card; a "21" tile; headline **"Are you 21 or older?"**; one line of context; primary Button **"Yes — I'm 21+"** (52px, {rounded.button}, weight 700); secondary **"No, take me back"** (transparent, `{colors.border}`, `{colors.text-muted}`); a "Remember me on this device" checkbox; the mandated warnings as small print below the card. The decline path routes to a **returnable** out-state ("Come back at 21" → "Go back"), and "Remember me" (default on) controls persistence — ruled by Erik 2026-06-19, codified in **ADR-036** (builds on ADR-035's decline; supersedes ADR-021); behavior lives in `EXPERIENCE.md → Component Patterns`. *(Do NOT drive entry animation from inline `animation:` + `@keyframes` on a re-rendering root — it sticks at opacity 0; use a mount-triggered CSS transition or none.)*

Iconography is **line icons only** (2px stroke), sized 12–22px, recolored via currentColor — `clock` countdowns, `fuel`/`car` gas math, `settings` gear, `map-pin` location, `shield`/`check` age gate. Never a cannabis leaf, bud, smoke, or any product depiction (legal, WAC 314-55-155). Icons support data, never decorate.

## Do's and Don'ts

| Do | Don't |
|---|---|
| One accent: teal `{colors.accent}`, brightening on hover | Introduce a second accent, or use teal decoratively |
| Dark-first surfaces stepped by lightness + borders | Use neon green, gradients, glassmorphism, or backdrop blur |
| Every compared number in tabular Space Mono | Set figures in the sans, or let numbers wiggle as they tick |
| `{colors.bg}` text on the teal accent | White text on the teal accent (brief §8) |
| Cards = 1px `{colors.border}` hairline on `{colors.surface}`, flat; best = 1.5px accent | Drop shadows on cards (only the sheet floats) |
| Semantic color for meaning only (savings / caution / worst-cost) | Color-code categories or use semantic color as decoration |
| Lowercase `gmas list` wordmark + teal set-dot | Capitalize the wordmark, or add a pictorial/leaf icon to it |
| Abstract teal-dot brand; line icons that support data | Cannabis leaves, buds, smoke, "420", emoji, mascots/cartoons |
| ≥14px for all readable text | Shrink body or metadata below 14px to fit more in |
| Sentence case; plain literal copy | Title case, exclamation marks, urgency theater |
| Build from tokens — reference semantic names | Hardcode a hex or invent colors/fonts outside §2–§3 |
| Quick functional motion, honoring reduced-motion | Bouncy, looping, or decorative animation |
