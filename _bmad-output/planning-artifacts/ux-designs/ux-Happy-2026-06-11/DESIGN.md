---
name: gmas list
description: Visual identity for gmas list (Happy) — a precise, light, finance/transit-energy utility that ranks legal cannabis deals by TRUE cost (sticker + gas to get there). "Daylight" direction (ADR-042 — warm-paper canvas / emerald brand / amber discount / crimson urgency; supersedes the Arcade, Synthwave & Tidewater palettes). Distilled 2026-06-18 from imports/GMAS_LIST_BRIEF.md (canonical) and .decision-log.md; re-toned to Daylight 2026-06-21. AA contrast VERIFIED for the Daylight values (audit 2026-06-21 — see Colors). Token values lifted verbatim from the brief's §2–§6; derivations are tagged [DERIVED] in prose.
status: final
updated: 2026-06-21
colors:
  # ---- "Daylight" palette (ADR-042). Light is default & primary. ----
  # AA contrast VERIFIED 2026-06-21 (per-pair ratio table in Colors).
  bg: '#f7f6f3'             # app background (warm paper)
  surface: '#ffffff'        # cards, rows
  surface-raised: '#f1efe9' # chips, inputs, tiles, deal sub-blocks
  border: '#e4e1d9'         # hairlines, card borders
  border-strong: '#d6d2c8'  # [DERIVED] crisper field edge / hover border (brief §6)
  # ---- Text (ink on paper) ----
  text: '#1a1a1f'           # primary
  text-muted: '#5c5a55'     # secondary / labels
  text-faint: '#8a8780'     # placeholder / incidental only — NON-ESSENTIAL (see Contrast)
  # ---- Accent (single brand/interactive color) ----
  accent: '#18794e'         # deep emerald — primary accent
  accent-hover: '#15663f'   # hover/active state of accent
  accent-soft: 'rgba(24,121,78,0.10)' # low-emphasis emerald fill (distance pill / selected row / fresh)
  accent-on-light: '#15663f'# deeper emerald where extra contrast is wanted
  # ---- Discount (token, ADR-041 — discount-semantic ONLY; AA-tuned ADR-042) ----
  discount: '#ad4f08'       # deep amber — discount figures + discount badge + card-top motif line
  # ---- Ink (dark surfaces / print) ----
  ink: '#1a1a1f'
  # ---- Semantic (meaning only, never decoration) ----
  success: '#18794e'        # savings / best total (reads as brand emerald)
  warning: '#c92a44'        # crimson — happy-hour urgency
  danger: '#c0233d'         # worst total / error
  # ---- Focus ----
  focus-ring: '#18794e'     # [DERIVED] = accent; visible emerald ring on light
  scrim: 'rgba(26,26,31,0.45)' # [DERIVED] flat sheet scrim, no blur
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
    note: 'lowercase "gmas list" + emerald set-dot. Never capitalize, never add a pictorial icon.'
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
  dot: 2px        # the emerald set-dot
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
    foreground: '#ffffff'            # white label on emerald (AA 5.41:1; ADR-042 supersedes Arcade "never white")
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
    foreground: '#ffffff'
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

The posture is **sober, calm, trustworthy, light, no-gimmick**. Restraint over decoration: clean data rows on warm paper, mono numerals, one confident accent. There are **no** gradients-as-decoration, no emoji, and no cannabis-leaf / bud / smoke / neon-green / "420" iconography — the last is also a legal constraint (`EXPERIENCE.md → regulated content`; WA WAC 314-55-155). The emerald-dot brand is intentionally abstract; keep it that way.

The signature is the **numbers**. Prices, distances, drive costs, and "true cost" totals carry the UI — any figure a user compares is set in tabular **Space Mono** so the values align and read as measured fact. Around them, **Space Grotesk** (geometric, slightly technical) sets the wordmark and headings; **Plus Jakarta Sans** (humanist, neutral) carries everything readable.

The system is **light by default and primary** (`--bg #f7f6f3`, warm paper). Dark surfaces are rare; the emerald accent already carries enough contrast on light that no swap is needed (use `{colors.accent-on-light}` only where extra weight is wanted).

