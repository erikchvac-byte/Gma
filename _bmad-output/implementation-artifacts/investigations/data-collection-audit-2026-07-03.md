# Data Collection & Insight Audit — 2026-07-03

**Scope:** Audit of current state only (per `C:\Users\erikc\Dev\Scrap\Data_Collection_Audit.md`). No redesign, no proposals.

## Status legend

- **Yes** — collected/derived and served today.
- **Partial** — the required source data is collected and sufficient, but the metric is **not derived anywhere** (or is derived only for a narrower consumer). "Derivable" below always means: computable from committed data with no new scraping.
- **No** — required source data is missing from collection.

## Storage model (context for every "Evidence" cell)

There is **no database**. Two committed JSON files are the datastore:

| File | Contents | Cadence | Evidence |
|---|---|---|---|
| `server/data/data.json` | 18 stores × deal banners (`type`, `description`, `discountPct`, `specialType`, day/time windows) + store identity (`address`, `lat`/`lng`, `url`), `meta.gasPrice` | Hourly Actions cron → `/api/ingest` (`.github/workflows/scrape-ingest.yml`) | `client/src/types/index.ts` (Deal/Dispensary), `server/routes/ingestRoute.ts` |
| `server/data/products.json` | Longitudinal product-price dataset: **3,634 products, 24 stores, 377 brands, 23,760 observations across 10 daily scrapes (2026-06-24 → 2026-07-03)**; 3,311 records have ≥2 observations | Daily 08:00 UTC commit-back (`.github/workflows/scrape-products.yml`); Weedmaps stores via residential runner (`scripts/scrape-weedmaps-local.ps1`) | `server/types/index.ts` (ProductRecord/ProductObservation), `server/utils/productsStore.ts` (append-only CAP-6) |

Per product observation: `basePrice`, `specialPrice`, `pricePerGram`, `specialPricePerGram`, `pricePerItem` ($/joint), `quantityAvailable`, `special` flag, per weight option (`server/utils/normalizeProduct.ts`).

**Two systemic gaps that recur below (state once, referenced throughout):**

- **G1 — No potency data.** The extractor (`server/scrapers/_dutchieProducts.ts` `RawDutchieProduct` interface) reads no THC/CBD fields. Nothing potency-related exists anywhere in the dataset.
- **G2 — Category scope.** Only `Flower`, `Vaporizers`, `Pre-Rolls` are collected (`DEFAULT_PRODUCT_CATEGORIES`, `_dutchieProducts.ts:18`). Edibles, Concentrates, Topicals, Drinks are dropped at extraction.
- **G3 — No aggregate/diff engine.** Grep of `server/` finds zero code computing averages, trends, diffs, or new/removed detection. The only derived analytics are the disparity matcher and deal-scope bridge (below).

**What IS derived today (the complete list):**

1. **Cross-store price disparities** — same product, same canonical weight, ≥2 stores → low/high/spread/spreadPct, cheapest-store-per-product, sold-out offers excluded. `server/utils/crossStoreValue.ts` + `productMatchKey.ts`, served at `GET /api/value/disparities` (`server/routes/valueRoute.ts`).
2. **Deal→SKU scope links** — which SKUs a banner covers, with temporal window. `server/utils/dealScope.ts`, `GET /api/value/deal-scope`.
3. **Store freshness status** (`ok|stale|failed`) — `server/utils/storeStatus.ts`.
4. **Client-side per-store trip math** — haversine distance from user GPS/ZIP (`client/src/utils/withUserDistance.ts`) + round-trip gas cost (`gasCost.ts`), discount tier buckets and deal grouping (`dealView.ts`).

---

## 1. Price Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Average price per brand | Partial | Derivable (brand + prices on every record); not computed (G3) | High |
| Average price per dispensary | Partial | Derivable; not computed (G3) | High |
| Average price per city | Partial | No `city` field; city is parseable from `Dispensary.address` strings (deal stores) / geocoded registry; nothing computed | Medium |
| Cheapest store for each brand | Partial | Derivable; not computed (G3) | High |
| Cheapest store for each product | **Yes** | Disparity engine: `storesCarrying` sorted by price, `lowPrice` = cheapest in-stock store per (product, weight), for products carried by ≥2 stores. `crossStoreValue.ts:107-137` | High |
| Cost per gram | **Yes** | `pricePerGram`/`specialPricePerGram` stored in every observation, `normalizeProduct.ts:107-110`; fractional-oz correct per ADR-054 | High |
| THC per dollar | No | G1. Missing: potency fields from FilteredProducts payload (not extracted) | High |
| mg THC per dollar (edibles) | No | G1 + G2 (edibles not scraped at all) | High |
| Average discount depth | Partial | Real per-SKU depth derivable from `basePrice` vs `specialPrice` history; not computed. Caveat: banner `discountPct` is a flat store promo rate with no per-item signal (fix6 verdict) | High |
| Most discounted brands | Partial | Derivable from `special`/`specialPrice` history per brand; not computed | High |
| Brands rarely discounted | Partial | Same as above | High |
| Daily price changes | Partial | 10 daily snapshots in history; **no diff computation exists** (known open item: "price-change across DAILY runs not done") | High |
| Weekly trends | Partial | Data now spans ~1.4 weeks — computable for exactly one week-over-week point; no computation | High |
| Monthly trends | No | Dataset starts 2026-06-24; a month of history does not exist yet (accruing automatically) | High |
| Historical pricing | **Yes** | Append-only `ProductObservation[]` per product, commit-back durable, `productsStore.ts` | High |

