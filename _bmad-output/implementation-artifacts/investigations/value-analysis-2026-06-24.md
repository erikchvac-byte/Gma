# Value Analysis — Derivations from Live Data (2026-06-24)

What we can derive **right now** from data already gathered, with the raw snapshots
preserved so every number is reproducible.

## Sources (snapshots saved alongside this file)
- `data-snapshots/api-data-2026-06-24.json` — `GET https://gmaslist.com/api/data`
  - `meta.lastScraperRun`: 2026-06-25T00:10:34Z · `gasPrice`: **$5.152/gal** · `nationalMpg`: **28** · `gasPriceUpdatedAt`: 2026-06-25T01:57:34Z
  - 21 stores · 18 with ≥1 deal · 61 deals total · status: 17 ok / 4 stale
- `data-snapshots/api-products-2026-06-24.json` — `GET https://gmaslist.com/api/products`
  - `lastUpdated`: 2026-06-24T19:57:04Z · 2,142 product records · 17 stores · 5,469 observations · 1,665 products with ≥2 observations
  - Categories present: **Vaporizers (780), Flower (772), Pre-Rolls (590)** — no Edibles/Concentrates

## Data constraints (read before using)
- **No "Edibles" category** is scraped — only Flower / Vaporizers / Pre-Rolls.
- **Deals are free-text**, not category-tagged (`"50% off Ounces"`, `"40% Storewide"`). Structured % off must come from **product specials** (base vs special price), not deal text.
- **Gas/distance needs an origin.** 21/21 stores have `lat`/`lng`; only the 4 originals carry `distanceMiles`. All distance math here uses **Marysville, WA (48.0518, -122.1771)** as origin.
- **Temporal signal is flat:** of 61 deals, 54 are `everyday` (7 Wed, 1 Mon, 1 Fri, 1 Sat); **0 have time windows** (happy_hour deferred). "Monday vs weekend" has almost no data.
- **No quality-tier field.** A pure price sort surfaces shake/trim before top-shelf (only strain type I/H/S exists, not grade).

---

## 1. Gas / break-even engine (Honest Math)
Origin: **Marysville WA** · gas **$5.152/gal** · **28 mpg** · **round-trip**, straight-line (haversine) estimate.

**Break-even $ = the basket size at which a store's discount savings equals the round-trip gas.** Lower = more worth the drive.

| Store | 1-way mi | RT gas | Best deal | Break-even spend |
|---|--:|--:|--:|--:|
| Remedy Tulalip | 2.0 | $0.74 | 25% | $3 |
| KushMart North | 8.0 | $2.93 | 50% | $6 |
| Kush21 Everett | 9.6 | $3.55 | 50% | $7 |
| Kushman's Everett | 9.6 | $3.55 | 50% | $7 |
| Jet Cannabis | 10.4 | $3.84 | 50% | $8 |
| Local Roots Everett | 12.1 | $4.43 | 50% | $9 |
| Hangar 420 Everett | 11.4 | $4.19 | 45% | $9 |
| The Vault Silvana | 14.3 | $5.26 | 45% | $12 |
| Hangar 420 West | 15.0 | $5.53 | 45% | $12 |
| CannaZone Old Hwy 99 | 24.2 | $8.89 | 50% | $18 |
| The Joint Everett | 9.8 | $3.60 | 20% | $18 |
| Happy Time Mt Vernon | 24.7 | $9.08 | 40% | $23 |
| CannaZone Bellingham | 56.7 | $20.86 | 50% | $42 |
| Salish Coast | 32.1 | $11.79 | 25% | $47 |
| Evolve Bellingham | 55.1 | $20.28 | 40% | $51 |
| Sweet Relief Mt Vernon | 29.7 | $10.92 | 20% | $55 |
| 2020 North Bellingham | 52.9 | $19.48 | 30% | $65 |
| 2020 Pacific Hwy | 55.3 | $20.36 | 30% | $68 |

Excluded (no parseable deal): CannaZone Mt Vernon, Bud Hut Camano, Starbuds Bellingham.

**Read:** Within 10 mi, **KushMart North** wins — 50% off for $2.93 gas, break-even at a $6 basket. The Bellingham cluster needs a $40–68 basket before the discount out-earns ~$20 of gas.

---

## 2. Best price on a set amount (cheapest delivered item, pre-gas)
Standard sizes available: Flower eighth 3.5/3.54g, quarter 7g, ounce 28g; 1g vape carts; 1g pre-rolls.

