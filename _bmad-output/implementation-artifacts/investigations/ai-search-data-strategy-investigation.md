# Proprietary Data + AI-First Search Strategy — Synthesis Case File

**Date:** 2026-06-28
**Type:** Exploration / synthesis (no defect). Builds a single actionable plan from the existing investigation corpus.
**Inputs (read, not re-derived):** `deal-source-data-inventory.md`, `menu-pricing-source-inventory.md`, `weedmaps-source-data-inventory.md`, `value-analysis-2026-06-24.md`, `fix6-basePrice-verdict.md`, `FIXES.md`, `monetization-ad-revenue-investigation.md` (+ linked `spec_seo-crawler-visibility`, `unverifyed-dispensary-findings.md`).

---

## Hand-off Brief (15-second read)

GmaS already holds the raw material for genuinely proprietary data — three reachable sources (20 Dutchie embeds, 1 static site, and now-confirmed Weedmaps static JSON) that, **stitched on product identity**, yield cross-store price disparities, a cheapest-*delivered* (price + real fuel) index, brand→store matrices, and regional gaps that exist on no competitor. The single highest-leverage move is **identity-matching the same SKU across stores** — it is the one place the data is honest (quality held constant) and the one fact AI search will cite GmaS for instead of the store. The binding constraint is not technical: publishing raw redistributed menus collides with ToS/WA-advertising exposure, so the plan publishes **computed relational facts, not copied menus** — which is simultaneously the lower-risk path and the higher "information-gain" path Google's 2026 RAG models reward.

---

## Confirmed Asset Inventory (what is reachable today)

| Asset | Source | Status | Key fields | Grade |
|---|---|---|---|---|
| Banner specials | Dutchie `GetSpecialMenuCards` | Live (17 ok / stale) | free-text title only — **no numeric discount, no per-SKU** | Confirmed (weak signal) |
| Per-SKU menu pricing | Dutchie `FilteredProducts` | Live, in `/api/products` | parallel arrays `Options[]/Prices[]/recSpecialPrices[]`, `quantityAvailable`, `brand`, `strainType` | Confirmed |
| Static promos | `remedytulalip.com/promos` | Live 200 | title/body, %, time-window | Confirmed |
| **Weedmaps menu JSON** | `__NEXT_DATA__` static blob | **Live-verified 2026-06-28, no browser** | per-SKU **pre-computed `gramUnitPrice`**, all weight tiers, `onSale`/`originalPrice`/`discountLabel`, **`dealIds`/`currentDealTitle`**, category tree, rating | Confirmed (1 store, 1 fetch) |
| Geocoded stores | `/api/data` | Live | 21/21 `lat`/`lng` | Confirmed |
| Longitudinal observations | `/api/products` CAP-6 | Live but **day-0** | 5,469 obs, all in one ~52-min window | Confirmed-but-not-yet-useful |
| Gas + delivered-cost engine | `value-analysis` §1–3 | Designed, partially built | round-trip haversine × gas; cheapest-delivered | Deduced — **unique, no competitor** |

**Honesty gates (load-bearing — violating these is how you build data that lies):**
1. **Discount % is a flat storewide/brand-tier promo rate** (`fix6-basePrice-verdict`) → carries no per-item signal. Do **not** feed product-special discount % into break-even or "savings" claims.
2. **Whole-catalog $/gram ranking lies** — no quality/potency field exists, so cheapest-$/gram structurally finds trim every time. $/gram is honest **only same-product cross-store** (quality constant).
3. **Price history is day-0.** Trendlines/"vs own median" produce signal only after multi-day accrual; the pipeline exists, the time does not.
4. **$/gram parse bug** on ~17% (multipack/infused "2pk"→1g). Fixable in code; must be fixed before any per-gram surface.
5. **3 Dutchie stores epoch/never-fetched**; Weedmaps does not rescue them.

---

## GOAL 1 — Proprietary Data Inferences & Relations

Ranked by (defensibility × buildable-now × information-gain). Each is a **new relational fact**, not a copy.

### Tier A — Build now, honest today, no competitor has it

**A1. Same-SKU cross-store price disparity (the keystone).**
Match a product identity across all stores (Dutchie + Weedmaps), emit `{product, lowPrice, highPrice, spread%, storesCarrying[]}`. This is the **only** place $/gram is honest (quality held constant). It is the single most-citable fact: "Brand X 1g cart ranges $7.20–$14 across 6 stores near you."
- *Match key:* normalize `brand + strain + category + weight` → fuzzy key; Weedmaps `slug` carries brand when JSON `brand` is null. Reconcile pack-count from `Name` (fix the 365 weight-mismatch records first).
- *Confidence:* High once the matcher exists; identity-matching is the only real engineering risk.

**A2. Cheapest-*delivered* index (price + real round-trip fuel).**
`delivered = specialPrice + (haversine(user,store)×2/mpg)×gas`. `value-analysis` §3 confirms no competitor combines item price with fuel cost. This is a **computed fact that exists nowhere else** = maximal information gain.
- *Honest input:* use `specialPrice` (real price paid), **not** discount %. Per `fix6`, this ships today.

