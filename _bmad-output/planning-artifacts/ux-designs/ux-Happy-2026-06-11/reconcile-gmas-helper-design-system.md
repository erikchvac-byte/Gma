# Reconciliation — imports/gmas-helper-design-system → DESIGN.md / EXPERIENCE.md

Run: ux-Happy-2026-06-11 · Spines win on conflict (.decision-log.md). Import paths below are relative to `imports/gmas-helper-design-system/`.

## 1. Captured

What the import contributed that the spines now carry:

- **Tokens** — full color ramps + semantic aliases (`tokens/colors.css`), 4px spacing grid + radius scale + hit targets + 640px column (`tokens/spacing.css`), shadow/ring/motion tokens incl. reduced-motion collapse (`tokens/elevation.css`), two-family type scale with mono-figure rule (`tokens/typography.css`, `tokens/fonts.css`) — lifted verbatim into DESIGN.md frontmatter.
- **Components** — all ten primitives (Button, IconButton, Badge, Card, RangeSlider, TextField, Select, Skeleton/SkeletonFeed, Notice) with variants, states, and metrics from `components/components.css` + `.d.ts` contracts → DESIGN.md Components + EXPERIENCE.md Component Patterns.
- **Surfaces** — age gate, sticky header, deal card anatomy, settings sheet composition, skeleton/empty/error/footnote treatments from `ui_kits/app/` → DESIGN.md composed surfaces + EXPERIENCE.md states/flows. Flat scrim value `rgba(17,24,39,0.45)` adopted as-is.
- **Voice** — "say it straight" rules, exact microcopy (age gate, errors, stale line, Discount Display, countdown), sentence-case/no-emoji bans from `readme.md` + `guidelines/brand-voice.card.html` → EXPERIENCE.md Voice and Tone + DESIGN.md Do's/Don'ts.
- **A11y** — 44px targets, visible focus ring composition, dialog semantics, `role="status"/"alert"` placement, reduced-motion handling from `tokens/base.css` + `components.css` + ui_kit markup → EXPERIENCE.md Accessibility Floor.
- **Brand** — not-stoner posture, flat/hairline elevation philosophy, Lucide-only iconography (self-hosted v0.460.0), mono-figures-as-signature, light-only → DESIGN.md Brand & Style.

## 2. Overridden

Places the spines deliberately diverge from the import, with the ruling source.

| # | Import says | Spines say | Ruling source |
|---|---|---|---|
| O1 | `_imported-CLAUDE.md.txt` prose: house corner is `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px` (sheet), no `2xl` | House corner is **`radius-lg: 8px`** (`{rounded.lg}` / DEFAULT); md=6px, xl=12px, sheet top radius = **2xl 16px** | `.decision-log.md` provisional ruling, confirmed in DESIGN.md → Shapes "Naming note (binding ruling)": **token files win** (`tokens/spacing.css` is internally consistent with `components.css` and `guidelines/radius.card.html`) |
| O2 | `ui_kits/app/settings.jsx`: draft-then-commit model with a **mandatory "Save vehicle" primary button** (disabled until complete) | No Save step — per FR-8 a completed Year→Make→Model selection **applies immediately** to all cards and the panel collapses (matches shipped `client/src/components/VehicleSelector.tsx` `handleModelChange`) | EXPERIENCE.md → Settings sheet row + Open Question 5 (explicitly "superseding the import mock's 'Save vehicle' / 'Use national average' button pair"). The *clear* action ("use national average") survives in the spine; the confirm pair is pending Erik per OQ5 |
| O3 | `_imported-CLAUDE.md.txt` prose shadows: `shadow-sm: 0 1px 2px rgba(0,0,0,0.05)`, `shadow-md: 0 4px 6px rgba(0,0,0,0.07)`, `shadow-lg: 0 10px 15px rgba(0,0,0,0.10)` — single-layer, black-based | The **token values** in `tokens/elevation.css`: dual-layer, gray-900-based (e.g. `shadow-lg: 0 12px 28px -6px rgba(17,24,39,0.16), 0 4px 10px -4px rgba(17,24,39,0.08)`) | Same token-files-win principle as O1; DESIGN.md → Elevation references `tokens/elevation.css` directly. (Also: `guidelines/elevation.card.html` assigns the sheet `shadow-md` while `settings.jsx` uses `shadow-lg`; DESIGN.md spans both — "shadow-md / shadow-lg — the settings sheet and overlays" — and names `shadow-lg` for the sheet surface.) |
| O4 | `ui_kits/app/index.html`: deal feed is rendered **in the DOM behind the age gate** (gate is an overlay on top); confirmation is session state only; no focus trap (just `autoFocus`) | No deal content exists in the DOM (or a11y tree) until confirmed; strict `=== true` localStorage check; full focus trap | EXPERIENCE.md → Age gate rows (FR-13, ADR-021) |
| O5 | `ui_kits/app/settings.jsx`: changing **Year does not reset Make/Model** (only Make resets Model); Year/Make lists are static; Make enabled without Year | Changing any upstream select **resets downstream ones**; full cascade fetched from fueleconomy.gov; Model disabled until Make | EXPERIENCE.md → Select row (ADR-028, FR-8) |
| O6 | `ui_kits/app/settings.jsx`: sheet closes via scrim tap and close button only; no Esc handling, no focus return | Sheet closes three ways (close button, scrim, **Esc**); focus enters on open and **returns to the gear** on close | EXPERIENCE.md → Settings sheet row + Accessibility Floor |
| O7 | `components/core/Card.d.ts` `interactive` + `as='a'`, `components/core/Button.d.ts` `href` (render as anchor) imply clickable/linkable cards | Cards are **not links in v1** — no navigation exists; `interactive` styling only if a future tap action ships; no anchor-Button use | EXPERIENCE.md → Card row |
| O8 | `components/core/Badge.d.ts` ships `fresh`/`stale` badge variants for source status on cards | v1 feed **omits** stale dispensaries instead of badging them; `fresh`/`stale`/`discount` are status/specimen variants only | EXPERIENCE.md → Badge row (ADR-026) |

