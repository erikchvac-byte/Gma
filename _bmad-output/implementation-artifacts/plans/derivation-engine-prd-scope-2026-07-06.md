# Derivation Engine — PRD Scope

**Date:** 2026-07-06
**Author:** Mary (Business Analyst) — scoping input for a formal PRD (`bmad-prd`)
**Status:** Scope proposed, not yet a ratified PRD. Awaiting Erik's go-ahead to formalize.
**Grounded in:** `corpus-synthesis-distilled-truth-2026-07-06.md` (Pillars 2–4), `data-collection-audit-2026-07-03.md` (the "derivable but not derived" gap), `products-data-first-look-2026-07-03.md` (what 12 days already shows), `fix6-basePrice-verdict.md`, `ai-search-data-strategy-investigation.md` (Goal 1 Tier A/B).
**Depends on:** ADR-077 storage move (SQLite substrate) — see `storage-rearchitecture-scope-2026-07-06.md`. Storage is the foundation; this is what gets built on it.

---

## Problem statement (one paragraph)

GmaS collects a strong, honest, longitudinal dataset but **derives almost nothing from it**. The data-collection audit found exactly two analytical consumers exist (cross-store disparities, deal→SKU scope) and **zero aggregate/trend/diff code** — the large majority of desired insights are *"derivable from committed data with no new scraping"* but *not computed*. The Derivation Engine is the missing layer that turns the raw asset into the **proprietary relational facts** that are simultaneously (a) the product's user-facing value and (b) the non-commodity content 2026 AI-search rewards. This is the "unbuilt value" the corpus points to.

## Goal & non-goals

**Goal:** A derivation layer that computes bounded, honest, relational facts from `products.db` on each run and emits them as small served artifacts — extending the existing `buildMatchReport` pattern from one report to a family.

