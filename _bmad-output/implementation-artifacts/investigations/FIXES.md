# FIXES — value-analysis-2026-06-24.md

> **Status update 2026-07-02** (repo-hygiene audit reconciliation):
> - **#6 is ANSWERED** — see `fix6-basePrice-verdict.md` (2026-06-24): `basePrice` is a real,
>   deliberately-set list price, but the product-special discount is a **flat store/brand promo
>   rate** carrying no signal beyond the deal banner.
> - **That verdict KILLS #1's replacement input** — product-special `basePrice`/`specialPrice` %
>   must NOT feed break-even math either. It also debunks the "1,665 products already carry ≥2 obs"
>   line below: all 5,469 observations fell in one ~52-min window on 2026-06-24 (zero real history).
> - **#2 (price-vs-own-history) remains the only honest discount path** — time-gated on accrual
>   (Weedmaps residential ingest began 2026-06-30; Dutchie daily runs accruing since 06-24).
> - Items #3–#5, #7–#8 remain open and are tracked nowhere else.

Handoff from an adversarial review of `value-analysis-2026-06-24.md` (2026-06-24).
All numbers in that doc reproduce cleanly against the two snapshots in
`data-snapshots/`; the arithmetic is sound. **The flaw is the input to §1, not the math.**

## Core finding (read first)
§1's "Gas / break-even engine" derives each store's discount % from **free-text deal
banners**. This directly violates the doc's own "Data constraints" rule:
*"Structured % off must come from product specials (base vs special price), not deal text."*
The banners are unreliable as basket-discount inputs — they are variously brand-only,
"select products", **online-order-only**, single-day vendor events, day-restricted,
legal-limit-gated, or absent entirely (The Joint's "20%" is fabricated — no % in its text).

**Do not patch the banner parsing. Replace the input.** Discount % should come from
product-level specials (`basePrice`/`specialPrice`), which §4 already validated as clean.

## Fixes, priority order

1. **Kill banner-derived discount math.** Recompute every store's effective discount from
   product `basePrice`/`specialPrice`, not deal text. Banner deals become a display-only
   layer, never fed into break-even.
2. **Price-history discount (the real fix).** Define discount as today's price vs that
   product's own rolling median (30/60-day). Immune to fake MSRPs. Needs accrued
   observations — 1,665 products already carry ≥2. Highest value; mostly waiting on time.
   *If only one fix is done, do this one — it dissolves #1 and #6 together.*
3. **Filter junk deals before any drive/break-even use:** drop no-% banners (The Joint),
   expired promos ("MAY 2026 MEMORIAL DAY"), and online-only rows ("ONLINE ORDERS").
4. **Reframe break-even vs next-best option,** not vs the store's own full price. Add a
   time/effort cost line for the 50+ mi (Bellingham) rows — gas alone undersells the cost.
5. **Distance honesty:** flag ferry/peninsula stores (Salish Coast — Anacortes, haversine
   meaningless); disclose that the 4 originals' real `distanceMiles` were overridden by
   haversine (e.g. Remedy 2.5→2.0, Kush21 9.8→9.6).
6. **Investigate the 95%-on-special anchor.** 2,040/2,142 products are perpetually "on
   special" — likely `basePrice` is a fictional MSRP. Confirm before trusting ANY % (banner
   or product-special). If MSRP is fake, only #2 (history) yields an honest discount.
7. **Reproducibility:** save the actual node scripts next to the snapshots and specify the
   parse step. "In session history" is not reproducible.
8. **Cosmetics:** title/date inconsistency (named 06-24, snapshot timestamps are 06-25 UTC /
   PT artifact); state a rounding convention for break-even dollars.

## Inputs / source of truth
- `data-snapshots/api-data-2026-06-24.json` — stores, deals (free-text), distances, gas.
- `data-snapshots/api-products-2026-06-24.json` — 2,142 products / 17 stores, `history[]`
  observations, `options[]` with `basePrice`/`specialPrice`, `flags` (365 weight-mismatch,
  237 assumed-single).
- Live API: `GET https://gmaslist.com/api/data`, `GET https://gmaslist.com/api/products`.
- Code lives in the repo (`server/`). Effective-discount + history calc belong there,
  additive/decoupled (cf. ADR-053 product-pricing, ADR-043 deals-first decoupling).
