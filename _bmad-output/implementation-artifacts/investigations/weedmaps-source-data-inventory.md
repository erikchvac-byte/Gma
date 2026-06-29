# Weedmaps Source Data Inventory — Reconnaissance

**Date:** 2026-06-28
**Scope:** Read-only recon + **live verification** of Weedmaps as a candidate deal/product source. Establishes whether Weedmaps product data is scrapeable without a browser, and maps the exact fields available per product. NOT a plan, recommendation, or feasibility judgment to ship.

**Context:** Triggered by `unverifyed-dispensary-findings.md` (web-research pass proposing Weedmaps as a static-HTML scrape source). This doc verifies that file's central technical claim against the live site. Weedmaps is **not** currently wired into this repo — today's sources are 20 Dutchie embeds + 1 static site (`remedy-tulalip`); see `deal-source-data-inventory.md`.

**Method / provenance:**
- **Live-probed this session:** plain HTTP `GET` (curl, custom desktop UA, follow-redirects) of `https://weedmaps.com/dispensaries/western-bud-skagit-valley-wa` — **no browser, no JS execution.**
- Field shapes + population counts taken from the **live `__NEXT_DATA__` JSON** in that response (single fetch, 24 products).
- Single sample store, single fetch, single IP. Pagination depth, sale-window behavior, and scaled-crawl behavior are **inferred, not load-tested** (see Uncertain).

---

## VERDICT — central claim CONFIRMED

`unverifyed-dispensary-findings.md` claimed "Weedmaps renders full product data in static HTML." **True for this store.** A plain `GET` returns **HTTP 200, 782 KB**, with product data present two ways:

1. **Server-rendered DOM cards** — 24 cards with real `data-testid` hooks (`menu-item-title`, `menu-item-brand`, `menu-item-category`, `price`, `weight-label`, rating). CSS class names are build-hashed (`gvOpbK`…) → **brittle scrape target.**
2. **`__NEXT_DATA__` JSON blob** (~369 KB) — React Query dehydrated cache at `props.dehydratedState.queries[].state.data.data.menuItems`. **Clean, stable scrape target — prefer this over the DOM.**

Cross-check: prices in the JSON match the findings file exactly (Golden Pineapple $50, Galactic Glue 28g $312, Jack Herer 1g $14) → that file's data was real, not invented.

**Implication:** Weedmaps is reachable via the existing `static-html` source TYPE (axios + parse), same path as `remedy-tulalip`. **No Playwright / `scraper-svc` required** for the fetch itself.

---

## SOURCE PROFILE — candidate TYPE 3 `weedmaps-static-json`

- **type (proposed):** `weedmaps-static-json`
- **access:** `https://weedmaps.com/dispensaries/<slug>` (301-redirects `/menu` suffix → bare dispensary URL; follow redirects). Per-category/paginated URLs needed for full depth.
- **fetch:** `static` — axios GET + JSON extract. A desktop browser UA returned 200; the page contains a `captcha` **script reference** but it did **not** challenge this request.
- **container:** regex/parse `<script id="__NEXT_DATA__">…</script>` → JSON → `props.dehydratedState.queries[].state.data.data.menuItems` (array). Fall back to DOM `data-testid` hooks only if the JSON path moves.

### Field table — one `menuItems[]` object

Population = how many of the 24 products in the single live fetch had the field filled.

| field | location (JSON path) | example value | populated | notes / nullable? |
|---|---|---|---|---|
| product name | `name` | `"Golden Pineapple \| Big Buds"` | 24/24 | strain + sub-category in one string |
| strain type | `category.name` | `"Indica"` | 24/24 | Indica / Sativa / Hybrid |
| genetics | `geneticsTag.name` | `"Sativa"` | most | secondary strain descriptor |
| category hierarchy | `edgeCategory` (+ `.ancestors`) | `Big Buds → Flower` | 24/24 | full product-category tree |
| price (per weight) | `price` | `{unit, quantity, label, complianceNetMg, price, onSale, originalPrice, discountLabel}` | 24/24 | structured; one selected tier |
| all weight tiers | `prices.<unit>[]` | `[{label:"1/8 oz", price:50, gramUnitPrice:…}]` | 24/24 | multiple weights per product |
| **$/gram normalized** | `prices.<unit>[].gramUnitPrice` (+ `prices.gramsPerEighth`) | per-gram float | **22/24** | **Weedmaps pre-computes this** — feeds value engine |
| sale flag | `price.onSale` | `false` | **0/24 true** | schema supports per-SKU sale; none active at fetch time |
| original (pre-sale) price | `price.originalPrice` | `50` | 24/24 | equals `price` when not on sale |
| discount label | `price.discountLabel` | `null` | **0/24** | populates only when on sale |
| deal linkage | `dealIds` / `currentDealTitle` | `[]` / `null` | **0/24** | per-SKU → deal id map; empty at fetch time |
| THC / CBD / CBN / CBG | `metrics.aggregates.{thc,cbd,cbn,cbg}` (+ `metrics.cannabinoids[]`) | `{thc:0,…}` | **~0/24** | schema present, **lab data unpopulated for this store** |
| terpenes | `metrics.terpenes[]` / `aggregates.terpenes` | `[]` / `0` | 0/24 | empty for this store |
| rating / reviews | `rating` / `reviewsCount` | `4.9` / `21` | 4/24 | sparse |
| brand | `brand` | `null` | **0/24** | **JSON field empty** — brand is in the DOM card + the `slug` |
| product slug | `slug` | `phat-panda-flower-golden-pineapple-burl-…` | 24/24 | brand recoverable from here |
| orderable | `isOnlineOrderable` | `true` | 24/24 | |
| license type | `licenseType` | `"recreational"` | 24/24 | |
| compliance net | `price.complianceNetMg` | `3500` | 24/24 | mg per selected tier |
| price stats | `priceStats` | `{min:null,max:null}` | 0/24 | null in sample |