**Non-goals:**
- Not new data collection (potency/edibles collection is ADR-071/072's job, already shipping).
- Not the public SEO/AI surfacing itself (that's the downstream consumer — Goal 2 / SEO spec — fed by this engine's output).
- Not a user-facing UI redesign (this is the fact-production layer; surfaces consume it).
- Does not touch the deals pipeline or honesty gates' behavior.

---

## The honesty contract (non-negotiable — this is the moat, per Pillar 2)

Every derivation MUST obey the gates the corpus proved load-bearing. A derivation that violates these builds "data that lies":

1. **$/gram is honest only same-product cross-store.** No whole-catalog $/gram leaderboard (structurally surfaces trim).
2. **Discount % from banners/product-specials carries no signal** — it's a flat store/brand promo rate (fix6, vindicated at scale). The *only* honest discount is **price vs the product's own rolling history**.
3. **Gap-tolerance is mandatory.** The series is uneven (Weedmaps misses days). Every trend/delta must distinguish "no observation" from "unchanged," or it manufactures false signals.
4. **Missed-scrape ≠ delisting.** New/removed detection must flag the ambiguity, not assert removal from a single absent run.
5. **Potency-dependent facts gated on coverage.** THC is ~54% populated, terpenes 0% (source-empty), edible $/mg needs ADR-071 accrual. Don't ship a fact that silently drops half the catalog.

---

## Scope — evidence-ranked (buildable-now → time-gated → don't-build)

### TIER 1 — Build now, honest today, has daily content (highest leverage)

| Fact | Why now | Evidence |
|---|---|---|
| **D1. Special start/end event detection** | Pillar 3: list prices are sticky (0% drift); *all* movement is specials. "Daily price change" = special-start/end. Buildable today, daily content. | first-look Finding 1 |
| **D2. Brand discount personas** (always-on-special / never-discounted / typical depth) | Answerable *now* from 12 days — 15 "always-on" brands, a real "never-discounted" list already exist. Answers audit §3. | first-look Finding 3 |
| **D3. New-arrival & dormancy feed** | ~100–160 genuinely new products/day; menu turnover gives daily content. MUST carry the missed-scrape ambiguity flag (Gate 4). | first-look Finding 4 |
| **D4. Cross-store disparity surfacing** | *Already computed* (217 live, growing on its own). Needs a consumer surface + rollups, not new derivation. The keystone fact. | forensic-audit side-finding |
| **D5. Brand→store matrix** (who carries brand X, at what tiers, cheapest) | Pure grouping over data present on every record; feeds D2 + regional facts. | ai-strategy A4 |

### TIER 2 — Build the pipeline now, value accrues with time (the fix6 gate reopens here)

| Fact | Status | Evidence |
|---|---|---|
| **D6. Price vs own rolling median** (the ONLY honest discount) | Was day-0 at fix6 (06-24); now ~12 days. Define discount = today vs 30/60-day median. **This is the derivation that reopens the fix6 gate.** Ship the accrual/median path; signal grows with history. Needs SQLite time-range queries (ADR-077 dependency). | fix6, FIXES #2 |
| **D7. Cheapest-*delivered* index** (item price + real round-trip fuel) | Honest today via `specialPrice` + existing gas math — a computed fact no competitor has. Composes with existing distance/gas layer. | ai-strategy A2, value-analysis §3 |
| **D8. Regional price floor + availability gap** (per category, per geo cluster) | All inputs present (lat/lng + prices + quantity); needs a city/cluster derivation. Higher effort (no `city` field — derive from geocode). | ai-strategy A3, data-collection §6 |

### TIER 3 — Do NOT build (honesty gates forbid, or data too sparse)

- Whole-catalog $/gram leaderboard (Gate 1).
- Any banner-%/product-special-% "savings" math (Gate 2 / fix6).
- Sell-out/restock analytics — only 41 sell-out + 7 restock transitions in 10 days; `quantityAvailable` mostly null. Too sparse (first-look Finding 6).
- Weekly/monthly/seasonal trends — needs months, not weeks. Revisit at accrual milestones.
- Any potency-per-dollar fact until coverage clears a threshold (Gate 5).

---

## Cross-cutting requirements

- **Runs at derivation time on `products.db`** (post-ADR-077), emits small bounded JSON artifacts served read-only — same shape/discipline as `disparities.json` / `deal-scope.json`. Render never computes these live.
- **Gap-tolerant by construction** (Gate 3) — a shared "presence-aware time series" helper the trend facts (D1, D6) build on.
- **Every drop counted** — extend the `MatchReport` accounting pattern (Finding 6 of the forensic audit): each fact reports what it excluded and why, so honesty is inspectable.
- **Additive/decoupled** — new module(s) under `server/utils/`, new derived files, no change to deals or existing types' behavior. Mirrors ADR-053 decoupling.

## Downstream consumers (out of scope here, but this engine feeds them)

- **AI-search / SEO surfacing** (ai-strategy Goal 2, S1–S5): the derived facts become the `AggregateOffer`/`Dataset`-schema comparison pages — the "compute don't copy" information-gain moat. Legal-cleared (ADR-066), data-gated on D6 accrual.
- **In-app value surfaces** — cheapest-delivered (D7), disparity cards (D4), "on sale vs its own history" (D6).

---

## Proposed phasing

1. **PRD Phase 1 — Tier 1 facts** (D1–D5) on the new SQLite substrate. All honest today, all have daily content, none wait on time. Ship the derivation-runner + served-artifact pattern once; add facts into it.
2. **PRD Phase 2 — Tier 2 accrual facts** (D6 rolling-median first — it's the honest-discount keystone and the fix6-gate reopener; then D7 delivered index, D8 regional).
3. **PRD Phase 3 — feed the surfaces** (AI-search pages + in-app), gated on D6 having real history and on the legal-cleared public-surfacing posture.

## Open questions for the PRD (don't guess — resolve with Erik / in `bmad-prd`)

1. **Rolling-median window** for D6 — 30 vs 60 day, and the minimum-observations threshold before a discount is shown as honest.
2. **Potency-coverage threshold** (Gate 5) — what % populated before a THC-per-dollar fact is allowed to ship.
3. **`/api/products` fate** intersects here (ADR-077 open decision #2) — does any Tier-1 fact need a bounded raw-product view, or do the derived artifacts fully replace it?
4. **Freshness SLA** for derived facts — daily is simplest; does any fact (disparities?) need tighter?

---

## Recommended next step

Formalize this scope into a ratified PRD via **`bmad-prd`** (John/PM), with Tier 1 as the first epic — **but only after** ADR-077 Phase 1 lands the SQLite substrate, since every fact here reads from it. The sequencing is: **storage wall killed → substrate exists → derivation engine builds on it → surfaces consume it.**