**Wordmark (locked):** lowercase `gmas list` in {typography.wordmark} (Space Grotesk Medium, ls −0.01em, closed up tight), followed by an **emerald square "set-dot"** — the brand signature. The dot ≈ 0.21× cap height, `{rounded.dot}` (2px), sits near the baseline just right of the final "t". On paper: text `{colors.text}`, dot `{colors.accent}`. On a dark/accent surface: text `#ffffff`, dot `#ffffff` (or the emerald held if contrast allows). Monochrome: dot matches text. **Never** capitalize, never add a pictorial icon, never a cannabis leaf. Minimum width 96px; clear space all sides = cap height; below 96px use the app-icon mark. The in-product brand text is **always** `gmas list` lowercase (the spoken "grandma's" is never leaned on, never written out).

**App icon / favicon — "g + dot":** lowercase `g` in Space Grotesk Bold + the emerald set-dot, centered in a rounded-square tile (corner ≈ 24% of size). Standard: `{colors.text}` "g" + `{colors.accent}` dot on `{colors.bg}` paper tile. Alt: `#ffffff` "g" + `#ffffff` dot on `{colors.accent}` emerald tile. Ship 16/32/56/96 + 180 (apple-touch) + 512.

## Colors

"Daylight" (ADR-042) — a warm-paper base with a calm **three-color** system. Tokens are CSS custom properties; light is the default and primary mode. Color is used sparingly and always means something. Supersedes the Arcade/Synthwave/Tidewater palettes.

