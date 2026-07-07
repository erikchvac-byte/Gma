# GmaS Investigation Corpus — Distilled Truth (Capstone Synthesis)

**Date:** 2026-07-06
**Author:** Mary (Business Analyst) — BMad analysis pass
**Type:** Synthesis / capstone. Treats the entire `investigations/` folder as one body of evidence and returns a single governing truth. No new data collected; every claim traces to a cited source file below.
**Inputs (all read this session):** `ai-search-data-strategy-investigation.md`, `data-collection-audit-2026-07-03.md`, `products-data-first-look-2026-07-03.md`, `fix6-basePrice-verdict.md`, `data-pipeline-forensic-audit-2026-07-05-investigation.md`, `value-analysis-2026-06-24.md`, `FIXES.md`, `monetization-ad-revenue-investigation.md`, `menu-pricing-source-inventory.md`, `deal-source-data-inventory.md`, `weedmaps-source-data-inventory.md`, `weedmaps-scaled-crawl-gate-result.md`, `dispensary-recon-98274-2026-06-28.md`, `repo-hygiene-audit-investigation.md`, `dutchie-special-card-field-capture-2026-07-02.md`, `products-dataset-timeseries-shape-2026-07-06.md`.

---

## The single governing truth

**The hard part is already done.** GmaS has a live, honest, multi-source proprietary dataset, and the corpus proves — repeatedly and from independent angles — that its defensible value is **computed cross-store relational facts, not the raw menus**. What remains is not *"can we get or trust the data"* (solved) but three specific, well-understood constraints: **time must accrue, the storage substrate hits a hard wall in ~2 weeks, and public launch is a now-cleared business decision.** Nearly everything else in the backlog is **computation over data already sitting in the file.**

---

## The five pillars

### 1. Acquisition is a solved problem — three sources confirmed live
Dutchie embeds (20), one static site (`remedy-tulalip`), and Weedmaps static JSON (`__NEXT_DATA__`) are all reachable and verified live. The Weedmaps scaled-crawl gate — the plan's stated "primary deployment risk" — **passed** (23/23 requests served real menu JSON, zero bot-challenge markers). Dataset today: ~24 stores, ~5,000 products, ~30k observations.
*Grade: Confirmed — live captures across `deal-source-`, `menu-pricing-`, `weedmaps-source-`, `weedmaps-scaled-crawl-`, `dispensary-recon-`.*

### 2. The value is relational, and the honesty gates ARE the moat
The keystone fact is **same-SKU cross-store price disparity** — live and growing on its own (76 → 177 → 217 disparities across the audit timeline). Three gates are load-bearing, not limitations:
- **(a)** Whole-catalog $/gram *lies* — no quality/potency field exists, so cheapest-$/gram structurally surfaces trim every time. $/gram is honest **only same-product cross-store** (quality held constant).
- **(b)** Discount % is a **flat store/brand promo rate** carrying no per-item signal — `fix6` verdict, **vindicated at dataset scale** in the first-look (p75 = p95 = exactly 50%; a dozen brands average exactly 50.0% depth).
- **(c)** The only honest discount is **price-vs-its-own-history**.

Strategic punchline the corpus converges on: **proprietary-data value (Goal 1) and 2026 AI-search pickup (Goal 2) are the same work — compute facts, don't copy menus** — which is simultaneously the lower legal-risk path and the higher information-gain path.
*Grade: Confirmed (fix6, first-look, ai-search-strategy).*

### 3. Time is the gate on the biggest unbuilt value
At the `fix6` verdict (06-24), history was literally **day-0** (all observations in one ~52-min window — a "1,665 products with ≥2 obs" readiness figure that got overstated three separate times and had to be corrected). It now spans **~12 real days**. Key finding: **list prices are sticky (0% median week-over-week drift); ALL movement is specials starting/ending** (ups outnumber downs 697:130 = specials *ending*, not inflation). So "daily price-change detection" is really **special-start / special-end detection — buildable now**; true list-price trendlines need *months*.
**Emphatic caveat:** the series is **gappy** (Weedmaps missed 07-03 entirely; daily volume swings). Any trend/delta logic must tolerate missing days or the gappy source manufactures false "price held/dropped" signals.
*Grade: Confirmed (first-look, timeseries-shape, fix6).*

