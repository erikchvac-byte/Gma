# Gma's Helper — Design System

A small, disciplined design system for **Gma's Helper**, a single-page web app
that answers exactly one question: **is this cannabis happy-hour deal near you
actually worth the drive, right now?**

Set a distance, and the page shows every active deal within road-driving range —
each paired with honest math: *what you'd save on the deal* vs *what you'd burn in
gas getting there*. No browsing, no menus, no discovery. Just "should I go?"

> Working title: **Gma's Helper** · internal project name: **Happy** · solo
> founder (Erik), Marysville WA. Status: R&D / implementation in progress.

This is **not** a stoner brand. The audience is budget-aware adults — the
returning buyer, the careful regular, the newcomer. The whole product is a
trustworthy utility, so the design language is plain, flat, and honest.

---

## Sources

This system was reverse-engineered from the product's codebase and planning
artifacts. The reader is encouraged to explore these further:

| Source | Where | Notes |
|---|---|---|
| **Codebase** (local) | `Happy/` | Vite + React + TS client, Express server, BMad planning docs. The real UI lives in `Happy/client/src/components/` (Tailwind classes). |
| **GitHub mirror** | https://github.com/erikchvac-byte/Gma | Same project as `Happy/`. Browse `client/src/components/`, `ADR.md`, and `_bmad-output/` for the fullest picture. |
| **ADR** | `Happy/ADR.md` | 26 architecture decisions — the source of truth for product behavior (age gate, gas math, sort order, stale handling). |
| **Product brief** | `Happy/_bmad-output/planning-artifacts/briefs/.../brief.md` | Vision, audience, voice, scope. |

> **Important:** the original codebase had *no* design system — it used default
> Tailwind utility classes (gray-50 page, white cards, green-700 buttons,
> gray-200 borders). This system **codifies and elevates** that into named
> tokens, components, and a brand. Where the code was silent (typography, brand
> voice, iconography), choices here are deliberate and flagged below.

---

## Content fundamentals — how Gma's Helper talks

The voice is the product's promise made audible: **say it straight.** The page's
job is to be trusted, so the copy never oversells, never jokes, never uses
cannabis-culture slang, and never uses emoji.

- **Plain and literal.** "You must be 21 or older to view this content." /
  "No active deals right now." / "2 sources unavailable." No cleverness.
- **Second person, present tense.** It speaks to *you*, about *now*: "Is it worth
  the drive?" / "$1.46 to get there."
- **Honest over flattering.** It shows the gas cost *next to* the discount rather
  than collapsing them into an invented "you save $X" — because it can't know
  your basket size (ADR-009). It under-promises: "Within 25 miles", not "Deals
  near you!".
- **Sentence case** everywhere except small **UPPERCASE** overline labels
  (badges, micro-labels). Never title case for UI copy.
- **Numbers are facts.** Money, distance, and time are always shown in tabular
  monospace (see Visual Foundations) so they read as measured, not marketed.
- **Errors stay calm and useful.** "Couldn't load deals. Please try again later."
  — never the raw error, never "Oops!", never an emoji.
- **Quiet by default.** Status that isn't actionable (stale sources, last-updated)
  is a single muted line — it informs without nagging (ADR-026).

| Instead of… | Say |
|---|---|
| 🔥 INSANE deals near you!! 🌿 | Is it worth the drive? |
| You could save up to 30%! | 30% off — $1.46 to get there |
| Verify your age to unlock | You must be 21 or older to view this content. |
| Oops! Something went wrong 😅 | Couldn't load deals. Please try again later. |

---

## Visual foundations

**Overall vibe.** A clean, flat, utilitarian tool. Think a trustworthy
public-utility or finance app, not a dispensary. Information-dense but calm.
Mobile-first — the primary surface is a phone in a driveway, deciding whether to
turn the key.