### ⚠ Flag — sheet presentation silently adopted from the import

EXPERIENCE.md specs the vehicle UI as the import's **bottom sheet with scrim** (`role="dialog"`, `rounded.2xl` top corners, `shadow-lg`, flat scrim, rises from the bottom edge — per `ui_kits/app/settings.jsx`). The **shipped app** (`client/src/components/VehicleSelector.tsx`) is an **inline collapsible panel** under the header gear: no scrim, no dialog role, plain bordered box that expands in the document flow. The spine adopted the Save-button *removal* from the shipped app (O2) but adopted the *presentation* from the import — and no decision-log entry rules on sheet-vs-inline. This is an unruled divergence from shipped behavior; it should go to Erik alongside Open Question 5 (it's the same surface). Note the related a11y deltas it implies: dialog semantics, focus trap/return, Esc — none of which the shipped inline panel has.

## 3. Dropped qualitative ideas

Design value in the import that the spines neither carry nor explicitly override — for Erik's review.

**Wordmark / brand (`guidelines/brand-wordmark.card.html`)**
- Green apostrophe accent in the wordmark — "Gma<span green>'</span>s Helper".
- Tagline lockup: "Is it worth the drive?" set as a muted tagline under the wordmark (the question also opens `readme.md`; spines never adopt a tagline).
- Proportional mark corner radii: 56px mark → 14px radius, 32px → 9px, 28px → 8px (DESIGN.md only says "rounded square").
- `shadow-sm` on the wordmark mark tile (DESIGN.md elevation rules would actually forbid this — worth an explicit ruling if the wordmark spec is ever formalized).
- Inverse lockup variant: wordmark on a `surface-inverse` chip for dark contexts.
- Header wordmark metrics from `ui_kits/app/feed.jsx`: 32px mark, 20px (`--text-xl`) bold text, `-0.01em` tracking, `strokeWidth 2.25` on the navigation icon — DESIGN.md doesn't size the header lockup.

