# Dispensary Research Findings — 98274 / 50-Mile Radius
## Date: June 28, 2026 | Source: Weedmaps, Leafly, store websites

> **Superseded note (2026-07-02):** for scrapeable-store ground truth this doc is superseded by
> the **Phase-2 Weedmaps private registry** (PR#44, merged 2026-06-29), which wired 8 net-new
> WA-geocoded stores + 3 overlaps from this recon into the production scrape path. Deal/brand/price
> rows below were manually observed in-session and are **not per-row sourced** — treat as leads,
> not verified facts. (Filename history: lived at repo root as `unverifyed-dispensary-findings.md`.)

---

## STORES WITH LIVE SCRAPEABLE MENUS (Weedmaps static HTML)

| Store | City | Mi from 98274 | Products | URL Slug |
|---|---|---|---|---|
| Western Bud | Burlington | 6 | 1,543 | western-bud-skagit-valley-wa |
| Caravan Cannabis | Burlington | 7 | 1,051 | caravan-cannabis-company-skagit-county |
| Kaleafa Cannabis | Oak Harbor | 15 | Live | kaleafa-cannabis-company |
| 210 Cannabis Company | Arlington | 19 | Live | 210-cananbis-company |
| PRC Arlington | Arlington | 19 | 1,384 | 221-inc |
| Northwind Cannabis | Anacortes | 13 | Live | northwind-cannabis |
| 2020 Solutions Pacific Hwy | Bellingham | 22 | Live | 2020-solutions-pacific-highway |
| 2020 Solutions Mt Baker Hwy | Bellingham | 25 | Live | 2020-solutions-recreational-north-bellingham |
| One Hit Wonder Cannabis | Bellingham area | ~25 | Live | one-hit-wonder-cannabis |
| Remedy Tulalip | Tulalip | 30 | Live | traditional-biologics-company-dba-remedy-tulalip |
| A Greener Today - Lynnwood | Lynnwood | ~50 | Live | puget-sound-marijuana-recreational-21 |
| Euphorium - Lynnwood | Lynnwood | ~50 | Live | euphorium-2-2 |

---

## STORES WITH NO ACCESSIBLE MENU DATA

| Store | City | Reason |
|---|---|---|
| Floyd's Cannabis | Mount Vernon | Dutchie JS-gated |
| Happy Time Weed | Mount Vernon | Dutchie JS-gated + bot block |
| Cannazone Old Hwy 99 | Mount Vernon | Unclaimed, no menu |
| Forbidden Cannabis Club | Mount Vernon | No Weedmaps menu |
| Cloud 9 Cannabis | Mount Vernon | No Weedmaps menu |
| PRC Conway | Conway | No Weedmaps menu |
| High Society | Anacortes | No Weedmaps menu |
| Western Bud Anacortes | Anacortes | No Weedmaps menu |
| Cannazone Bellingham | Bellingham | No Weedmaps menu |
| The Kushery Stanwood | Stanwood | No Weedmaps menu |
| Bud Hut Camano Island | Camano Island | No Weedmaps menu |
| Piece of Mind Cannabis | Bellingham | No Weedmaps menu |
| 2020 Solutions Iron St | Bellingham | No Weedmaps menu |
| Trippy Hippie Cannabis | Bellingham | No Weedmaps menu |
| Trove Cannabis | Bellingham | No Weedmaps menu |
| Star Buds Bellingham | Bellingham | No Weedmaps menu |
| Caravan Cannabis Bellingham | Bellingham | No Weedmaps menu |
| Dank Of America | Bellingham | No Weedmaps menu |
| Cannabis Connection | Bellingham | No Weedmaps menu |
| West Coast Wellness | Bellingham | No Weedmaps menu |
| Island Herb | Whidbey Island | No Weedmaps menu |
| Floyds Everett | Everett | No Weedmaps menu |
| Bud Hut Everett | Everett | No Weedmaps menu |
| White Rabbit Cannabis | Snohomish | No Weedmaps menu |
| The Kushery Cathcart | Snohomish | No Weedmaps menu |
| Marijuana Mercantile | Bellingham area | No Weedmaps menu |

---

## DATA FIELDS AVAILABLE IN WEEDMAPS STATIC HTML

All 12 scrapeable stores expose these fields per product:
- Brand name
- Product name
- Sub-category (Big Buds / Smalls / Joints / Cartridge / etc.)
- Category (Flower / Pre-roll / Infused Pre-roll / Vape / Concentrate / Edible / Drink / Wellness)
- Weight / unit
- Price
- Sale price (when active)
- THC%
- CBD%
- Strain type (Indica / Sativa / Hybrid)

URL pattern: `weedmaps.com/dispensaries/{slug}/{category}`
Categories: flower, pre-roll, infused-pre-roll, vape-pens, concentrates, edibles, beverages, wellness, gear, cultivation

---

## OBSERVED DEAL STRUCTURES (source not recorded per row)

| Store | Deal | Window |
|---|---|---|
| Western Bud | 25% off storewide, min $20 | Daily 8–10am and 9:30–11:30pm |
| Northwind Cannabis | 25% off all online orders | Standing / always on |
| Kaleafa Oak Harbor | 15% off rotating category daily + 20% happy hour | See schedule below |
| Happy Time MV | 30% off all online orders + 3 happy hour windows | Standing + open–10am, 2–4pm, 9pm–close |

**Kaleafa daily category schedule:**
- Mon: Budtender's Choice
- Tue: Any one item
- Wed: 7g+ flower
- Thu: All beverages
- Fri: Edibles + pre-rolls
- Sat: Extracts + vape cartridges
- Sun: CBD / topicals / tinctures

---

## OBSERVED CROSS-STORE BRAND MATCHES (brands stocked at 2+ stores with live menus; source not recorded per row)

| Brand | Confirmed Stores |
|---|---|
| Phat Panda | Western Bud, Kaleafa, Northwind, PRC Arlington |
| Artizen Cannabis | Western Bud, Kaleafa, PRC Arlington |
| Avitas | Western Bud, Caravan Cannabis |
| Sweetwater Farms | Caravan Cannabis, Kaleafa network |
| 2727 | Western Bud, Caravan Cannabis |
| Ooowee | Western Bud, Caravan Cannabis |
| Skagit Organics | Western Bud (Anacortes), regional |
| WYLD | Northwind, Kaleafa, regional |
| Freddy's Fuego | Northwind, PRC Arlington, Kaleafa |
| Dabstract | Northwind, regional |

---

## OBSERVED PRICE COMPARISONS (same SKU, multiple stores; source not recorded per row — note `unconfirmed`/`est.` cells)

| Product | Brand | Weight | Western Bud | Kaleafa | PRC Arlington |
|---|---|---|---|---|---|
| Golden Pineapple \| Big Buds | Phat Panda | 1/8 oz | $50.00 | ~$50.00 | unconfirmed |
| OG Chem \| Bong Buddies | Phat Panda | 2g | $8.40 (sale/$14) | $9.80 (sale/$14) | unconfirmed |
| Bong Buddies Durban Poison | Phat Panda | 2g | unconfirmed | $9.80 (sale/$14) | unconfirmed |
| Bong Buddies Granddaddy Purple | Phat Panda | 2g | unconfirmed | $9.80 (sale/$14) | unconfirmed |
| Jack Herer \| Flower | Artizen Cannabis | 1g | $14.00 | $11.00 | $11.00 (est.) |
| Galactic Glue \| Flower | Artizen Cannabis | 28g | $312.00 | unconfirmed | unconfirmed |
| Limonada Pre-Roll | Avitas | 0.75g | $5.00 | unconfirmed | unconfirmed |
| Dragon OG Pre-Roll | Avitas | 0.75g | $5.00 | unconfirmed | unconfirmed |
| Durban Poison | Sweetwater Farms | 3.5g | unconfirmed | $47.00 (Caravan) | unconfirmed |
| Blueberry Trainwreck | Sweetwater Farms | 3.5g | unconfirmed | $47.00 (Caravan) | unconfirmed |

---

## SCRAPER ARCHITECTURE FINDING

Weedmaps renders full product data (all 10 fields) in static HTML per category page. Each page returns ~18 products before truncation. A full menu pull requires looping all category subpages per store. Western Bud alone has 1,543 products across 10 categories. Manual fetching in chat is not viable for full inventory depth. A Playwright or Cheerio scraper targeting `weedmaps.com/dispensaries/{slug}/{category}` retrieves complete data programmatically.

Dutchie-hosted stores (Floyd's, Happy Time) require GraphQL API: `api.dutchie.com/graphql` with retailer ID — not available via HTML scraping.