### 4. The pipeline is sound and honesty-gated — one now-fixed leak, a pile of dormant fields
The forensic audit graded the pipeline broadly sound; the disparity engine's five gates do real work. One **silent-wrong path** (multi-option pre-roll packs computing wrong $/gram, unflagged, leaking into disparities) was **found and fixed 2026-07-06** via the `unreconciled-pack` flag. The real structural gap: **zero aggregate/trend/diff engine** — the data-collection audit found the large majority of desired insights are *"derivable but not derived."* Dormant data splits three ways, and they are **three different queues, not one backlog**:
- **terpenes** — source-empty forever (0/5,090; provider never sends it) → unfixable by decision;
- **edibles + concentrates** (1,206 records) — data ready, **deferred by design** (one-line `ScrapedCategory` gate);
- **effects / subcategory / providerNote** — captured, no consumer → study-then-decide.
*Grade: Confirmed (forensic-audit, data-collection-audit).*

### 5. The clock that is actually running is storage, not data
Single append-only JSON `products.json`: **18.8 MB, growing ~1.75 MB/day.** GitHub warns at 50 MB (**≈ 2026-07-23**) and hard-blocks push at 100 MB (**≈ 2026-08-20**). It is also parsed **whole, uncached, on every request** → OOM risk on Render free (512 MB), and — critically — **you cannot compute time-series deltas on a file you re-parse whole every time.** This one constraint blocks **both** durability **and** Pillar 3's entire value stream. It is the nearest, hardest deadline in the corpus.
*Grade: Confirmed / Deduced-High (measured git blob sizes, linear extrapolation).*

---

## Tensions the corpus resolves (what synthesis adds beyond the individual files)

- **`fix6` invalidated `value-analysis` §1.** The break-even engine's discount-% input was killed by the flat-promo-rate finding. Resolved: banners are **display-only**; only price-history is an honest discount.
- **Legal went from blocker to cleared.** Founder determination (ADR-066): WAC 314-55-155 binds *licensees, not aggregators*; ToS is a *civil contract claim, not criminal* (CFAA inapplicable per *hiQ v. LinkedIn*). Public surfacing of **computed facts** is cleared → **Phase 4 is data-gated (on accrual), not legal-gated.**
- **Monetization is decided-enough:** mainstream self-serve ads categorically closed for cannabis; **direct sponsored placement (highest viability)** + cannabis-vertical ad networks are the real paths — a business choice, not a research gap.
- **The repo-hygiene audit's meta-lesson:** it was reliable on tree mechanics, wrong on project history — the recurring real defect is **stale pointers to done work**, not undone work (echoes the standing `verify-before-asserting-state` discipline).

---

## Two loose threads worth chasing

1. **`caravan-cannabis-burlington`** yields nothing but — unlike the genuinely-empty `the-vault-silvana` ("COMING SOON") — looks like a **silent extraction failure**, not an empty menu. Worth a targeted look.
2. **The Weedmaps residential runner is not yet proven at full nightly volume** (datacenter IPs are 406-walled). Accrual quality for the 8 Weedmaps stores — and therefore Pillar 3's time series for those stores — depends on it firing reliably.

---

## The one-sentence version

> You have already built and de-risked the asset; the value is honest cross-store facts you can compute today, the biggest prize (real discounts/trends) is gated only on time, and the single thing with a hard deadline is the storage substrate — which must be re-architected before ~July 23 or it takes both durability and all time-series value down with it.

---

## What this points to next (the two scoping deliverables spawned from this file)

1. **Storage re-architecture** (the running clock, Pillar 5) — reconcile with the already-recorded **ADR-077 (local-SQLite + push-derived-facts)**; scope the migration before ~Jul 23. → `storage-rearchitecture-scope-2026-07-06.md`
2. **Derivation-engine PRD** (the unbuilt value, Pillars 2–4) — turn "derivable but not derived" into shipped facts: special-event detection, brand discount personas, new-arrival/dormancy feeds, disparity surfacing. → `derivation-engine-prd-scope-2026-07-06.md`