**Icons (`assets/icons.js`, `assets/icons/`)**
- 10 of 20 vendored Lucide icons are unassigned in the spines: `map-pin`, `percent`, `badge-percent`, `search`, `sliders-horizontal`, `check`, `x`*, `chevron-down`*, `chevron-left`, `chevron-right`, `arrow-right`, `circle-alert`. (*`x` is used by the sheet close; `chevron-down` is superseded by the Select's CSS-drawn chevron.)
- `core.card.html` demos an outlined IconButton "Filters" with `sliders-horizontal` — a filters-affordance idea no spine surface uses.
- The `gmaIcon()` string helper + `window.Icon` React wrapper pattern (three access modes) — implementation idea not carried into the spines.

**Components / variants (`components/`)**
- Badge with a leading inline icon (`<Badge variant="urgent"><Icon name="clock" size={12}/> Happy hour</Badge>` in `feed.jsx` + `core.card.html`) — DESIGN.md badge spec only mentions the 6px dot, not icons-in-badges.
- Notice `urgent` variant used as a standalone "Ends in 24 min" line (`feedback.card.html`, `Notice.prompt.md`) — spines render countdowns inline in the card footer instead; the urgent Notice has no assigned use.
- Notice `default` + info icon microcopy "Gas cost uses the national average MPG." (`feedback.card.html`) — a feed-side default-MPG disclosure the spines don't show anywhere.
- TextField manual-MPG mock-ups with concrete microcopy: hint "Leave blank to use the national average (28)." (`TextField.prompt.md`) / "Blank = national average." (`forms.card.html`) — EXPERIENCE.md reserves TextField for this but specs no copy.
- TextField `error` example copy pattern: "Enter a 5-digit ZIP." (`TextField.prompt.md`) — hints at a future location-entry idea.
- Skeleton fine-grained props (`width`/`height`/`radius` overrides, `Skeleton.d.ts`) — spines only use SkeletonFeed.
- Slider thumb carries `shadow-sm` and slider focus uses `outline-offset: 6px` from the track (`components.css`) — finer than DESIGN.md's generic 2px-offset ring spec.
- Button `href` → renders an `<a>` (`Button.d.ts`) — link-styled-as-button capability, unused in v1.
- `.gma-input::placeholder` color `gray-400` (`components.css`) — placeholder treatment unspecced in spines.

**Layout / ui_kit (`ui_kits/app/`)**
- The 430×720 phone-frame demo shell on a gray-200 backdrop with `shadow-lg`, going full-bleed under 470px (`index.html`) — a nice device-frame pattern for demos/marketing pages.
- Mock fetch flash: 900ms artificial skeleton on entering the feed after the gate (`index.html`) — a "show the skeleton at least briefly" idea the spines don't address.
- Deal-card layout details beyond DESIGN.md prose (`feed.jsx`): baseline-aligned name/distance row, badge row with 2px bottom margin, footer as space-between window/countdown — usable as exact build reference.

**Type / guidelines (`guidelines/`)**
- `--text-xl` (20px semibold) demonstrated as a role ("Within 25 miles", `type-scale.card.html`) — 20px has no assigned role in DESIGN.md typography.
- Figure-strip specimen pattern (`type-figures.card.html`): labeled DISTANCE / GAS COST / WINDOW / COUNTDOWN cells with 18px semibold mono values — a stats-strip layout idea no surface uses.
- 22px display-figure treatment for the Discount Display ("30% off — $1.46") in `type-figures.card.html` — a larger hero rendering of the signature line; cards render it at body size.
- `--leading-relaxed: 1.65` (`tokens/typography.css`) — unused by any spine role.
- Future-imagery guidance: "documentary and warm-neutral — never cannabis-leaf clip-art" (`readme.md`) — spines say "essentially no imagery" and stop there.

## 4. Import errors

Factually wrong against product sources — do not treat as truth.

- **`ui_kits/app/settings.jsx` `mockMpg()`** — toy MPG logic (named trucks → 21, named SUVs → 29, else 34) with hardcoded year/make/model lists (2020–2024, 5 makes, 3 models each). The real resolution is fueleconomy.gov menus + first-trim policy (ADR-028); none of these numbers or lists are real.
- **`ui_kits/app/data.js` `staleCount: 2`** — hardcoded while every listed dispensary has `stale: false`, directly contradicting its own comment ("staleCount derives from the full API array"). In the real contract the count derives from the strict `stale === true` predicate over the payload (ADR-026); the sample can't produce 2.
- **`_imported-CLAUDE.md.txt` component prop tables are largely fictional** — they contradict the actual `.d.ts` contracts shipped in the same import: Button (`size: sm|md|lg`, `loading`, `fullWidth`, `leftIcon/rightIcon` vs actual `md|sm`, `block`, `iconLeft/iconRight`; claims secondary border gray-200 vs actual `--action-secondary-border` = gray-300), Badge (`default|success|warning|error|neutral` vs actual `neutral|fresh|stale|urgent|discount`), Card (nonexistent `selected` green-border prop), Notice (`info|success|warning|error` + `title`/`dismissible` vs actual `default|muted|error|urgent` + `icon`), Skeleton (`variant: text|rect|circle` doesn't exist), RangeSlider (`unit` prop vs actual `valueText`/`showTicks`), IconButton (`icon`/`label` props vs actual children + `aria-label`), Select (nonexistent `error`/`hint`). The `.d.ts` files and `components.css` are the accurate contracts.
- **`_imported-CLAUDE.md.txt` radius and shadow token values are wrong** vs `tokens/spacing.css` / `tokens/elevation.css` (see O1/O3) — already ruled; never quote that file for token values.
- **`readme.md` / `_imported-CLAUDE.md.txt`: "26 architecture decisions"** — stale; root `ADR.md` is at 28 (ADR-028 vehicle precision mode is load-bearing for the settings surface).
- **`ui_kits/app/` mocks omit required behavior** (not just simplification — would be wrong if copied): no Year-change downstream reset, no Esc close, no focus trap/return, feed present behind the age gate, no persistence (see O4–O6).
- **Sample data plausibility** — `data.js` dispensaries/distances are R&D-era samples ("distances are real R&D values" per its comment) and `gasPrice: 4.25` is illustrative; live values come from the EIA refresh (Story 3.1) and `server/data/data.json`. The gas formula and sort in `data.js` do correctly mirror ADR-024/ADR-022.
