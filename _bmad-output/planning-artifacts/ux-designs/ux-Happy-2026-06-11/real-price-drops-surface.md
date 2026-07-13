# "Real price drops" — value surface spec (Story derivation-3-2)

Status: final · Created 2026-07-13 · Author: Sally (bmad-ux) · Ratified by: Erik

> **Scoped companion to the binding spines.** This documents one new in-app surface — the
> product-keyed "Real price drops" section over the `price-vs-own-median` fact. It **defers to
> `DESIGN.md` and `EXPERIENCE.md` on any conflict** and introduces no new tokens, colors, or fonts.
> All `{path.to.token}` references resolve against `DESIGN.md` frontmatter. The store-keyed
> `DealFeed`/`DealCard` contract is **unchanged**; this section is purely additive.

## Why this surface exists (one line)

Surface the one honest discount the engine can compute — a product priced **below its own rolling
median** — as calm ledger rows, distinct from store banner deals. It answers "is this a *real* price
drop?", never "is this a good deal?" (that verdict is the user's; ADR-009).

## Placement (ratified)

Fixed top-of-feed order inside `main`, single column, within `{spacing.gutter-page}` gutters:

```
[ header — gmas list wordmark (h1) ]        ← unchanged
[ RangeSlider — distance filter ]           ← unchanged (still filters store deals only)
[ SECTION: Real price drops ]               ← NEW (this spec)
[ Deal feed — store cards (one listitem/store) ]  ← unchanged
[ Last updated … / stale / disclaimer ]     ← unchanged
```

The section sits **between the distance slider and the store deal feed**. The slider keeps its role
(it filters store deals by distance; price drops are product-keyed and **not** distance-filtered).
The section is its **own labeled region** — it is NOT nested inside the feed's list, so the
listitem-per-store a11y count is preserved (AC6, `DealCard.tsx:135-138`).

## Structure

One **Card** (`{colors.surface}` white, 1px `{colors.border}` hairline + soft shadow, `{rounded.card}`,
`{spacing.pad-card}` padding — the standard `card` component) containing:

1. **Section header row**
   - Heading "Real price drops" — `{typography.heading}` (Space Grotesk 700), `{colors.text}`, an
     `<h2>`. Sentence case.
   - Count, right-aligned: `{typography.figure}` (Space Mono, tabular), `{colors.text-muted}` —
     `"4 today"` (singular `"1 today"`). Sourced from the report's `belowMedianCount` (already
     computed; honest and free). No count is fabricated.
2. **Drop rows** — a local `<ul>` of ledger rows, each divided by a 1px `{colors.border}` hairline
   (tables-as-cards). Rows are `{spacing.gap-feed}`-rhythmed, ≥ `{spacing.tap-min}` tall if ever
   interactive (v1 rows are static, not links — matches deal cards).

### Per-row anatomy (compact ledger row, ratified)

Two-part row: identity on the left, the honest figure on the right.

- **Left — identity**
  - Product `name` — `{typography.body}`, `{colors.text}`. Long names truncate with ellipsis
    (single line); the full name stays in the accessible name.
  - Meta line — `{typography.caption}`, `{colors.text-muted}`: **store name · option label**, e.g.
    `Green Fields · 1/8 oz`. Store name is **joined** from `dispensaryId` → `Dispensary.name`
    (the row carries only `dispensaryId`). Option label is rendered **verbatim** from the fact.
- **Right — the honest drop (side-by-side, ratified)**
  - **Headline:** `"19% below its usual"` — the magnitude `19%` in `{typography.figure}`
    `{colors.discount}` (amber, the discount-semantic token; a below-own-median drop **is** the one
    honest discount). The words `below its usual` in `{typography.caption}` `{colors.text-muted}`.
  - **Support:** `"$32.40 vs $40.00 usual"` — `{typography.figure}` `{colors.text-muted}`, both
    dollars 2dp. This is the deal card's side-by-side honesty applied here: the percent never floats
    free of the numbers it came from.

Magnitude is shown by **font-weight step only within the single amber hue** — never a second color
(ADR-037/040/041 invariant). A bigger drop may sit at a heavier weight; it never changes hue.

## Number formats (Honest Math — hard)

- **Percent:** whole number, no decimals. Value = `round(abs(pctVsMedian) × 100)`. `pctVsMedian` is
  negative for a drop; display the **absolute** magnitude with the fixed suffix `below its usual`.
  Never render a `+`, never a positive/"above" figure as a drop.
- **Dollars:** 2 decimals, `$` prefix (`$32.40`, `$40.00`). `currentPrice` vs `medianPrice`.
- All figures in `{typography.figure}` (Space Mono, tabular, slashed-zero) so nothing wiggles.
- **Suppress, never fabricate:** only rows the fact asserts (`pctVsMedian < 0`) render. A row at or
  above its own median is **not** shown. No number is invented client-side.

## Honesty gates on this surface (restate for the build)

