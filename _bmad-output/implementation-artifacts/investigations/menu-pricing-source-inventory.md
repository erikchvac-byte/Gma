# Menu / Product Pricing Source Inventory — Reconnaissance

**Date:** 2026-06-24
**Scope:** Read-only recon of the Dutchie **product menu pricing** path — the data that gives an actual product price (e.g. a pre-roll), which the *specials* feed does NOT contain. Companion to `deal-source-data-inventory.md` (that one covered `GetSpecialMenuCards`). NOT a plan, recommendation, or feasibility judgment.

**Method / provenance:**
- Op name + JSON path first seen in the repo fixture (`__fixtures__/dutchie-specials.json`), then **confirmed by a fresh LIVE capture this session** (2026-06-24) against `kushmart-north` via a throwaway Playwright script reusing `scraper-svc`'s stealth browser + network interception.
- **133 real product objects** captured across 5 categories (Flower, Pre-Rolls, Vaporizers, Edible, Concentrate). One real pre-roll saved as a fixture: `__fixtures__/dutchie-products.json`.
- Field shapes + example values below are from that **real live capture** — not synthesized.

---

## Headline findings (read first)

1. **The menu-pricing operation is `FilteredProducts`**, endpoint `https://dutchie.com/api-4/graphql?operationName=FilteredProducts`, product list at **`data.filteredProducts.products`** (array). It fires on the same embed load the specials scraper already does.

2. **Prices ARE obtainable per product, per weight.** Verified live — example pre-roll:
   `"Mama J's: Alien Rock Candy - PR 2pk"`, `type:"Pre-Rolls"`, `Options:["2g"]`, **`Prices:[8]`** ($8), **`recSpecialPrices:[4]`** ($4 on special), `special:true`, 25 in stock.

3. **The empty-`products` behavior is timing/view-dependent, NOT universal.** The old `the-joint` fixture caught `FilteredProducts` with `products:[]`; this live `kushmart-north` capture got products **on the landing load** and many more as it scrolled/paginated. Takeaway: a single early read can still come back empty (same late-emit hazard as the specials op), so a products scraper needs the **same retry/wait-for-op discipline** as `scrapeDutchieSpecials` — but "empty" is a race, not a wall.

4. **Pagination is real.** The full menu arrives as *multiple* `FilteredProducts` responses (pages of ~10–13), not one payload — 133 products came across many responses as the page scrolled. A full menu scrape must page through, not read one response.

---

## Field table — one `filteredProducts.products[]` object (VERIFIED, live)

Pricing is expressed as **index-aligned parallel arrays** keyed by weight, not a single scalar.

**Alignment verified on multi-option products** (this is the load-bearing fact — base price is safe to read from the self-describing `POSMetaData.children[]`, but **special price lives ONLY in the positional `recSpecialPrices[]`**, so positional alignment must hold):
> `Space Kush Flower`: `Options:["1g","3.5g"]`, `Prices:[11,35]`, `recSpecialPrices:[5.5,17.5]`, `children:[{1g,$11},{3.5g,$35}]`.
> `Super Boof Flower`: `Options:["1g","14g"]`, `Prices:[11,135]`, `recSpecialPrices:[5.5,67.5]`.

`Options[i]` ↔ `Prices[i]` ↔ `recSpecialPrices[i]` line up, **and** `children[]` order matches `Options[]` order. Confirmed across multiple multi-option flower products, not just the single-option pre-roll.