## 2. Inventory Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Total products | **Yes** | `totalRecords` in every `/api/value/disparities` response (`MatchReport`); full dataset at `/api/products` | High |
| Total brands | Partial | Derivable (377 distinct today); not computed | High |
| Product counts by category | Partial | Derivable (Flower 1,242 / Vaporizers 1,445 / Pre-Rolls 947); not computed; G2 limits to 3 categories | High |
| Category diversity | Partial | Only meaningful within the 3 scraped categories (G2) | High |
| Largest inventory | Partial | Derivable by grouping `dispensaryId`; not computed | High |
| Inventory by dispensary | Partial | Same | High |
| Inventory growth over time | Partial | First-seen date = `history[0].observedAt`; per-day presence inferable. Caveat: a missed scrape (workflow is `continue-on-error`) is indistinguishable from a delisting in any single run | Medium |

## 3. Brand Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Brand availability by store | Partial | Derivable (brand × dispensaryId on every record); not computed | High |
| Brand exclusivity | Partial | Derivable (brands with exactly 1 carrying store); not computed | High |
| Brand popularity | No | No demand signal collected (no sales, views, or user data). Carriage count is the only weak proxy. Missing: any popularity source | High |
| Local brands | No | No brand-origin metadata collected. Missing: brand location data | High |
| New brands | Partial | Derivable (earliest observation across a brand's records); not computed | High |
| Removed brands | Partial | Derivable (brand's latest observation older than latest scrape); not computed; same missed-scrape ambiguity as §2 | Medium |
| Average brand pricing | Partial | Derivable; not computed | High |
| Brand sale frequency | Partial | Derivable (`special` flag per observation per brand); not computed | High |

## 4. Product Availability

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| New products | Partial | First-seen derivable from history; no detector (G3) | High |
| Removed products | Partial | Inferable (record stops accruing observations — records are never deleted); no detector; missed-scrape ambiguity | Medium |
| Restocked products | Partial | `quantityAvailable` history per option supports 0→positive detection; no detector. Weedmaps items may not carry quantity | Medium |
| Sold-out products | **Yes** (narrow) | `quantityAvailable <= 0` is detected and acted on in the disparity engine (Gate 4, `crossStoreValue.ts:83-88`); no standalone sold-out feed | High |
| Product lifetime | Partial | Derivable (first↔last observation span); not computed | High |
| Seasonal inventory | No | 10 days of history; seasons require months (accruing) | High |

## 5. Deal Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Best deal today | Partial | Active-deal filtering + discount tiers + per-store grouping exist client-side (`filterActiveDeals`, `dealView.ts`); no single "best" ranking. Honesty constraint: banner % is a flat promo rate (fix6) so a %-based ranking would be dishonest | High |
| Biggest savings | Partial | Cross-store savings ARE computed and ranked (`spread`/`spreadPct`, sorted desc) at `/api/value/disparities`; no deal-banner savings ranking | High |
| Effective sale price | **Yes** | Observed `specialPrice` per option is the price-of-record (`specialPrice ?? basePrice`, Gate 3) | High |
| Stackable discounts | No | No stacking data exists in any source payload we read | High |
| Coupon comparisons | No | No coupon data collected. Missing: coupon source | High |
| Hidden deals | Partial | Deal→SKU bridge (`dealScope.ts`) reveals which SKUs a banner actually covers; disparities surface un-advertised cross-store value. No feature labeled "hidden deals" | Medium |

## 6. Geographic Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Cheapest city | Partial | Prices per store + address/lat-lng per store exist; no city field, nothing computed | Medium |
| Most expensive city | Partial | Same | Medium |
| Savings by travel distance | Partial | Round-trip gas cost per store is computed and displayed (`gasCost.ts`, user GPS/ZIP distance via `withUserDistance.ts`, ADR-057/058); not joined with product-price savings | High |
| Distance vs savings | Partial | All inputs exist (disparity spread + store lat/lng + user location + gas math); the join is not computed anywhere | High |
| Regional pricing comparisons | Partial | Derivable (lat/lng + prices); not computed | High |

## 7. Category Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Store with most flower | Partial | Derivable; not computed | High |
| Store with most concentrates | No | G2 — Concentrates dropped at extraction | High |
| Store with most edibles | No | G2 — Edibles dropped at extraction | High |
| Cheapest flower | Partial | $/g stored per flower SKU; note: a whole-catalog $/g leaderboard is **deliberately forbidden** (structurally surfaces trim — `crossStoreValue.ts` Gate 2 comment); same-product comparisons exist via disparities | High |
| Cheapest concentrates | No | G2 | High |
| Cheapest prerolls | Partial | `pricePerItem` ($/joint) stored per pre-roll observation; no leaderboard | High |
| Strongest products | No | G1 | High |

## 8. THC / CBD Analytics

All seven items (average THC, highest THC, average CBD, THC by category/brand/dispensary, THC per dollar): **No**. G1 — no potency field is extracted anywhere (`_dutchieProducts.ts` reads none; `_weedmaps.ts` reads none). **Missing data:** potency values from the source payloads (Dutchie FilteredProducts responses carry potency fields that are currently ignored — availability in payload: Medium confidence; absence from our dataset: High confidence).

## 9. Consumer Search Intelligence

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Cheapest carts | Partial | Vaporizers collected with $/g and prices; data supports the query; no search API/UI (raw `/api/products` only) | High |
| Flower under a target price | Partial | Same — data supports, no query surface | High |
| High-CBD products | No | G1 | High |
| Live rosin | Partial (weak) | Concentrates not scraped (G2), but "live rosin" **cartridges** appear under Vaporizers and product `name` text is searchable | Medium |
| Sleep-focused edibles | No | G2 (no edibles) + no effect/terpene data collected | High |
| Brand-specific shopping | Partial | `brand` on every record (377 brands, incl. Weedmaps slug-recovery `_weedmaps.ts:164`); no consumer search surface | High |

## 10. Market Trends

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Price increases / decreases | Partial | 10 daily snapshots support it; no diff engine (G3) | High |
| Inventory growth | Partial | Derivable; not computed | High |
| New brands entering | Partial | Derivable; not computed | High |
| Brand disappearance | Partial | Derivable; not computed; missed-scrape ambiguity | Medium |
| Product mix changes | Partial | Within the 3 scraped categories only (G2) | High |
| Seasonal trends | No | ~10 days of history | High |

## 11. Brand Comparison

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Stores carrying each brand | Partial | Derivable; disparity `storesCarrying` is per-product, not rolled up per-brand | High |
| Average price | Partial | Derivable; not computed | High |
| Lowest price | Partial | Per-product lowest is computed (disparities, ≥2-store products); per-brand is not | High |
| Highest discount | Partial | Per-SKU real discount derivable from base-vs-special history; banner % is flat (fix6) — no computation | High |
| Geographic availability | Partial | brand × store × lat/lng all present; not computed | High |

## 12. Hidden Gem / Value Metrics

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| Hidden Gem Score | No | No score code exists | High |
| Value Score | No | Same. Note: value-engine work was explicitly **stopped pending go-ahead** (fix6 verdict, 2026-06-25); at that time history was day-0 — it now has 10 daily points, so "vs own median" math is becoming honest | High |
| Deal Quality Score | No | No score code; banner % carries no per-item signal (fix6) | High |
| Best Value rankings | Partial | The one live value ranking: disparities sorted by `spreadPct` desc at `/api/value/disparities` | High |

## 13. Inventory Health

All six items (growth, shrinkage, new products, removed products, price movement, new brands): **Partial** — the append-only history contains everything needed, and nothing computes any of them (G3). Same evidence as §2/§4/§10; missed-scrape ambiguity applies to shrinkage/removal (Medium confidence there, High elsewhere).

## 14. Daily AI Summary

| Item | Status | Evidence / Missing Data | Conf. |
|---|---|---|---|
| New products today | Partial | Data sufficient (compare latest two scrape days); no generator | High |
| Removed products today | Partial | Data sufficient with missed-scrape caveat; no generator | Medium |
| Average price movement | Partial | Data sufficient; no generator | High |
| New promotions | Partial | Deal banners refresh hourly with timestamps, but data.json is overwritten per ingest — **no deal history is retained**, so "new today" requires comparing against something we don't keep. Products' `special` flag history covers SKU-level promos | High |
| Inventory changes | Partial | Data sufficient; no generator | High |
| Best deals | Partial | Disparity ranking exists; deal-banner ranking constrained by fix6 | High |
| Market summary | No | No summarization capability exists; data covers 3 categories, no potency, ~10 days depth | High |

---

## One-paragraph verdict

Collection is strong and honest for what it targets: per-SKU base/special prices with unit economics ($/g, $/joint), stock quantity, brand, strain type, per-option weight, across 24 stores × 3 categories, append-only daily since 2026-06-24, plus hourly deal banners with temporal windows for 18 stores. Derivation is thin by design: exactly two analytical consumers exist (cross-store disparities, deal→SKU scope links) and zero aggregate/trend/diff code. The hard collection gaps are **potency (G1)**, **edibles/concentrates (G2)**, **deal-banner history (overwritten hourly)**, and **any demand/popularity signal**; everything else in the audit is a computation gap over data already accruing.
