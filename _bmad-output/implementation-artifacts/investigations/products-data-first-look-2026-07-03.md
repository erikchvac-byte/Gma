# What 10 Days of products.json Already Shows — 2026-07-03

**Input:** `server/data/products.json` — 3,634 products, 24 stores, 377 brands, 23,760 observations, 2026-06-24 → 2026-07-03. Analysis script: session scratchpad (read-only, nothing committed). Companion to `data-collection-audit-2026-07-03.md`.

## Coverage first (caveat that scopes everything below)

- 16 Dutchie stores: full 10/10 days.
- 8 Weedmaps-fed stores (remedy-tulalip, western-bud-burlington, kaleafa-oak-harbor, 210-cannabis-arlington, prc-arlington, northwind-anacortes, a-greener-today-lynnwood, euphorium-lynnwood): **3 days only** (06-30 → 07-02). ⚠️ Their latest observation is 07-02 — worth confirming the nightly residential runner fired on 07-03.
- Scrape-miss noise (paginated menus, `continue-on-error`) inflates both "new" and "dormant" counts; treat churn figures as upper bounds.

## Finding 1 — List prices are sticky; ALL the movement is specials

- Median week-over-week per-SKU effective-price drift: **0.00%** in all three categories (n=1,431 option-pairs spanning ≥7 days).
- 17.8% of SKUs changed effective price at least once in 10 days (589 of 3,311 twice-observed records; 827 change events).
- **Ups outnumber downs 697 : 130** — that asymmetry is specials *ending* (price snaps back up), not inflation. Example: cannazone-old-hwy-99 ran what looks like a storewide ~50%-off day on 06-24 — dozens of SKUs exactly doubled on 06-25 ($6→$12, $25→$50, $29→$58…). Top mover: Triangle Kush 1/2oz at local-roots, $12.50→$40 (+220%) overnight.
- **Implication:** "daily price change detection" is really **special started / special ended detection**. That's buildable and valuable *today*; a list-price trendline needs months, not weeks.

## Finding 2 — The flat-promo signature is confirmed at dataset scale (fix6 vindicated)

- Real per-SKU discount depth (base vs special, 20,310 discounted option-observations): median 40%, p75 = p95 = **exactly 50%**.
- A dozen brands average exactly 50.0% depth — flat brand/store promo rates, not per-item pricing decisions.
- Store special-share is **bimodal**: stores sit at 0–7% (sweet-relief, cannazone-bellingham, 210-cannabis, euphorium…) or 82–100% (local-roots, kush21, jet 97%, northwind, AGT-lynnwood, kushmart 82%, 2020-solutions ~83%). Almost nothing in between.

## Finding 3 — Brand discount personas are already answerable

- **Always on special** (>95% of observations, n≥30): 15 brands incl. Pastime (327 obs), HighTide (311), K Savage, Clout King, Legit, Stingers, Hustler's Ambition, SUBX — for these, the "special price" IS the price; the base price is decorative.
- **Never discounted** (n≥30): Zodiac (134 obs), Raging Goat, Freedom Farms, Bo Gardens, Super Dank Labs, Brc — a real "rarely discounted" list exists after just 10 days.
- This answers audit §3 "most discounted / rarely discounted brands" with committed data.

## Finding 4 — Menu churn is high

- ~100–160 genuinely new products appear per day (1,346 first-seen after baseline in 9 days); 1,033 records have gone dormant (unseen for ≥2 subsequent store-scrape days).
- Even discounted for scrape-miss noise, menu turnover is fast enough that new-arrival and product-lifetime feeds would have daily content.

## Finding 5 — Disparities more than doubled with the Weedmaps stores

`buildMatchReport` live today: **177 disparities** (was 76 at A1 ship), 3,108 of 3,634 records placed, 525 excluded by honesty flags, 1 unmatched. Top spreads are dramatic and real: same 1g Dabstract $22.50 vs $70 (+211%, 4 stores); Golden Pineapple 7g $27.50 vs $80 (+191%); Bong Buddies 2g $9 vs $25 across 8 stores.

## Finding 6 — Sell-out/restock signal is sparse (don't build on it yet)

Only 41 sell-out and 7 restock transitions in 10 days — `quantityAvailable` is mostly null (many POS systems don't report it). Weak foundation until coverage improves.

## What this means for the derivation-engine PRD (evidence-ranked)

**Worth building now:** special start/end event detection; brand discount personas (always/never/depth); new-arrivals + dormancy feed; disparity surfacing (already live, growing on its own).
**Not yet:** list-price trendlines (median drift is zero — nothing to show), sell-out/restock analytics (sparse), seasonal anything (needs months).
**Collection fixes make everything richer:** potency + categories are extraction-only (fields confirmed present in the payload: `THCContent`, `CBDContent`, `totalTerpenes`, `effects`, `subcategory`); deal-banner history needs a snapshot before each overwrite.