| Gate | Rule here |
|---|---|
| **Gate 2 (the point of this card)** | The banner `discountPct` **must not appear anywhere** on this surface. This section shows only `pctVsMedian`-derived figures. |
| **ADR-009 — no verdicts** | Copy states the fact (`below its usual`). Never "great deal", "best", "steal", "save", "deal of the day", or any judgment word. |
| **ADR-066 — legal** | No health/therapeutic claims; **facts-not-menus** (render only the computed drop, never reproduce a store menu); WA-only framing; no licensee ad creative. |
| **Honest Math — store join** | If a row's `dispensaryId` is absent from the loaded dispensary list, or that store's `status` is `failed`/`stale`, the row is **dropped** (never rendered against a fabricated store name). If every row drops → the whole section renders nothing. |

## States

| State | Treatment |
|---|---|
| Loading (drops not yet fetched) | **Render nothing** — no skeleton. The section is additive and must never block or shift the feed. The feed keeps its own `SkeletonFeed`. |
| No drops today | **Render nothing** — the entire section (Card + heading) is absent. **Unlike the deal feed, there is NO empty-state line** ("No active deals…"): an additive value section must never imply the store feed is empty. Silence, not a message. |
| Fetch failed / malformed JSON / empty-or-epoch envelope | Same as "no drops": **render nothing**. Fail-soft, never an error Notice, never a crash of the feed (mirrors `useDeals` posture). |
| All rows dropped by the store-join rule | Section absent (same as no drops). |
| Populated | The Card with heading + count + ledger rows. |
| Reduced motion | No motion exists on this surface; nothing to collapse. |

## Voice & microcopy (extends `EXPERIENCE.md → Voice and Tone`)

| Context | Exact copy | Never |
|---|---|---|
| Section heading | `Real price drops` | "Real deals!", "Best prices", "Hot drops" |
| Count | `4 today` / `1 today` | "4 amazing drops!", any exclamation |
| Drop headline | `19% below its usual` | banner %, "19% off", "great deal", "steal", "you save $X" |
| Drop support | `$32.40 vs $40.00 usual` | a net "you save" dollar figure, `$NaN`, a struck menu price |
| No drops | *(section renders nothing)* | an empty-state line, "No drops today", a placeholder |

Plain, literal, sentence case, present tense — the house voice. `usual` (not "average"/"MSRP"/
"retail") names the SKU's own rolling median in a word a shopper reads without a glossary.

## Accessibility

- Section = `<section aria-labelledby="value-drops-heading">` with `<h2 id="value-drops-heading">
  Real price drops</h2>`. Its rows are a **separate** local `<ul>` — **not** part of the deal feed's
  list, so the feed's one-listitem-per-store count is untouched.
- Per-row accessible name (recommended, mirrors Honest Math rule 3's `aria-label` allowance if the
  mono "vs" / "%" mis-voices): e.g. `"Blue Dream at Green Fields, 1/8 oz, 19 percent below its usual
  price, $32.40 versus $40.00 usual."` The full (untruncated) product name goes in this name.
- **Not a live region.** The section renders once on resolve; it does not announce (matches the
  calm-by-default posture and the silent countdowns). The feed's existing "Last updated …" line
  remains the load announcement.
- **AA contrast** (from `DESIGN.md` audit, all on the white `{colors.surface}` Card): amber
  `{colors.discount}` 5.4:1 ✅, `{colors.text}` 17.3:1 ✅, `{colors.text-muted}` 6.9:1 ✅.
- Targets ≥ `{spacing.tap-min}` only if a future tap action ships; v1 rows are static text.

## Tokens used (no hex literals)

`{colors.surface}` `{colors.border}` `{colors.text}` `{colors.text-muted}` `{colors.discount}` ·
`{typography.heading}` `{typography.body}` `{typography.caption}` `{typography.figure}` ·
`{rounded.card}` · `{spacing.pad-card}` `{spacing.gap-feed}` `{spacing.gutter-page}`
`{spacing.tap-min}`. Reuse the `card` component primitive; introduce no new component.

## What this spec does NOT change

`DealFeed.tsx`, `DealCard.tsx`, `useDeals` (read-only for the store-name join + dispensary list),
the distance slider, the deals pipeline, `/api/data`, existing types. The section is a new sibling
region composed above the feed; everything below it is byte-for-byte the shipped behavior.

## ASCII reference (layout intent, not a pixel spec)

```
┌──────────────────────────────────────────────┐  ← card {colors.surface}, hairline, {rounded.card}
│  Real price drops                     4 today │  ← h2 (Space Grotesk) · count (mono, muted)
│ ────────────────────────────────────────────── │
│  Blue Dream                 19% below its usual │  ← name (body) · 19% amber mono
│  Green Fields · 1/8 oz     $32.40 vs $40.00 usual │  ← meta (caption muted) · support (mono muted)
│ ────────────────────────────────────────────── │
│  Gelato                      12% below its usual │
│  North Coast · 1 g          $28.00 vs $31.80 usual │
└──────────────────────────────────────────────┘
```
