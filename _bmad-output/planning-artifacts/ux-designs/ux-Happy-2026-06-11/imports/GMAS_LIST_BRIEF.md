# Gmas List — Design & Build Brief

> Single source of truth for implementation. Where this doc and older notes conflict, **this doc wins**.
> Hand this to Claude Code as the canonical spec. Pronounced "G-ma's" (grandma's) — but never lean on that; the brand text is always `gmas list`.

---

## 0. What it is
A no-gimmick web app that ranks **legal cannabis deals by _true cost_** — sticker price **+** the cost of gas to drive there. The core insight the product sells: the cheapest sticker price is often **not** the cheapest way to actually obtain the product once driving is included.

**Design north star:** a precise utility tool (finance/transit app energy), not a dispensary. Sober, calm, trustworthy, dark, no leafy/neon "420" tropes.

---

## 1. Direction / mood
Adjectives: **utilitarian, calm, trustworthy, dark, no-gimmick.**
- Restraint over decoration. Clean data rows, mono numerals, one confident accent.
- No gradients-as-decoration, no emoji, no cannabis-leaf iconography (also a legal constraint — see §7).
- Numbers are the hero. Prices, distances, and "true cost" totals carry the UI.

---

## 2. Color — "Tidewater" (dark base, single teal accent)

Use these as CSS custom properties. Dark is the default and primary mode.

```css
:root {
  /* Surfaces */
  --bg:            #0E1417; /* app background */
  --surface:       #161F23; /* cards, rows */
  --surface-raised:#1F2A30; /* chips, inputs, tiles */
  --border:        #2C3A41; /* hairlines, card borders */

  /* Text */
  --text:          #E8EFF2; /* primary */
  --text-muted:    #9DB0B8; /* secondary / labels */
  --text-faint:    #5E6E76; /* metadata, struck prices, captions */

  /* Accent */
  --accent:        #4FD1C5; /* teal — primary accent ON DARK */
  --accent-hover:  #6FE0D6; /* hover/active state of accent */
  --accent-soft:   #14302E; /* low-emphasis teal fill (selected row bg) */
  --accent-on-light:#18A294; /* deeper teal for use on LIGHT backgrounds */

  /* Ink (for light surfaces / print) */
  --ink:           #14212A;

  /* Semantic */
  --success:       #5BD6A0;
  --warning:       #E8C36A;
  --danger:        #E87E6E;
}
```

**Rules**
- `--accent` `#4FD1C5` is the locked brand color. Use it sparingly: best-deal highlight, primary buttons, the logo dot, key totals.
- On the rare light surface, swap accent to `--accent-on-light` `#18A294` so the teal stays legible.
- Accent text on `--accent` buttons/tiles is always `--bg` (`#0E1417`), never white.
- Semantic colors are for meaning only (savings/caution/worst-cost), not decoration.

---

## 3. Typography

| Use | Family | Notes |
|---|---|---|
| Display / wordmark / UI headings | **Space Grotesk** | geometric, slightly technical, utilitarian |
| Body / labels / buttons | **Plus Jakarta Sans** | humanist, neutral, legible |
| Numerals & metadata | **Space Mono** | prices, distances, "true cost", any tabular figure |

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

- Headings: Space Grotesk, weight 700, letter-spacing ~ -0.02em.
- Body/buttons: Plus Jakarta Sans, 400–700.
- Any number a user compares (price, miles, drive cost, total): **Space Mono**. This is a signature, not optional.

---

## 4. Logo & app icon

**Wordmark (locked):** lowercase `gmas list` set in **Space Grotesk Medium (500)**, letter-spacing ~ -0.01em, closed up tight, followed by a **teal square "set-dot"** — the brand signature.

- Dot ≈ 0.21× the cap height, `border-radius: 2px`, sits near the baseline just right of the final "t".
- On dark: text `--text`, dot `--accent`.
- On light: text `--ink`, dot `--accent-on-light`.
- Monochrome contexts: dot matches text color.
- **Never** capitalize, never add a pictorial icon to the logotype, never use a cannabis leaf.
- Minimum width 96px; clear space on all sides = cap height. Below 96px, use the app-icon mark.

**App icon / favicon — "g + dot":** lowercase **`g`** in Space Grotesk Bold (700) + the teal set-dot, centered in a rounded-square tile.
- Standard: `--text` "g" + `--accent` dot on `--bg` tile.
- Alt: `--bg` "g" + `--bg` dot on `--accent` tile.
- Tile corner radius ≈ 24% of size. Provide 16/32/56/96 + 180 (apple-touch) + 512.

Reference wordmark markup:
```html
<span style="font-family:'Space Grotesk',sans-serif;font-weight:500;letter-spacing:-.01em;color:#E8EFF2;display:inline-flex;align-items:flex-end;">
  gmas list<span style="width:0.21em;height:0.21em;border-radius:2px;background:#4FD1C5;margin-left:.14em;margin-bottom:.16em;"></span>
</span>
```

---

## 5. Components already decided

### 5a. 21+ Age gate (entry screen — required, see §7)
- Full-bleed `--bg`, centered card (`--surface`, `--border`, radius 20, max-width ~404px).
- Wordmark above the card.
- "21" tile, headline **"Are you 21 or older?"**, one line of context.
- Primary button **"Yes — I'm 21+"** (`--accent` bg, `--bg` text, 52px, radius 13, weight 700, hover `--accent-hover`).
- Secondary **"No, take me back"** (transparent, `--border`, `--text-muted`).
- "Remember me on this device" checkbox → persist pass in `localStorage` so the gate isn't shown again.
- States: ask → **in** ("You're in" → Browse deals) / **out** ("Come back at 21").
- Small print below the card = the mandated warnings (§7).
- ⚠️ Do **not** drive entry animations from inline `animation:` + `@keyframes` on a re-rendering root — it sticks at opacity 0. Use a mount-triggered CSS transition or no animation.

### 5b. Results screen (true-cost ranking)
- Header: wordmark + location pill ("Denver, CO" style), subline "Ranked by **true cost** — price + drive".
- Deal cards (`--surface`, `--border`, radius 14), sorted ascending by **total**.
- **Best card** gets a `1.5px --accent` border + a "Best true cost" badge (`--accent` bg, `--bg` text).
- Each card: dispensary name, "Strain · ⅛ oz", big sticker price (Space Mono not required for the hero price, but the breakdown is), struck original price (`--text-faint`), and a right-aligned breakdown: `+$X drive` (Space Mono, faint) over `$Y total` (bold; `--accent` on best, `--text-muted` mid, `--danger` when it's the worst total).
- Teaching example baked into demo data: `$21` cheapest sticker ranks **last** at `$33 total`; a `$28` deal 4.2mi away wins at `$31 total`.

True-cost formula (make it explicit in code):
```
trueCost = salePrice + driveCost
driveCost = roundTripMiles * costPerMile   // costPerMile from gas price ÷ MPG, default ~$0.16/mi round-trip-adjusted; expose as a setting
```

---

## 6. Layout & interaction principles
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 28 / 40 px.
- Radii: inputs/buttons 12–13, cards 14, sheets 20, tiles ~24%.
- Hit targets ≥ 44px.
- Borders are 1px `--border`; selected/important is 1.5px `--accent`.
- Hover = lighten (`--accent-hover`) or brighten border to ~`#3c4d55`; don't shift layout.
- Tabular figures everywhere numbers align.

---

## 7. Fixed constraints — regulated content (Washington, WAC 314-55-155)
These are legal requirements, not style choices. Bake them in.

- **Age gate is mandatory.** 21+ only.
- Must display **"21+"** / "for use by persons 21 and over only" language.
- **No depictions of cannabis plants or products** in logos, icons, or ads (smoke, leaves, buds, product imagery all prohibited). The teal-dot brand is intentionally abstract — keep it that way.
- Nothing designed to appeal to minors (no toys, cartoons, mascots).
- **No** coupons, giveaways, free/branded merch, or "free/donated" language.
- Don't target out-of-state users.
- **Mandated warnings** must appear (in advertising/marketing surfaces), in type ≥ 10% of the largest type on screen — verbatim:
  1. "This product has intoxicating effects and may be habit forming."
  2. "Cannabis can impair concentration, coordination, and judgment. Do not operate a vehicle or machinery under the influence of this drug."
  3. "There may be health risks associated with consumption of this product."
  4. "For use only by adults 21 and older. Keep out of the reach of children."

Keep the verbatim warning strings in a single constant so they're reused, not retyped.

---

## 8. Don't
- ❌ Cannabis leaves, buds, smoke, neon green, tie-dye, "420".
- ❌ Emoji, decorative gradients, rounded-corner-with-left-accent-border cards.
- ❌ Capitalized or icon-laden wordmark.
- ❌ Inventing colors/fonts outside §2–§3.
- ❌ White text on the teal accent (use `--bg`).