**A3. Regional price floor + availability gap.**
Per category (eighth/oz/1g vape/pre-roll), cheapest in each geographic cluster (Everett vs Mt Vernon vs Bellingham). Surfaces "the Bellingham cluster's floor is $X higher" and "Brand Y stocked in Everett, absent north." Uses `quantityAvailable` for live stockout gaps.

**A4. Brand→store relationship matrix.**
`{brand → [stores carrying, weight tiers, typical tier discount]}`. Weedmaps `brand`/slug + Dutchie `brandName`. Answers "where is Brand X carried, and cheapest." Defensible relational data; feeds A1.

### Tier B — Build the pipeline now, value accrues with time

**B1. Price trendlines / "vs own rolling median" discount.**
The *only* honest discount (`FIXES` #2, `fix6`). Pipeline (CAP-6 observation-per-scrape) already exists; needs the **scheduled multi-day accrual to actually run and commit back**. Define discount = today vs 30/60-day median. Day-0 now → schedule and wait.

**B2. Cross-source reconciliation (Dutchie ⇄ Weedmaps).**
For stores on both, cross-validate special price vs Weedmaps list/`gramUnitPrice`/`dealIds`. Weedmaps adds per-gram normalization + per-SKU deal linkage Dutchie lacks; Dutchie adds live specials Weedmaps had 0/24 active. Two-source agreement is itself a trust signal to publish.

### Tier C — Defer (evidence says don't)

- Whole-catalog $/gram leaderboard — **don't build** (honesty gate 2).
- Banner-discount-driven savings math — **don't build** (gate 1; `FIXES` #1).
- Anything depending on potency/grade — field does not exist.

---

## GOAL 2 — 2026 AI-First Search Pickup

Aligns with Google's May-2026 generative-AI guidance as the user framed it: **information gain over summarization, structural extractability, schema relations.** Leverages the existing `spec-seo-crawler-visibility` (content delivery + stable routes + structured data already specced).

### S1. Publish computed facts, not copied menus (the information-gain moat)
Every Tier-A/B fact above is a *derivation that exists nowhere else*. A page whose primary content is "lowPrice $7.20 / highPrice $14 / spread 94% across 6 stores + delivered cost from your location" is non-commodity by construction — Google's RAG penalty for copy/paste aggregation does not apply because the relational fact is the content. **This is the single most important SEO decision and it is identical to the Goal-1 work.**

### S2. Native HTML comparison tables + question→direct-answer blocks
- Server-rendered `<table>` for each cross-store comparison (A1) and regional floor (A3) — dense-retrieval models score these as high-extractability blocks.
- H2 = the literal question ("What's the cheapest ounce of flower near Marysville, WA?"), immediately followed by a one-sentence direct answer, then the table. Mirrors AI-Overview carousel structure.

### S3. Schema.org relations (express the *relation*, not just the item)
- `Product` + `AggregateOffer` (`lowPrice`/`highPrice`/`offerCount`/`priceCurrency`) — encodes the cross-store disparity as structured data.
- `Offer` per store with `Place`/`LocalBusiness` (use the 21 geocoded lat/lng) → ties price to location, the relation AI agents want.
- `Dataset` schema on the corpus pages — declares GmaS the *primary source* of the proprietary dataset.
- `FAQPage` for the question→answer blocks.

### S4. Stable, crawlable routes + server-rendered content
Per the existing SEO spec Phase 0a (blocker removal ≈90% of value): SSR/prerender the fact pages, stable URLs per `/compare/<brand>-<weight>` and `/cheapest/<category>/<region>`, clean sitemap. Skip llms.txt / chunking configs (user is correct — no ranking value).

### S5. Freshness signal
Stamp each fact page with `lastScraperRun` and render "as of <timestamp>" — AI search favors demonstrably fresh primary data, and GmaS's edge is recency.

---

## Cross-Cutting Risk (the contradiction the plan must resolve)

**Goal 2 = "surface/publish" directly collides with the ToS/legal posture flagged across the corpus.** `menu-pricing-source-inventory` and the product spec say ToS is *non-blocking for private R&D* but **"revisit before public surfacing / redistribution / commercial use."** `monetization-ad-revenue-investigation` adds WA advertising exposure (WAC 314-55-155: 4 mandatory warning statements, no health claims) once content is public/monetized.

**Resolution (and why it's lucky):** publishing **raw redistributed per-SKU menus + live inventory** is the high-risk, low-information-gain path. Publishing **computed relational facts** (disparity %, delivered index, regional floor) is *both* lower redistribution risk *and* higher information gain. The two goals therefore point the same direction: transform, don't copy.

**GATES CLOSED — founder determination 2026-06-30 (working legal posture for this project; Erik's call, not independent counsel):**
- **WAC 314-55-155 binds *licensed retailers*, not unlicensed third-party aggregators directly** — LCB rules regulate licensees only. The 4 mandatory warning statements are a *licensee* obligation, so they do **not** attach to GmaS as an unlicensed aggregator. Caveat retained: (a) if GmaS displays **licensee ads/content**, liability could attach to *the licensee*; (b) WA's **general advertising / UDAP** laws still apply to GmaS regardless — so no health claims, no deceptive/unfair statements.
- **ToS is a contract claim, not criminal.** Worst realistic case = cease-and-desist, IP/account ban, injunctive relief, damages (damages rare for public data). **CFAA does not apply**: it requires *unauthorized access* (bypassing logins/bot-detection); *hiQ v. LinkedIn* held scraping **public** data is not CFAA "unauthorized access." GmaS scrapes public pages → real risk is **civil contract, not criminal**.
- **Net posture:** public surfacing of **computed relational facts** (not verbatim menus) is cleared to proceed under this determination, subject to the two retained caveats (no licensee-ad liability transfer; UDAP/no-health-claims/no-deception). Phase 4 is **no longer legally gated**; it remains *data-gated* on B1 accrual.

---

## Missing Evidence

| Gap | Impact | How to obtain |
|---|---|---|
| ~~Does WA require the 4 WAC warning statements on an *unlicensed* aggregator's public price pages?~~ **RESOLVED 2026-06-30 (founder determination):** No — WAC 314-55-155 binds licensees only; warnings don't attach to GmaS. Caveats: licensee-ad liability + general UDAP/no-health-claims still apply. | ~~Gates public launch design~~ Closed | ~~WSLCB / WA cannabis counsel~~ Founder call |
| ~~Redistribution posture of computed-derived facts vs raw menus under Dutchie/Weedmaps ToS~~ **RESOLVED 2026-06-30 (founder determination):** ToS = civil contract claim only (C&D / ban / injunction / rare damages); CFAA inapplicable to public-data scraping per *hiQ v. LinkedIn*. Publish computed facts, not verbatim menus. | ~~Gates what can go public vs stay private~~ Closed | ~~Counsel review~~ Founder call |
| ~~Weedmaps scaled-crawl behavior (rate-limit / captcha under nightly crawl)~~ **RESOLVED:** scaled-crawl gate cleared 2026-06-29 (23/23 OK); datacenter-406 wall + axios-fingerprint 406 both resolved (residential runner + native-fetch, ADR-064/065); nightly accrual proven live 2026-06-30. | ~~Primary deployment risk~~ Closed | Done |
| Identity-match precision across Dutchie/Weedmaps naming | A1 accuracy (false matches = false disparities) | Build matcher, hand-audit a sample — A1 shipped (ADR-062/063); cross-source precision still un-audited (no Weedmaps overlap data until accrual builds up) |

---

## Phased Roadmap

**Phase 0 — Honesty hardening (code, private).** Fix the 365 weight-mismatch $/gram records; parse pack-count from `Name`; reconcile Weedmaps `weight`/mg unit. *Gate: per-gram is only trustworthy after this.*

**Phase 1 — Keystone matcher + delivered engine (private dataset).** Build A1 (same-SKU cross-store match) + A2 (cheapest-delivered) + A4 (brand matrix). Additive/decoupled per ADR-043/053. These are the proprietary facts.

**Phase 2 — Wire Weedmaps as TYPE 3 `weedmaps-static-json`.** Static axios path (no Playwright), `__NEXT_DATA__` extract, throttled. Feeds A1/B2 + `gramUnitPrice`/`dealIds`. *Run the scaled-crawl test first.*

**Phase 3 — Accrual on a schedule.** Let CAP-6 observations accumulate days→weeks so B1 trendlines/median become real. Pure time + a running cron.

**Phase 4 — Legal gates, then public surfacing (Goal 2).** Close the two Missing-Evidence legal gates → ship SSR fact pages (S1–S5): comparison tables, question→answer, `AggregateOffer`/`Dataset` schema, on the stable routes the SEO spec already defines.

**Phase 5 — Monetization (optional, separate decision).** Per `monetization` investigation: direct sponsored placement (highest viability) or freemium — *not* self-serve ad networks (categorically closed). Public-surface compliance (WAC warnings) overlaps Phase-4 gates.

---

## Conclusion

**Confidence: High** on the technical path (every input is Confirmed live), **Medium** on public-launch timing (two legal gates are genuinely open and outside engineering's control).

The plan's core insight is that **Goal 1 and Goal 2 are the same work**: the proprietary relational facts that make GmaS non-commodity to a 2026 RAG crawler are exactly the honest, defensible derivations the data supports — and computing rather than copying them is also the lower-risk answer to the ToS/WA-advertising exposure. The keystone is A1 same-SKU cross-store matching; everything else composes from it.

**Status:** Active — plan ready; no code written (investigation stops at the plan).

### Recommended next steps (menu)
- **Highest value:** `bmad-create-story` for **Phase 0 + A1 keystone matcher** (honest, buildable now, unblocks everything).
- Phase 2 Weedmaps wiring → `bmad-spec` or `bmad-quick-dev` after the scaled-crawl test.
- Legal gates (Phase 4 prerequisite) → not an engineering task; Erik/counsel.
- Scope/sequencing change → `bmad-correct-course`.
