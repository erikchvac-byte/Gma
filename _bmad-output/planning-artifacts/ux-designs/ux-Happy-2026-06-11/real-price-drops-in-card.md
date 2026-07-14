# "Real price drops" — in-card relocation spec

Status: final · Created 2026-07-13 · Author: Sally (bmad-ux) · Ratified by: Erik

> **Companion + partial supersession of `real-price-drops-surface.md`.** That spec defined the
> *fact*, the *copy*, the *number formats*, and the *honesty gates* for the "Real price drops"
> surface — all of which this spec **keeps unchanged**. What this spec changes is one thing: **where
> the drop lives.** It moves each drop out of the standalone top-of-feed block and **into its own
> store's card**, so a drop sits next to the link, address, distance, gas, and banner deals for that
> same store. It **defers to `DESIGN.md` and `EXPERIENCE.md` on any conflict** and introduces no new
> tokens, colors, or fonts.
>
> **Supersedes** the "Placement" and "States → Loading/No-drops render-nothing-as-a-section" sections
> of `real-price-drops-surface.md`. Everything else in that spec (Why, Structure of a row, Number
> formats, Honesty gates, Voice, Accessibility of a row, Tokens) still governs.

## Why this change exists (one line)

A drop shown in a separate top block ("Blue Dream, 19% below usual — Green Fields") forces the shopper
to **hunt down the page** for the Green Fields card to act on it. Co-locating the drop with its store's
card puts the fact and the means to act on it **in one place** — the store name, the link, the drive,
the deals, and the drop, read together.

## What changes vs. the original placement

| | Original (`real-price-drops-surface.md`) | This spec |
|---|---|---|
| Location | One standalone Card between the distance slider and the feed | A labeled strip **inside each store's `DealCard`**, under that store's deals |
| Keying | Product-keyed list; store named in each row's meta | Store-keyed (the card *is* the store); row meta drops the store name |
| Distance | **Not** distance-filtered (full list) | **Follows the store** — a drop at a store past the slider is hidden with that store (ratified) |
| Global count | `"4 today"` header | **Removed** — no global count; each card shows its own drops inline |
| Empty state | Whole top section renders nothing | No top section exists; a store with no drops simply shows no strip |

## Placement (ratified)

The standalone "Real price drops" section between the distance slider and the feed is **removed**.
Each renderable drop is rendered **inside its store's `DealCard`**, in a dedicated sub-section that
sits **after** the banner deal grid:

```
┌ DealCard (article, one per store) ─────────────────────┐
│  Green Fields (link)                    123 Main · 12 mi │  ← header (unchanged)
│  ⛽ $4.10                                                 │  ← gas line (unchanged)
│  Active today                                            │  ← status badge (unchanged)
│  20% off flower · 1/8 oz            [icons]              │  ← banner deal grid (unchanged)
│ ─────────────────────────────────────────────────────── │  ← 1px {colors.border} divider
│  Real price drops                                        │  ← NEW strip heading (h3)
│  Blue Dream                      19% below its usual     │  ← drop row (identity · figure)
│  1/8 oz                          $32.40 vs $40.00 usual  │
│  Gelato                          12% below its usual     │
│  1 g                             $28.00 vs $31.80 usual  │
└──────────────────────────────────────────────────────────┘
```

The whole feed order is otherwise **unchanged**:

```
[ header — gmas list wordmark (h1) ]     ← unchanged
[ RangeSlider — distance filter ]        ← unchanged
[ DealCategoryFilter — icon bar ]        ← unchanged
[ Deal feed — store cards ]              ← cards now MAY carry a "Real price drops" strip
[ Last updated … / stale / disclaimer ]  ← unchanged
```

## Distance rule (ratified — supersedes original)

**Drops follow their store.** A price drop is only ever shown if its store's card is shown. Concretely:
a drop whose store is beyond the current distance-slider setting is **not rendered** — exactly as that
store's card is not rendered. The slider now means one consistent thing across the whole feed. This
reverses the original spec's "not distance-filtered" rule, by Erik's ratified decision.

## Which stores render a card (the one real pipeline change)

Today the feed cards a store when it has **active deals** (live) or **recently-expired deals**
(the "No current deals" card). A price drop is a **separate fact** with its own freshness, so a store
can have a genuine drop while having **no** active or expired banner deal — today that store shows no
card at all, and under the old design its drop lived in the top block instead.

To avoid **silently losing** those drops when the top block goes away, the set of carded stores becomes
the **union** of:

1. stores with active deals (live), **plus**
2. stores with recently-expired deals ("No current deals" card), **plus**
3. **stores with ≥1 renderable price drop** (NEW) —

…all still gated by the existing **distance** and **fresh (non-stale, non-failed)** filters.

A **drop-only store** (case 3, no active/expired deals) renders a card with its **identity + trip +
status line + the Real price drops strip**, and no banner deal grid. Its status line reads the existing
neutral **"No current deals"** (the store genuinely has no *banner* deal today; the drop is not a banner
deal — Gate 2). This reuses the existing expired/no-deals card shell; the only new thing is that the
strip can be present on it.