| field | example | meaning / notes |
|---|---|---|
| `Name` | `"Mama J's: Alien Rock Candy - PR 2pk"` | product display name. **⚠ LOAD-BEARING for SPEC-dutchie-product-pricing CAP-5:** pack count ("2pk", "5-pack") often appears ONLY here, not as a structured field — must be parsed out to compute $/item (per-joint). |
| `type` | `"Pre-Rolls"` | **category** — the pre-roll filter key (values seen: Flower, Pre-Rolls, Vaporizers, Edible, Concentrate) |
| `subcategory` | `"singles"` | finer class |
| `Options` | `["2g"]` | weight/size tiers — **parallel array** to the price arrays |
| `Prices` | `[8]` | base price per `Options` index (USD) — `Prices[i]` ↔ `Options[i]` |
| `recPrices` | `[8]` | recreational price per option |
| `medicalPrices` | `[8]` | medical price per option |
| `recSpecialPrices` | `[4]` | **discounted** rec price per option when on special |
| `medicalSpecialPrices` | (array) | discounted medical price per option |
| `wholesalePrices` | (array) | wholesale per option |
| `special` | `true` | whether a special applies (drives special-price relevance) |
| `weight` | `1000` | numeric weight field — **unit uncertain** (option says "2g" but value is 1000; likely per-unit milligrams → 1000mg = 1g/joint × 2pk = 2g total, but UNCONFIRMED). **⚠ LOAD-BEARING for CAP-5:** this unit MUST be reconciled before any $/gram math is trusted; do not assume grams. |
| `brandName` / `brand` | `"mama J's"` | brand |
| `strainType` | `"Indica"` | Indica / Sativa / Hybrid / null |
| `THC` / `THCContent`, `CBD` / `CBDContent` | `null` (this card) | potency; nullable, also richer `cannabinoidsV2`/`measurements` present |
| `Status` | `"Active"` | listing status |
| `Image` / `images` | URL | product image |
| `_id` / `id` | hex | product id |
| `POSMetaData.children[]` | see below | **per-option POS detail** incl. live stock |

### `POSMetaData.children[]` — per-option detail (VERIFIED)
Each child is one purchasable option with its own price + **live inventory**:

| field | example | notes |
|---|---|---|
| `option` | `"2g"` | matches an `Options[]` entry |
| `price` | `8` | price for this option |
| `recPrice` | `8` | rec price |
| `medPrice` | `null` | medical price |
| `quantityAvailable` | `25` | **live stock count** |
| `canonicalCategory` | `"Pre-Roll"` | normalized category (singular) |
| `canonicalName` | `"…- PR 2pk 2g"` | normalized name incl. weight |
| `canonicalImgUrl` | URL | image |

---

## Isolating PRE-ROLLS (VERIFIED)

Filter `products[]` where **`type === "Pre-Rolls"`** (or `POSMetaData.canonicalCategory === "Pre-Roll"`). Confirmed live — that's exactly how the example above was selected out of 133 products.

---

## ⚠ Downstream note — this feeds SPEC-dutchie-product-pricing (CAP-5 / CAP-6)

This recon now backs a spec (`_bmad-output/specs/spec-dutchie-product-pricing/`) whose goal is a **price-comparison engine + longitudinal dataset**, not a price display. Two fields flagged "uncertain" above are therefore **load-bearing, not optional**, for correct unit normalization:

1. **Pack count lives in `Name`** ("2pk", "5-pack"). To compute **$/item (per-joint)**, the pack count MUST be parsed from the name — there is no structured pack field. Unparseable cases must be flagged, never silently treated as quantity 1.
2. **`weight` unit is unresolved** (`weight:1000` for a "2g"/2-pack pre-roll → likely per-unit mg). It MUST be reconciled before **$/gram** math is trusted.

Launch scope for the spec is **Pre-Rolls, Flower, Vaporizers** (all weight/pack-based); comparison normalizes to a **per-category canonical unit** (Flower/Vape $/gram; Pre-Rolls $/gram + $/joint). CAP-6 stores a timestamped observation **every scrape** for change-tracking. None of this is built yet. The ToS/legal posture is a **non-blocking reminder** (per Erik 2026-06-24) — it does not gate R&D / private-dataset implementation; revisit before public/commercial use.

---

## Other product-bearing ops seen (live, for awareness)

