# Fix #6 — Is `basePrice` a real MSRP? (Verdict)

**Date:** 2026-06-24 · **Gate decision for fixes #1 / #2** · Source: both snapshots in
`data-snapshots/` + live `GET /api/products` (identical, cross-checked).

## Verdict
`basePrice` is **a deliberately-set list price that is uniformly promo-discounted** — not a
back-computed phantom, but also **not a validated saving**. The product-special discount % is a
**flat store / brand-tier promo rate**, so it carries no independent value signal beyond the deal
banner. **Do not feed product-special discount % into break-even math (kills fix #1's input).**
The only honest discount is fix #2 (price vs the product's own history) — which has **zero data yet**.

## Evidence
1. **No price history exists.** All 5,469 observations fall in one ~52-min window on 2026-06-24
   (19:05–19:57Z). Every product spans exactly 1 calendar day. FIXES.md's "1,665 carry ≥2 obs"
   **overstates readiness** — those are intra-hour rescrapes. Fix #2 is at **day 0 of accrual**,
   purely time-gated. (Live API confirms: same single day.)
2. **Direction = real list price, derived special.** `basePrice` is an integer 99.9% of the time;
   `specialPrice` only 59.3% (it's `base × (1-rate)`, often non-round e.g. 24.50, 91). A human sets
   the round `basePrice`; the special is computed. (A fabricated anchor would make *special* the
   round one — it isn't. So "fictional MSRP" is the wrong label.)
3. **Flat storewide promo, not item pricing.** **10 of 15** stocked stores apply ONE discount % to
   **100%** of their catalog; it matches their storewide banner:
   - 2020 North / Pacific = 20%; CannaZone Bham = 30% ("STOREWIDE 30% OFF"); CannaZone Hwy99 = 50%;
     Evolve = 40% ("40% Off Storewide"); Hangar 420 ×2 = 45% ("45% OFF ALL ONLINE ORDERS");
     Kush21 = 50% ("50% off Storewide"); Salish Coast = 25%; The Joint = 20%.
   - The remaining **5** (KushMart, Local Roots, Kushman's, Jet, Happy Time) use 2–3 **brand-tier**
     rates — more granular than the vague "Up to 50%" banners, but still promo tiers, not per-item.
4. **Discounts are exclusively round promo numbers** (40/50/20/45/30/25%); zero messy MSRP-derived
   percentages across all 2,374 discounted options.
5. **95.6% on special** (2,374/2,483 options); `basePrice` never moved and the `special` flag never
   flipped across the intra-day obs (0/1,665).

## Caveat
"Perpetually on special" is **cross-sectional, not proven persistence** — one day of data shows
uniformity + 95.6% on special, but cannot prove a product never comes off special. Multi-day
history (fix #2 accrual) is what would settle it.

## Consequences for the fix list
- **#1 (replace banner discount with product-special discount):** premise is false — product-special
  discount ≈ banner promo rate. **Do not build the discount-% break-even input.**
- **#2 (price vs own rolling median):** the only honest discount. **Time-gated, day 0.** Build the
  accrual/median path now if desired; it produces signal only after multi-day history exists.
- **What ships TODAY with no discount %:** §3 cheapest-*delivered* engine (`specialPrice` + gas).
  `specialPrice` is the real price paid and is trustworthy regardless of `basePrice`.