**Cheapest ounce of flower (28g), current price:**
| Price | Store | Product |
|--:|---|---|
| $17.50 (sale) | kushmart-north | GG4 Shake (Hempkings) |
| $17.50 (sale) | kushmart-north | Wedding Cake Shake (Hempkings) |
| $17.50 (sale) | kushmans-everett | Dirty Girl Flower (Incredibulk Ounce) |
| $20.00 (sale) | 2020-north-bellingham | Orange Creamsicle Trim 28g |
| $20.00 (sale) | 2020-pacific-highway | Mythic OG Trim 28g |

> Caveat: cheapest ounces are shake/trim — no grade field, so price sort surfaces bottom shelf first.

**Cheapest 1g vape cart, current price:**
| Price | Store | Product |
|--:|---|---|
| $7.20 (sale) | kushmans-everett | Wedding Cake Distillate Cartridge |
| $8.25 (sale) | hangar-420-everett | CBB Hippie Crasher Cartridge 1g |
| $8.25 (sale) | hangar-420-west | CBB White Widow Cartridge 1g |

---

## 3. The unique combo (not yet built)
**Cheapest *delivered* price = item price + round-trip gas from origin.** Composes #1 + #2.
Example: $7.20 cart at Kushman's (9.6 mi → $3.55 gas) ≈ **$10.75 all-in** — rank stores by what you'd actually pay to walk out with a chosen item. No competitor combines item price with real fuel cost.

---

## 4. Data-quality audit (what the data actually is)
Full audit of the 2,142-product snapshot. The price data is sound; the problems are
concentrated and specific.

**Solid / trustworthy:**
- **Prices & discounts are clean.** 0 missing, 0 zero-price, 0 broken (special ≥ base). 2,374 options carry a genuine discount (special < base). The "95% on special" (2,040 of 2,142) is **real**, not an artifact.
- **Identity fields fine:** brand missing on only 19/2,142; strain type (I/H/S) present on all.
- **Shake/trim is only 6% of flower** (50 of 772). It *looked* dominant only because a blind price sort floats a few cheap trim ounces to the top — cosmetic, filterable by name.

**Broken / unreliable:**
- **Price-per-gram is wrong on ~17% (365 records)** flagged `weight-mismatch` — multi-pack / infused pre-rolls whose name says "2pk" but parse to `weightGrams: 1`, producing nonsense `pricePerGram` ($16/g, $8/g). Any per-gram ranking inherits this. (Also 237 `assumed-single` pack-count guesses.)
- **Catalog is narrow:** only Flower, Vaporizers, Pre-Rolls. No edibles / concentrates / tinctures.
- **No quality dimension exists at all.** Confirmed: no THC, CBD, potency, grade, tier, or test field anywhere; THC appears in only 18/2,142 names.

| Field | Trust |
|---|---|
| Price / special / discount % | ✅ Reliable |
| Cheapest at a fixed size (eighth / oz / 1g) | ✅ Reliable (accept it'll be trim) |
| Price-per-gram / per-item | ⚠️ Wrong on ~17% (multipack/infused) |
| Category breadth | ❌ Only 3 types |
| Quality grade | ❌ Field does not exist |

### Verdict on price-per-gram
Two independent failures, only one fixable:
1. **Parse bug (fixable in code):** exclude/repair the 365 `weight-mismatch` records.
2. **Quality variance (NOT fixable — no field):** ranking the *whole catalog* by cheapest $/gram structurally just finds the worst product every time; quality isn't in the data, so nothing can correct for it.

Rule of thumb:
- **Across different products → price-per-gram lies** (quality unaccounted). ❌ Don't build it.
- **Same product, different stores → price-per-gram is the truth** (quality held constant). ✅
- **Fixed-size category floor** (cheapest eighth / oz / 1g) → fine for "what's the floor," accepting it'll be trim.

The honest value engine is therefore **"same item, who's cheapest"** + gas math — not "best $/gram."

## Reproduce
All numbers regenerate from the two saved JSON snapshots. The node scripts used are in this
session's history; key formulas:
- Round-trip gas: `(haversine(origin,store) * 2 / mpg) * gasPrice`
- Break-even spend: `gasCost / (bestDiscountPct / 100)`
- Best price on amount: filter `category` + `weightGrams` in range, sort by `specialPrice ?? basePrice`