### Raw captured sample — one real `menuItems[]` object (selected fields)
Provenance: live `__NEXT_DATA__` from `western-bud-skagit-valley-wa`, fetched **2026-06-28** (no browser).

```json
{
  "name": "Golden Pineapple | Big Buds",
  "brand": null,
  "category": { "id": 1, "name": "Indica", "slug": "indica" },
  "geneticsTag": { "name": "Sativa", "uuid": "edcefa08-…" },
  "edgeCategory": { "name": "Big Buds", "slug": "big-buds",
                    "ancestors": [{ "name": "Flower", "slug": "flower" }] },
  "price": { "unit": "ounce", "quantity": "1/8", "label": "1/8 oz",
             "complianceNetMg": 3500, "price": 50,
             "onSale": false, "originalPrice": 50, "discountLabel": null },
  "prices": { "gramsPerEighth": 3.5,
              "ounce": [{ "label": "1/8 oz", "price": 50, "gramUnitPrice": 14.28, "units": "1/8" }] },
  "currentDealTitle": null,
  "dealIds": [],
  "metrics": { "cannabinoids": [], "terpenes": [],
               "aggregates": { "thc": 0, "cbd": 0, "cbn": 0, "cbg": 0 } },
  "rating": 4.9, "reviewsCount": 21,
  "isOnlineOrderable": true, "licenseType": "recreational",
  "slug": "phat-panda-flower-golden-pineapple-burl-ec6ed95b-…"
}
```

---

## FIELD-CLAIM RECONCILIATION vs `unverifyed-dispensary-findings.md`

| findings-file claim | live verdict |
|---|---|
| Brand name | ⚠️ **In DOM/slug, NOT the JSON `brand` field** (null) |
| Product name | ✅ |
| Sub-category / Category | ✅ (`edgeCategory` hierarchy) |
| Weight / unit | ✅ (`price.label`/`quantity`/`unit`, all tiers in `prices`) |
| Price | ✅ |
| Sale price (when active) | ✅ schema (`onSale`/`originalPrice`/`discountLabel`) — **0/24 active now; time-gated** |
| THC% / CBD% | ⚠️ schema exists, **effectively unpopulated** for this store (all 0) |
| Strain type | ✅ (`category.name` + `geneticsTag`) |
| "~18 products per page before truncation" | ✏️ **24** per fetch; one page = one category slice (here all Flower: 17 Big Buds + 7 Smalls) |
| "1,543 products" full menu | ✅ plausible, but needs category traversal + pagination (many requests/store) |

**Bonus fields the findings file did not mention:** `gramUnitPrice` (per-gram normalization), `dealIds`/`currentDealTitle` (per-SKU deal linkage), `complianceNetMg`, multi-tier `prices`, `rating`/`reviewsCount`, `slug`, `isOnlineOrderable`.

---

## RELATIONSHIP TO EXISTING SOURCES (fact, not recommendation)

- **Richer pricing than Dutchie.** Dutchie embeds expose only banner specials (`menuDisplayName` free text, no numeric discount, no per-SKU price — see `deal-source-data-inventory.md` TYPE 1). Weedmaps exposes **per-SKU list price, per-weight tiers, per-gram unit price, and a sale flag** → directly addresses the value-engine gap logged in `investigations/fix6-basePrice-verdict.md`.
- **Does NOT rescue the 3 broken Dutchie stores.** `cannazone-mt-vernon`, `bud-hut-camano-island`, `starbuds-bellingham` (epoch/never-fetched on Dutchie) are all listed "no Weedmaps menu" in the findings file → no overlap relief.
- **Roster overlap.** Findings' Weedmaps-scrapeable list overlaps stores already in `data.json` (2020 Solutions ×2, Remedy, Happy Time). The findings file's "NO ACCESSIBLE MENU DATA" label is **source-relative** — several of those (e.g. Happy Time) are already scraped fine via Dutchie at `status=ok`.

---

## Uncertain / not yet verified

- **Sale & deal population is time-gated.** All `onSale`/`discountLabel`/`dealIds`/`currentDealTitle` were empty at fetch time. Western Bud's model is timed (e.g. "25% off 8–10am"); capturing sale prices requires fetching **during the deal window** — unconfirmed that they populate then.
- **THC/CBD reliability.** Sparse-to-absent for this store; unknown whether other stores supply lab data.
- **Pagination contract.** The category/page URL scheme and total request count per full menu are not mapped — single fetch returned one category slice (24, all Flower).
- **Scaled-crawl behavior.** One request from one IP succeeded; the `captcha` script reference did not fire. Rate-limiting / bot-challenge under a repeated nightly crawl is **untested** and the primary deployment risk.
- **`brand` field.** Null in JSON for all 24; recovery from DOM/slug is reliable here but not proven across stores/categories.

---

## Key references
- `unverifyed-dispensary-findings.md` (repo root) — the web-research pass this doc verifies
- `_bmad-output/implementation-artifacts/investigations/deal-source-data-inventory.md` — existing Dutchie + static source inventory (TYPE 1 / TYPE 2)
- `_bmad-output/implementation-artifacts/investigations/fix6-basePrice-verdict.md` — value-engine gap this source could fill
- `server/scrapers/remedy-tulalip.ts` — existing `static-html` axios/cheerio pattern (closest fetch analogue)