> **Consequence, called out honestly:** this can make **new store cards appear** in the feed that were
> not there before (a fresh, in-range store that previously had nothing to show now shows a card because
> it has a real drop). That is intended — it is the price of not losing any drop — but it is a visible
> behavior change, so it is flagged as an **Ask-First checkpoint** for the dev story: if Erik prefers
> the feed's store set to stay byte-for-byte what it is today, the alternative is to render drops **only
> on stores already carded** (cases 1–2) and drop the rest silently (fail-soft). Default in this spec is
> the **union / no-drop-lost** option.

## Strip structure

The strip is **not a new component** — it reuses the existing `card` sub-sectioning and the row markup
from `real-price-drops-surface.md`. Inside the store's `DealCard`, after the deal grid:

1. **Divider** — a 1px `{colors.border}` hairline separating banner deals from the drops strip
   (tables-as-cards rhythm; omitted when the card has no banner deal grid, e.g. a drop-only card, so
   the strip doesn't float under an empty region).
2. **Strip heading** — `"Real price drops"`, `{typography.heading}` (Space Grotesk 700) but at the
   **sub-heading size** used within a card, `{colors.text}`, as an **`<h3>`** (the store name is the
   card's `<h2>`; the strip is a child region of it). Sentence case. **No count** appears.
3. **Drop rows** — the same ledger rows as the original spec, `{spacing.gap-feed}`-rhythmed, divided
   by 1px `{colors.border}` hairlines. Rendered in the server's emitted order (no client re-ranking —
   Honest Math; the engine's order is preserved so the app never invents a "best drop").

### Per-row anatomy (co-located variant)

Identical to `real-price-drops-surface.md` **except the store name leaves the meta line** — the card is
already the store, so repeating it is redundant:

- **Left — identity**
  - Product `name` — `{typography.body}`, `{colors.text}`, single line, ellipsis on overflow; full
    name stays in the accessible name.
  - Meta line — `{typography.caption}`, `{colors.text-muted}`: the **option label only**, verbatim
    from the fact (e.g. `1/8 oz`). When the option is empty, the meta line is **omitted** (no dangling
    separator, no empty caption row).
- **Right — the honest drop** (unchanged from the original)
  - Headline: `"19% below its usual"` — magnitude `19%` in `{typography.figure}` `{colors.discount}`
    (amber); `below its usual` in `{typography.caption}` `{colors.text-muted}`.
  - Support: `"$32.40 vs $40.00 usual"` — `{typography.figure}` `{colors.text-muted}`, both dollars 2dp.

Magnitude is shown by **font-weight step only within the single amber hue** — never a second color
(ADR-037/040/041 invariant).

## Copy (unchanged — ratified this session)

No microcopy changes from `real-price-drops-surface.md`. For the record, confirmed verbatim:

| Context | Exact copy |
|---|---|
| Strip heading | `Real price drops` |
| Drop headline | `19% below its usual` |
| Drop support | `$32.40 vs $40.00 usual` |

`usual` still names the SKU's own rolling **median** price. The removed global `"N today"` count carried
no shopper meaning once drops are distributed per-store, so it is dropped, not relocated.

## Honesty gates (carried over verbatim — still load-bearing)

All gates from `real-price-drops-surface.md` apply **unchanged**. Two get *stronger* by co-location and
must not be weakened:

| Gate | Rule here |
|---|---|
| **Gate 2 — no banner %** | The store's banner `discountPct` and the drop's `pctVsMedian` now sit **in the same card**. They must stay **visually distinct**: banner deals keep the `gma-deal-block` treatment ("N% off"); the drop keeps the `below its usual` ledger treatment. A drop must **never** be restyled to look like a banner deal, and the banner % must **never** appear in the strip. (This is why the ratified in-card style is a **labeled strip**, not "blended into the deal list".) |
| **ADR-009 — no verdicts** | Copy states the fact (`below its usual`). Never "great deal", "best", "steal", "save", "deal of the day". |
| **ADR-066 — legal** | Facts-not-menus, no health claims, WA-only framing, no licensee ad creative. |
| **Honest Math — store join** | A row whose store is absent from the loaded list, or whose store is `failed`/`stale`, is dropped. Because drops now render **inside** a card, a stale/failed store is already absent from the feed — so its drops are naturally gone. A row must never render against a fabricated store. |
| **Honest Math — suppress sub-1%** | Only rows whose displayed whole-number percent is ≥ 1% render (a `round → 0%` row is suppressed). Unchanged. |

## States

| State | Treatment |
|---|---|
| Store has banner deals **and** drops | Deal grid, divider, then the Real price drops strip. |
| Store has banner deals, **no** drops | Deal grid only. **No divider, no strip** — the card is byte-for-byte today's card. |
| Store has drops, **no** banner deals (drop-only) | Identity + trip + `"No current deals"` status + the strip (no divider needed above it). |
| Drops still loading | The card renders **without** the strip (fail-soft); the strip appears only once drops resolve. The card never blocks on the drops fetch. |
| Drops fetch failed / malformed / empty envelope | Same as "no drops": **no strip**. Never an error Notice, never a crashed card (mirrors `useDeals` posture). |
| Store past the distance slider | Card absent → its drops absent (the ratified distance rule). |
| Reduced motion | No motion on this surface; nothing to collapse. |

## Accessibility

- **Listitem count preserved.** The feed keeps **one `<li>` per store** (`DealFeed` list). The strip
  and its rows are **plain `<div>`s inside the card article** — exactly like the banner deal blocks
  (`DealCard.tsx:135-138`), so the one-listitem-per-store count is **untouched**.
- **Heading hierarchy.** Store name = `<h2>` (unchanged). Strip heading = `<h3 id="…">` scoped per card
  (id must be unique per store — e.g. suffix the `dispensaryId`). The strip is a labeled region of the
  card, so a screen-reader user lands on the store, then the "Real price drops" sub-heading, then the
  rows — the store context comes from the card it is inside.
- **Per-row accessible name.** As in the original, each row carries an `aria-label`; the visual children
  are `aria-hidden`. Because the card already announces the store (its `<h2>`/article label), the row's
  accessible name **drops the "at {store}" clause** to avoid double-announcing — e.g.
  `"Blue Dream, 1/8 oz, 19 percent below its usual price, $32.40 versus $40.00 usual."` The **full**
  (untruncated) product name goes in this name.
- **Not a live region.** The strip renders once on resolve; it does not announce (calm-by-default).
- **AA contrast** unchanged from the original audit — all figures on the white `{colors.surface}` card:
  amber `{colors.discount}` 5.4:1 ✅, `{colors.text}` 17.3:1 ✅, `{colors.text-muted}` 6.9:1 ✅.
- **Targets** ≥ `{spacing.tap-min}` only if a future tap action ships; v1 rows are static text.

## What this spec does NOT change

- The **fact** (`price-vs-own-median`), its **freshness**, and the `/api/value/…` payload — read-only.
- The **copy**, **number formats**, and **honesty gates** — inherited verbatim from
  `real-price-drops-surface.md`.
- The **header**, **distance slider**, **category icon bar**, **"Last updated" line**, **stale
  indicator**, and the **banner deals pipeline** (`useDeals`, `groupDealsByStore`, sorting).
- Any **design token, color, or font** — this spec adds none.

## Component impact map (for the dev story — spec level, not code)

- **`ValueDrops.tsx`** — no longer rendered as a standalone top-of-feed section. Its row-rendering
  logic and its `renderable`/store-join/suppress rules **move into (or are shared with) the card**. The
  standalone `<section>` + `"N today"` header are retired.
- **`DealFeed.tsx`** — group the renderable drops by `dispensaryId`; extend the carded-store set to the
  **union** described above (still distance- and freshness-gated); pass each store's drops into its
  `DealCard`. Remove the `<ValueDrops>` render between the slider and the feed.
- **`DealCard.tsx`** — accept the store's drops as a prop; render the divider + `Real price drops`
  strip after the deal grid when drops are present; support the drop-only variant (strip present with no
  deal grid). Purely presentational, as today.
- **CSS** — the existing `gma-value-drops__*` classes are reused, re-scoped to live inside a card
  (adjust only container padding/margins so the strip nests cleanly under the deal grid). No new tokens.

## Open decision left for the dev story

Only one, already flagged above: **union vs. carded-stores-only** for drop-only stores.
- **Default (this spec): union** — a fresh, in-range store with a real drop but no banner deal **gets a
  card**, so no drop is lost. Trade-off: new cards may appear in the feed.
- **Alternative: carded-only** — drops render only on stores already showing a card; a drop-only store's
  drops are dropped silently (fail-soft). Trade-off: the feed's store set is unchanged, but some genuine
  drops never show.

Recommend the **union** (no-drop-lost) unless Erik wants the feed's store set frozen.

## ASCII reference (layout intent, not a pixel spec)

```
┌──────────────────────────────────────────────────────────┐  ← DealCard, one per store
│  Green Fields                        123 Main St · 12.0 mi │  ← h2 (link) · address · distance pill
│  ⛽ $4.10                                                   │  ← gas line (when computable)
│  Active today                                              │  ← status badge
│                                                            │
│  20% off      Flower · 1/8 oz                    [🏷️][🌿]  │  ← banner deal block (unchanged)
│ ────────────────────────────────────────────────────────── │  ← 1px {colors.border} divider
│  Real price drops                                          │  ← h3 (Space Grotesk), no count
│  Blue Dream                          19% below its usual   │  ← name (body) · 19% amber mono
│  1/8 oz                              $32.40 vs $40.00 usual │  ← option (caption) · support (mono muted)
│ ────────────────────────────────────────────────────────── │
│  Gelato                              12% below its usual   │
│  1 g                                 $28.00 vs $31.80 usual │
└──────────────────────────────────────────────────────────┘
```