**Color.** One confident green (`--green-700` / #15803d) is the *only* action
color — the "go" of the age gate and Save buttons. Everything structural is a
neutral gray ramp (page `gray-50`, cards `white`, hairlines `gray-200`, body
`gray-700`, muted `gray-500`, headings `gray-900`). **Amber** (`--amber-600`) is
reserved strictly for **urgency** — happy-hour countdowns and time-sensitive
deals — so it always means "this expires." Red is errors only. There are no
purple/blue gradients, no tinted brand washes; color is used sparingly and always
means something.

**Imagery.** Essentially none. This is a text-and-numbers product; it does not use
photography, illustration, or decorative backgrounds. Surfaces are solid flat
fills (`white` on `gray-50`). The only "imagery" is the iconography (below). When
imagery is ever needed (e.g. marketing), keep it documentary and warm-neutral —
never cannabis-leaf clip-art.

**Typography.** **Public Sans** (civic, plain, highly legible — fits a product
built on government data sources like EIA and fueleconomy.gov) for everything
readable; **IBM Plex Mono** for figures. The type scale is mobile-first; nothing
on a primary surface is below 14px. Headings are semibold/bold `gray-900`; body
is regular `gray-700`.

**Figures are the brand's signature.** Every dollar, mile, and minute is set in
tabular, slashed-zero IBM Plex Mono. The product *is* a comparison, so the numbers
must align and read as fact: `9.8 mi · $1.46 · 24 min left`.

**Spacing.** A 4px base grid (Tailwind heritage). The feed is tight and scannable
— `12px` card padding, `12px` between cards, `16px` page gutter. The reading
column is capped at ~640px; it never sprawls.

**Corners.** `rounded-lg` (**8px**) is the house corner — buttons, cards, inputs
all share it. Pills (badges, slider thumb) are fully round. Bottom sheets use a
larger `16px` top radius.

**Elevation — flat and honest.** Cards are defined by a **1px `gray-200` hairline
on white**, *not* by drop shadows. The feed is shadowless. Shadows appear only on
genuinely floating UI: a quiet `shadow-sm` lift on interactive-card hover, and
`shadow-md/lg` on the settings sheet and overlays. No card has both a heavy border
*and* a shadow.

**Borders.** Hairline `1px gray-200` is default; `gray-300` for stronger control
outlines (inputs); `2px green-700` for focus and emphasis.

**Motion.** Functional, never decorative or bouncy. Quick fades and color
transitions (120–240ms, standard ease). The slider thumb scales 1.08 on hover; the
loading feed uses a soft opacity pulse. No infinite loops on content. Everything
honors `prefers-reduced-motion`.

**States.**
- *Hover* — buttons darken one step (green-700 → green-800); ghost/secondary pick
  up a `gray-50/100` fill; interactive cards darken their border + gain
  `shadow-sm`.
- *Active/press* — buttons darken a second step (→ green-900). No shrink-on-press.
- *Focus* — always visible: a `2px green-700` outline with a 2px offset (or a
  white-gap ring on filled controls). Keyboard accessibility is non-negotiable
  (ADR-021).
- *Disabled* — 50% opacity, no pointer events.

**Transparency / blur.** Used once: the settings-sheet scrim is a flat
`rgba(17,24,39,0.45)` — no glassmorphism, no backdrop blur.

**Accessibility.** Built in, not bolted on: 44px minimum hit targets, WCAG-AA
contrast on the green, dialog semantics + focus management on the age gate, and
`role="status"`/`role="alert"` on live regions.

---

## Iconography

Icons are **Lucide** (https://lucide.dev) — a clean, open-source line set with a
**2px stroke and rounded caps/joins** that matches the plain, honest tone. The
original codebase shipped no icon system (only leftover Vite template SVGs), so
Lucide is a deliberate, flagged substitution chosen for its neutral, utilitarian
feel.

- **Self-hosted.** The exact set used across this system is vendored as individual
  SVGs in `assets/icons/` (Lucide v0.460.0, ISC license) — no CDN dependency.
- **Helper.** `assets/icons.js` exposes them three ways: `window.GMA_ICONS` (name
  → inner SVG), `gmaIcon(name, size, strokeWidth)` → SVG string for plain HTML,
  and a React `<Icon name size strokeWidth />` component. All recolor via
  `currentColor`.
- **Usage.** Icons are sized 12–22px and inherit text color. They support, never
  decorate: a `clock` for countdowns, `navigation` for the brand mark and
  distance, `fuel`/`car` for the gas math, `settings` for the vehicle sheet,
  `shield-check` for the age gate, `triangle-alert`/`info` for notices.
- **No emoji, ever.** Unicode glyphs are not used as UI icons. The `✓`/`✕` in the
  voice card are documentation only.

Set: `navigation, map-pin, fuel, clock, percent, badge-percent, car, settings,
sliders-horizontal, search, shield-check, check, x, chevron-down/right/left,
arrow-right, info, circle-alert, triangle-alert`.

---

## What's in here (manifest)

**Foundations**
- `styles.css` — the single entry point consumers link. Import manifest only.
- `tokens/colors.css` · `typography.css` · `spacing.css` · `elevation.css` ·
  `fonts.css` · `base.css` — CSS custom properties + base element styling.
- `assets/fonts/` — self-hosted Public Sans + IBM Plex Mono (woff2, latin).
- `assets/icons/` + `assets/icons.js` — self-hosted Lucide set + helpers.

**Components** (`components/`, namespace `window.GmaSHelperDesignSystem_45dd11`)
- `core/` — **Button**, **IconButton**, **Badge**, **Card**
- `forms/` — **RangeSlider** (the distance filter), **TextField**, **Select**
- `feedback/` — **Skeleton** / **SkeletonFeed**, **Notice**
- `components/components.css` — class-based styling for all of the above.

**UI kit** (`ui_kits/app/`)
- A faithful, clickable recreation of the Gma's Helper app: age gate → deal feed
  → distance filter → vehicle settings sheet. `index.html` is the interactive
  entry; `feed.jsx`, `settings.jsx`, `data.js` are the surfaces and sample data.

**Specimen cards** (`guidelines/`) — the Design System tab gallery: brand
wordmark, voice, iconography; color, type, spacing, and elevation foundations.

**Skill** — `SKILL.md` makes this usable as a downloadable Agent Skill.

---

## Using it

Link the one stylesheet and read components off the global namespace:

```html
<link rel="stylesheet" href="styles.css" />
<script src="_ds_bundle.js"></script>
<script>
  const { Button, Card, Badge, RangeSlider } = window.GmaSHelperDesignSystem_45dd11;
</script>
```

Build everything from the tokens — never hardcode a hex. The green is the only
action color; amber means "expiring"; numbers are mono; cards are hairline, not
shadow. Say it straight.