The embed fires several product queries; **`FilteredProducts` is the menu workhorse**. Others carry the *same product shape* but a curated subset:
- `GetPersonalizedProducts` / `GetPersonalizedProductsV2` — recommendation rails (~3 products)
- `MenuFiltersV2` — `brands` list (213) + filter facets, **not** products
- `GetMenuSections`, `GetCollectionsNavigation` — category/nav scaffolding
- `ConsumerDispensaries` / `GetAddressBasedDispensaryData` — store metadata + tax config (NOT products; an earlier heuristic briefly mis-flagged `filteredDispensaries` as products — it is not)

---

## Blockers / hazards (vs. the working specials scraper) — UPDATED with live evidence

| hazard | status | detail |
|---|---|---|
| empty `products` on a read | **race, not a wall** | got products on landing this run; but can still be empty if read before the op populates — needs the same `wait_for_pattern=FilteredProducts` + retry as specials |
| pagination | **confirmed real** | full menu = many `FilteredProducts` pages (~10–13 each); must page through (scroll / `page` variables) to get the whole menu |
| late-emit on big menus | likely | same hazard the specials op already has on large stores |
| parallel-array pricing | **confirmed (multi-option)** | `Prices[i]`/`recSpecialPrices[i]` ↔ `Options[i]`, verified on multi-option flower; `children[]` order also aligns. Base price ← `children[].price` (self-describing); special price ← positional `recSpecialPrices[i]` (no special inside `children[]`) |
| Cloudflare / checkpoint | none seen | clean 200s on kushmart-north this session |
| volume / cost | **new consideration** | this is the *entire menu* per store × 21 stores, refreshed on a schedule — far heavier than the specials scrape (a handful of cards/store). A build must weigh fetch volume + storage |
| **legal / ToS posture** | **non-blocking reminder** | materially heavier extraction than the live specials feed — whole-menu pricing **+ live inventory (`quantityAvailable`)** across 21 stores. Per Erik's decision (2026-06-24) this does **NOT** block R&D / private-dataset implementation; revisit before any **public surfacing / redistribution / commercial use**. Recon itself is read-only and unaffected |

---

## Decoupling guarantee for any future build (unchanged)

Stays additive and isolated from the working specials path:
- New module (e.g. `_dutchieProducts.ts`) — does **not** touch `_dutchie.ts`'s `dutchieRequest` / `pickSpecials` / `transformSpecials`.
- Separate scrape request (own `wait_for_pattern=FilteredProducts`) — the specials request's navigation/timing is unchanged.
- New data type (Product), never mutating `Deal` / `filterActiveDeals` / the `/api/data` deals contract.
- Existing **177 server tests** are the regression net proving the specials path is byte-for-byte unchanged.

---

## Capture method (what worked this session — reproducible)
Throwaway script (now removed) that: launched `scraper-svc`'s stealth Chromium, registered a response handler for any `dutchie.com …graphql` JSON, navigated the embed landing (`https://dutchie.com/embedded-menu/kushmart-north`) + scrolled to trigger lazy product pages, captured every `FilteredProducts` response, and saved one `type:"Pre-Rolls"` product. To redo: recreate `scraper-svc/.venv` (`pip install -r requirements.txt` + `playwright install chromium`) and run a short interceptor script — no app code involved.

## Key repo references
- `server/scrapers/__fixtures__/dutchie-products.json` — **the real captured pre-roll product** (this session)
- `server/scrapers/__fixtures__/dutchie-specials.json` — specials fixture that first surfaced the `FilteredProducts` op (empty)
- `scraper-svc/scraper/{browser,interceptor}.py` — stealth browser + interception reused for the capture
- `scraper-svc/scraper/models.py` — `DutchieProduct` model (pre-existing; partially matches — but real keys are `Prices`/`Options`/`recPrices`/`type`, not the model's flat `price`/`weight`/`category`)
- `server/scrapers/_dutchie.ts` — specials transform + retry discipline to mirror
- `server/utils/scraperClient.ts` — typed boundary to the Python service

## External sources (graded external)
- Apify Dutchie scraper output schema — https://apify.com/tfmcg3/dutchie-dispensary-scraper/api/openapi
- Dutchie Plus GraphQL (partner-gated) — https://plus.dutchie.com/plus/2021-07/graphql