- **Surfaces** layer by lightness: `{colors.bg}` `#f7f6f3` app background (warm paper), `{colors.surface}` `#ffffff` cards and rows, `{colors.surface-raised}` `#f1efe9` chips/inputs/tiles/deal sub-blocks, `{colors.border}` subtle hairlines/dividers, `{colors.border-strong}` the crisper field edge. Depth comes from these steps, a quiet hairline, and a soft shadow on cards (see Elevation & Depth).
- **Text** runs three steps: `{colors.text}` `#1a1a1f` primary (ink), `{colors.text-muted}` `#5c5a55` secondary/labels, `{colors.text-faint}` `#8a8780` placeholder/incidental only.
- **Accent (emerald)** `{colors.accent}` `#18794e` is the single **brand/interactive** color. Use it sparingly: primary buttons, the active chip, the focus ring, links, the logo set-dot, the distance pill, the gas line, the fresh status. Hover/active deepens to `{colors.accent-hover}` `#15663f`. `{colors.accent-soft}` is a low-emphasis emerald fill (distance pill / selected row / fresh badge). The same emerald reads AA both as text on white **and** as a fill carrying a **white** label. **Text on an emerald accent fill is white `#ffffff`** (ADR-042; this supersedes Arcade's "never white", which was specific to a light neon accent).
- **Discount (amber)** `{colors.discount}` `#ad4f08` is **discount-semantic ONLY** — the per-deal discount figure and the discount badge — plus the one sanctioned decorative use, the card-top motif line. Value is tuned so the 22px figures clear AA on `{colors.surface-raised}` where they sit. Never a general accent. Magnitude stays a single hue with a font-weight step only, never a second color (ADR-037/040/041 invariant).
- **Semantic** colors mean state, never decoration: `{colors.warning}` `#c92a44` (crimson) = happy-hour **urgency**, `{colors.danger}` `#c0233d` worst total / error, `{colors.success}` savings / best total (reads as the brand emerald).

> **Three signals, kept legible:** emerald = interactive, amber = discount, crimson = urgency. Do not introduce a fourth accent.

**Contrast — WCAG 2.2 AA VERIFIED (audit 2026-06-21).** Fresh sRGB-ratio audit of the Daylight values; every load-bearing pair meets AA (normal text ≥ 4.5:1, large text ≥ 3:1), most essential text clears AAA. Ratios:

| Foreground | Background | Ratio | AA |
|---|---|---|---|
| text `#1a1a1f` | paper `#f7f6f3` | 16.0 | ✅ AAA |
| text `#1a1a1f` | white card `#ffffff` | 17.3 | ✅ AAA |
| text `#1a1a1f` | surface-raised `#f1efe9` | 15.1 | ✅ AAA |
| text-muted `#5c5a55` | paper | 6.4 | ✅ |
| text-muted `#5c5a55` | white card | 6.9 | ✅ |
| text-muted `#5c5a55` | surface-raised | 6.0 | ✅ |
| emerald `#18794e` (link) | white card | 5.4 | ✅ |
| emerald `#18794e` (link) | paper | 5.0 | ✅ |
| emerald `#18794e` | accent-soft fill (fresh badge) | 4.7 | ✅ |
| white `#ffffff` | emerald fill `#18794e` | 5.4 | ✅ |
| white `#ffffff` | emerald-hover `#15663f` | 7.0 | ✅ AAA |
| discount amber `#ad4f08` | white card | 5.4 | ✅ |
| discount amber `#ad4f08` | surface-raised `#f1efe9` | 4.7 | ✅ |
| paper `#f7f6f3` (badge text) | amber fill `#ad4f08` | 5.0 | ✅ |
| crimson `#c92a44` | happy-soft fill | 4.6 | ✅ |
| crimson `#c92a44` | white card | 5.4 | ✅ |
| danger `#c0233d` | white card | 5.9 | ✅ |

**Sole sub-AA value — by design, non-essential:** `{colors.text-faint}` `#8a8780` measures ~3.3–3.6:1 and is **confined to incidental text** exempt under WCAG 1.4.3 — input placeholders only (the unused `.gma-badge--stale` variant is the sole other reference; the live stale-source indicator renders `Notice variant="muted"` at `{colors.text-muted}`, 6.4:1). text-faint must never carry essential readable content. Card/divider borders are decorative boundaries; the required focus *state* is carried by the emerald focus ring (a real color change, not reliant on border alone).

Avoid: gradients, tinted brand washes, a fourth accent, color-coding deal categories, semantic color used decoratively.

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

The system is **quiet on light** — depth comes from the surface ladder (`{colors.bg}` paper → `{colors.surface}` white → `{colors.surface-raised}`), a **1px `{colors.border}` hairline**, and a **soft shadow** that lifts the white card off the paper (light-mode shadows are low-alpha ink, `shadow-xs`→`shadow-lg`). Cards are a flat `{colors.surface}` fill with the hairline + a subtle shadow; the best card raises its border to **1.5px `{colors.accent}`** (emerald), not a heavier shadow. The deal card carries a decorative **card-top motif** — an emerald 2px hairline over an amber 2px hairline at the very top edge (CSS `::before`, no DOM change) — the one sanctioned non-discount use of amber.

The most elevated layer is the **bottom sheet** (settings/vehicle). It sits over a **flat scrim `{colors.scrim}`** — no glassmorphism, no backdrop blur, anywhere ([DERIVED] scrim value; brief mandates no blur). A soft `shadow-lg` lifts the sheet off the feed. No element ever carries both a heavy border and a heavy shadow.

**Focus is its own depth cue:** a 2px `{colors.focus-ring}` (emerald) outline at 2px offset — always visible, never removed without replacement. On warm paper and white this emerald ring reads clearly against every surface.

**Hover** = deepen/lift, never shift layout: accent elements deepen to `{colors.accent-hover}`; bordered elements darken their border toward `{colors.border-strong}` (`#d6d2c8`) and may gain a soft `shadow-sm`. Motion is functional only — quick fades/color transitions, no bounce, no loops on content; every duration collapses to 0ms under `prefers-reduced-motion`.

## Shapes

Corners step by role (brief §6): inputs and selects {rounded.input} (12px), buttons {rounded.button} (13px), **deal cards {rounded.card} (14px) — the house corner ({rounded.DEFAULT})**, bottom sheets and the gate card {rounded.sheet} (20px), and pills/chips/badges {rounded.full}. The app-icon tile is ~24% of its size (relative, not a fixed token). The emerald set-dot is {rounded.dot} (2px). Borders are 1px — `{colors.border}` for subtle dividers, `{colors.border-strong}` for card & field edges; the important/selected boundary is 1.5px `{colors.accent}`.

## Components

Visual specs below; behavior lives in `EXPERIENCE.md → Component Patterns`. Components reference the semantic tokens above, never raw hex.

- **Button** — `primary`: `{colors.accent}` emerald fill, **white `#ffffff` label** (AA 5.4:1), {rounded.button}, 52px CTA height, {typography.button} (weight 700), hover `{colors.accent-hover}`; one primary per surface. `secondary`: transparent, 1px `{colors.border}`, `{colors.text-muted}` label, 44px. Disabled = reduced opacity, no pointer events; focus shows the 2px emerald ring.
- **Deal card** — A Card (`{colors.surface}` white, 1px `{colors.border}` hairline + soft shadow, {rounded.card}) topped by the emerald-over-amber card-top motif. Holds: dispensary name, "Strain · ⅛ oz" line, the **big sticker price** in {typography.price-hero}, the **struck original price** in `{colors.text-faint}`, and a right-aligned **breakdown** — `+$X drive` in {typography.figure} `{colors.text-faint}` over **`$Y total`** in bold {typography.figure}. The total is colored by rank: `{colors.accent}` on the best, `{colors.text-muted}` mid, `{colors.danger}` when it is the worst total. *(The sticker+drive=total model and ranking behavior are governed by `EXPERIENCE.md` and are pending Erik's product-model ruling — the visual spec here is the brief's, not a behavioral commitment.)*
- **Best card** — The lowest true-cost total: `card-best` (1.5px `{colors.accent}` border) plus a **"Best true cost" badge** (`{colors.accent}` fill, **white** text, {rounded.full}).
- **TextField** — Stacked label ({typography.label}), input on `{colors.surface-raised}` with 1px `{colors.border}`, {rounded.input}, 44px, `{colors.text}` value. Focus swaps the border to `{colors.accent}` plus the ring. `mono` switches the value to {typography.figure} for numeric entry.
- **Select** — Same field metrics as TextField; CSS-drawn `{colors.text-muted}` chevron; disabled at reduced opacity. The Year → Make → Model cascade.
- **RangeSlider** — The distance filter: label left in {typography.label}, current value right in {typography.figure} ("25 miles"); a 6px `{colors.surface-raised}` track with an `{colors.accent}` fill to the thumb; 22px `{colors.accent}` thumb inside a 44px hit target; tick micro-labels in `{colors.text-muted}`. Keyboard focus draws the 2px emerald ring offset from the track.
- **Pill / location chip** — `{colors.surface-raised}` fill, 1px `{colors.border}`, `{colors.text-muted}` text, {rounded.full}. The header location pill ("Denver, CO" style) and any chips.
- **Badge** — Small {rounded.full} pill in {typography.figure}/uppercase-as-needed. `best` (`{colors.accent}` fill, **white** text). `discount` (`{colors.discount}` amber fill, `{colors.bg}` paper text, AA 5.0:1). Other states (neutral, caution) use `{colors.surface-raised}`/`{colors.text-muted}` and the semantic colors for meaning only.
- **Notice** — Inline message line in {typography.caption}: `default` (`{colors.surface-raised}` box, `{colors.text}` text), `muted` (bare `{colors.text-muted}` line — last-updated, stale-source, disclaimer footnotes), `error` (`{colors.danger}`). Optional leading line icon.
- **Sheet (vehicle / settings)** — Bottom sheet on `{colors.surface}`, {rounded.sheet} top corners, over the flat `{colors.scrim}`. Title row + close, explainer caption, stacked Selects (one per row), a fuel Notice showing resolved MPG, an action row. *(Full settings/vehicle-sheet spec is [DERIVED] beyond brief §5 — see EXPERIENCE.md reconciliation.)*
- **21+ Age gate** — Full-bleed `{colors.bg}`, centered card (`{colors.surface}`, 1px `{colors.border-strong}`, {rounded.sheet} 20px, max-width ~404px). Wordmark above the card; a "21" tile; headline **"Are you 21 or older?"**; one line of context; primary Button **"Yes — I'm 21+"** (52px, {rounded.button}, weight 700); secondary **"No, take me back"** (transparent, `{colors.border}`, `{colors.text-muted}`); a "Remember me on this device" checkbox; the mandated warnings as small print below the card. The decline path routes to a **returnable** out-state ("Come back at 21" → "Go back"), and "Remember me" (default on) controls persistence — ruled by Erik 2026-06-19, codified in **ADR-036** (builds on ADR-035's decline; supersedes ADR-021); behavior lives in `EXPERIENCE.md → Component Patterns`. *(Do NOT drive entry animation from inline `animation:` + `@keyframes` on a re-rendering root — it sticks at opacity 0; use a mount-triggered CSS transition or none.)*

Iconography is **line icons only** (2px stroke), sized 12–22px, recolored via currentColor — `clock` countdowns, `fuel`/`car` gas math, `settings` gear, `map-pin` location, `shield`/`check` age gate. Never a cannabis leaf, bud, smoke, or any product depiction (legal, WAC 314-55-155). Icons support data, never decorate.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Brand accent emerald `{colors.accent}`; discount amber `{colors.discount}` (discount-only); urgency crimson `{colors.warning}` | Introduce a fourth accent, use emerald for discount, or use amber as a general accent |
| Light, warm-paper surfaces stepped by lightness + a quiet hairline + soft shadow | Use neon green, gradients, glassmorphism, or backdrop blur |
| Every compared number in tabular Space Mono | Set figures in the sans, or let numbers wiggle as they tick |
| White `#ffffff` label on the emerald accent | Paper/`{colors.bg}` text on the emerald accent (fails contrast) |
| Cards = white `{colors.surface}` + 1px `{colors.border}` hairline + soft shadow; best = 1.5px emerald | Heavy/neon shadows, or both a heavy border and a heavy shadow on one element |
| Semantic color for meaning only (savings / caution / worst-cost) | Color-code categories or use semantic color as decoration |
| Lowercase `gmas list` wordmark + emerald set-dot | Capitalize the wordmark, or add a pictorial/leaf icon to it |
| Abstract emerald-dot brand; line icons that support data | Cannabis leaves, buds, smoke, "420", emoji, mascots/cartoons |
| ≥14px for all readable text | Shrink body or metadata below 14px to fit more in |
| Sentence case; plain literal copy | Title case, exclamation marks, urgency theater |
| Build from tokens — reference semantic names | Hardcode a hex or invent colors/fonts outside §2–§3 |
| Quick functional motion, honoring reduced-motion | Bouncy, looping, or decorative animation |

## Change Log

| Date | Change |
|------|--------|
| 2026-06-20 | **"Arcade" palette swap (ADR-041).** Migrated Colors from the prior Tidewater/Synthwave palettes to Arcade: near-black surfaces (`bg #050507`, `surface #121016`, `surface-raised #1c1922`, border `#2a2330`), text `#f5f2f7`/`#a8a0b2`/`#6e6676`, and a **three-color** accent system — `accent` pink `#ff3d8b` (brand/interactive), **new `discount` token amber `#ffc83d`** (discount-semantic only + the card-top motif line), `warning` red `#ff5470` (happy-hour urgency); `success` reads pink, `danger` `#ff3b5c`. Scattered "teal" color-name references throughout the prose updated to pink. **`status: final` → `draft` and the WCAG 2.2 AA audit VOIDED** — the prior audit validated the Tidewater teal palette; every Arcade load-bearing pair changed, so AA is UNVERIFIED until re-measured (re-audit logged in `deferred-work.md`). No layout/typography/spacing/component-structure changes. |
| 2026-06-21 | **"Daylight" light theme re-tone (ADR-042) + AA re-audit → `status: final`.** Full prose + frontmatter migration from Arcade (dark) to Daylight (light): warm-paper surfaces (`bg #f7f6f3`, `surface #ffffff`, `surface-raised #f1efe9`, border `#e4e1d9`), ink text (`#1a1a1f`/`#5c5a55`/`#8a8780`), and the three-color system re-hued for white — `accent` **emerald `#18794e`** (brand/interactive + fresh), `discount` **amber `#ad4f08`** (discount-only), `warning` **crimson `#c92a44`** (urgency); `success` reads emerald, `danger` `#c0233d`. Light is now default/primary; **`--text-on-primary` flips to white** (white-on-emerald AA 5.4:1 — supersedes Arcade's "never white"); elevation goes border-hairline + soft shadow (was border-led-on-dark); focus ring + set-dot are emerald. **WCAG 2.2 AA re-audit run (per-pair sRGB ratio table added):** all load-bearing pairs pass AA, most essential text AAA. One fix shipped — `discount` deepened `#b45309`→`#ad4f08` so the 22px figures clear AA (4.5:1) on `surface-raised` (was 4.37). `text-faint #8a8780` (~3.3:1) confined to placeholder/incidental only (WCAG 1.4.3 exempt; live stale indicator uses text-muted). No layout/typography/spacing/component-structure changes. |
