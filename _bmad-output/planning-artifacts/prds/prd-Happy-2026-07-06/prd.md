---
title: Derivation Engine PRD
status: final
created: 2026-07-06
updated: 2026-07-06
---

# Derivation Engine — Product Requirements

**Project:** Gma's Helper (GmaS) · **Author:** John (PM), facilitating Erik · **Date:** 2026-07-06
**Formalizes:** `implementation-artifacts/plans/derivation-engine-prd-scope-2026-07-06.md`
**Grounded in:** `corpus-synthesis-distilled-truth-2026-07-06.md`, `data-collection-audit-2026-07-03.md`, `products-data-first-look-2026-07-03.md`, `fix6-basePrice-verdict.md`, `ai-search-data-strategy-investigation.md`, `data-pipeline-forensic-audit-2026-07-05-investigation.md`
**Depends on:** ADR-077 Phase 1 SQLite substrate — story `products-storage-sqlite-phase-1.md` (in build, parallel)

---

## 1. Overview & Problem

GmaS collects a strong, honest, longitudinal cannabis-price dataset but **derives almost nothing from it**. The data-collection audit found exactly two analytical consumers exist (cross-store disparities, deal→SKU scope) and **zero aggregate/trend/diff code** — the large majority of desired insights are *derivable from committed data with no new scraping* yet *not computed*.

The **Derivation Engine** is the missing layer that turns the raw asset into **proprietary relational facts** that are simultaneously (a) the product's user-facing value and (b) the non-commodity content 2026 AI-search rewards. It extends the existing `buildMatchReport` pattern from one report to a **family of bounded, honest, served facts**, computed at derivation time on `products.db` (post-ADR-077) on the home machine, and served read-only by Render.

## 2. Goals & Non-Goals

**Goal.** A derivation layer that computes bounded, honest, relational facts from `products.db` on each daily run and emits them as small served JSON artifacts — same shape/discipline as the existing `disparities.json` / `deal-scope.json`.

**Non-goals.**
- **Not new data collection** — potency/edibles collection is ADR-071/072's job, already shipping.
- **Not the public SEO/AI surfacing itself** — that's the downstream consumer (Epic 3 / SEO spec), fed by this engine's output.
- **Not a user-facing UI redesign** — this is the fact-production layer; surfaces consume it.
- **Does not touch** the deals pipeline (`data.json`, `/api/data`, `filterActiveDeals`) or the honesty gates' behavior.

## 3. The Honesty Contract (non-negotiable requirements — the moat)

Every derivation MUST obey these gates. The corpus proved them load-bearing; a derivation that violates one builds *data that lies* and forfeits the product's only durable advantage. These are hard acceptance criteria on every FR below, not guidelines.

- **Gate 1 — $/gram is honest only same-product cross-store.** No whole-catalog $/gram leaderboard (it structurally surfaces trim as "cheapest").
- **Gate 2 — banner / product-special discount % carries no signal.** It's a flat store/brand promo rate (fix6, vindicated at scale). The only honest discount is price vs the product's *own* rolling history.
- **Gate 3 — gap-tolerance is mandatory.** The series is uneven (Weedmaps misses days). Every trend/delta MUST distinguish "no observation" from "observed, unchanged," or it manufactures false signals.
- **Gate 4 — missed-scrape ≠ delisting.** New/removed detection MUST flag the ambiguity, never assert removal from a single absent run.
- **Gate 5 — potency-dependent facts gated on coverage.** A potency-per-dollar fact ships for a category only at **≥80% of that category's records populated**; terpenes (0% at source) stay blocked; every such fact reports its excluded count.

**Inspectability (cross-cutting).** Every fact reports what it excluded and why — extending the `MatchReport` accounting pattern — so honesty is auditable, never hidden.

## 4. Users & Consumers

This is a fact-production layer; its "users" are machines and downstream surfaces, not end-users directly.

- **The operator (Erik).** Runs the daily derivation on the home machine; owns the raw DB. Needs the runner to be boring, reversible, and self-reporting (excluded counts, parity).
- **Render (public site).** Reads the derived artifacts read-only. **Never queries the home DB.** Serves the last-pushed facts even when the home machine is off.
- **Downstream surfaces (Epic 3, out of scope here).** AI-search/SEO comparison pages and in-app value cards consume these artifacts.

No standalone user journeys — internal single-operator + machine consumers (UJs intentionally dropped per PRD discipline).

## 5. Requirements

FRs carry globally stable IDs and map to epics. Every FR inherits the §3 Honesty Contract as acceptance criteria.

### Capability A — Derivation runner & served-artifact infrastructure (Epic 1 foundation)

- **FR1.** A derivation runner executes on the home machine against `products.db` on each daily run and emits bounded JSON artifacts to `server/data/derived/`, committed back `[skip ci]` (mirrors the residential-scrape runner pattern).
- **FR2.** Render serves derived artifacts **read-only** and never opens a live connection to the home DB, never recomputes a fact at request time. *(load-bearing rule)*
- **FR3.** All artifacts are **additive** — new files, no change to `data.json`, the deals pipeline, or existing types' behavior (mirrors ADR-053 decoupling).
- **FR4.** `/api/products` is **removed**; Render serves only derived facts. *(decision: drop entirely — resolves ADR-077 Phase 1 open decision #2)*
- **FR5.** All facts are recomputed on **one daily derivation run** (uniform freshness); ~24h banner→SKU staleness is accepted. *(decision: daily uniform)*
- **FR6.** A shared **presence-aware time-series helper** — distinguishing "no observation that day" from "observed, unchanged" (Gate 3) — is provided once and used by every trend/delta fact (FR8, FR13).
- **FR7.** Every fact emits an **accounting block** (counts of what it excluded and why), extending the `MatchReport` pattern. *(Inspectability)*

### Capability B — Tier 1 facts: honest today, daily content (Epic 1)

- **FR8 (D1). Special start/end event detection.** Because list prices are sticky (0% drift) and *all* movement is specials, "daily price change" = special-start or special-end. Computed from the observation series, gap-tolerant (FR6). *Evidence: first-look Finding 1.*
- **FR9 (D2). Brand discount personas.** Per brand: always-on-special / never-discounted / typical discount depth. Answerable now from ~12 days (15 "always-on" brands and a real "never-discounted" list already exist). *Evidence: first-look Finding 3; audit §3.*
- **FR10 (D3). New-arrival & dormancy feed.** ~100–160 genuinely-new products/day + dormant SKUs per run. MUST carry the missed-scrape ambiguity flag (Gate 4). *Evidence: first-look Finding 4.*
- **FR11 (D4). Cross-store disparity surfacing.** The keystone fact — *already computed* (217 live, growing on its own). Needs a served consumer surface + rollups, not new derivation. *Evidence: forensic-audit side-finding.*
- **FR12 (D5). Brand→store matrix.** Who carries brand X, at what tiers, cheapest — pure grouping over fields present on every record; feeds FR9 and regional facts. *Evidence: ai-strategy A4.*

### Capability C — Tier 2 facts: pipeline now, value accrues with time (Epic 2)

- **FR13 (D6). Price vs own rolling median — the ONLY honest discount.** Discount = today vs the product's own rolling-history median, gap-tolerant (FR6), suppressed below a minimum-observation floor. **This is the fact that reopens the fix6 gate.** Requires SQLite time-range queries (ADR-077). *The rolling window (30 vs 60 day) and min-obs floor are decided at Epic 2 start when more history exists — the PRD locks only the rule and the gates.* *Evidence: fix6, FIXES #2.*
- **FR14 (D7). Cheapest-*delivered* index.** Item `specialPrice` + real round-trip fuel (composes with the existing distance/gas layer) — a computed fact no competitor has. Honest today. *Evidence: ai-strategy A2, value-analysis §3.*
- **FR15 (D8). Regional price floor + availability gap.** Per category, per geo cluster derived from lat/lng (no `city` field — derive from geocode). Higher effort. *Evidence: ai-strategy A3, data-collection §6.*

### Capability D — Potency gating (cross-cutting, applies to any potency fact)

- **FR16.** Any potency-per-dollar fact is gated at **≥80% per-category coverage**; terpene facts stay blocked (0% source); the excluded count is reported on every potency fact (Gate 5). *(decision: 80% per-category)* THC is ~54% populated now and rising via ADR-071 accrual — flower THC/$ unlocks when its category clears the bar.

### Non-Requirements — Tier 3, explicitly DO NOT BUILD

Named so a future contributor doesn't "helpfully" add them:

- **Whole-catalog $/gram leaderboard** — violates Gate 1 (structurally surfaces trim).
- **Any banner-% / product-special-% "savings" math** — violates Gate 2 / fix6.
- **Sell-out / restock analytics** — only 41 sell-out + 7 restock transitions in 10 days; `quantityAvailable` mostly null. Too sparse (first-look Finding 6).
- **Weekly/monthly/seasonal trends** — needs months, not weeks. Revisit at accrual milestones.
- **Any potency-per-dollar fact below the FR16 threshold** — violates Gate 5.

### Non-Functional Requirements (cross-cutting)

- **NFR1 — Availability independence.** Site availability never depends on home-machine uptime or the ISP; only fresh accrual pauses when home is off.
- **NFR2 — Zero request-time compute.** Render performs no derivation at request time; all artifacts are bounded in size.
- **NFR3 — $0 cost.** No new paid infrastructure (distinct from the parked paid-Docker self-host, ADR-033).
- **NFR4 — Decoupling preserved.** Deals pipeline untouched (ADR-043/053); full raw history preserved, no pruning.
- **NFR5 — Reversibility.** Additive modules under `server/utils/` + `server/scripts/`; no change to existing types' behavior; each step reversible.
- **NFR6 — Strict typing + tests.** TypeScript strict mode; tests for every fact, including gate-enforcement and gap-tolerance cases.

## 6. Dependencies & Constraints

- **Hard dependency: ADR-077 Phase 1** must land the SQLite substrate first — every fact reads from `products.db`, and the trend facts (FR8, FR13) need the time-range queries the substrate's `observation` indexing provides. Storage-first, derivation-second; the PRD is authored in parallel but Epic-1 *build* starts when the substrate lands.
- **Honesty gates run at derivation time, behavior-identical** to today.
- **Coupling note (from storage memo #1):** the `observation.observedAt` indexing is designed *now* in the substrate story with these time-range queries in mind — cheap there, expensive to retrofit.
- **Coupling note (storage memo #3):** before deeper accrual, the `caravan-cannabis-burlington` suspected silent-extraction failure and residential-runner nightly reliability must be resolved so facts aren't computed over a silently-holed asset.

## 7. Success Metrics

- **Coverage of the asset:** number of honest derived facts served grows from **2 today → the Tier-1 family (5)** at Epic 1 done, with the runner+served-artifact pattern reusable for the rest.
- **Daily content:** special-start/end events (FR8) and new-arrivals (FR10) produce fresh, non-empty signal every run.
- **Keystone growth:** disparities surfaced and trending upward on their own (217 → …) with served rollups.
- **Honest-discount readiness:** FR13 accrual path shipped so the fix6 gate can reopen as history matures.

**Counter-metrics (guard the moat):**
- **Zero honesty-gate violations** shipped (no whole-catalog $/gram, no banner-% savings).
- **Zero facts that silently drop records** without reporting an excluded count (FR7).
- **No Render request-time-compute regression** and **no deals-pipeline behavior change** (NFR2, NFR4).
- **Site uptime independent of home machine** verified (NFR1).

## 8. Phasing (Epics)

1. **Epic 1 — Tier 1 facts (D1–D5) on the SQLite substrate.** Ship the derivation-runner + served-artifact pattern once (Capability A), then add the five facts. All honest today, all have daily content, none wait on time. *First epic.*
2. **Epic 2 — Tier 2 accrual facts.** D6 rolling-median first (the honest-discount keystone / fix6-gate reopener; lock window+floor at start), then D7 delivered index, D8 regional. Value accrues with history.
3. **Epic 3 — Feed the surfaces (out of scope here).** AI-search/SEO comparison pages (`AggregateOffer`/`Dataset` schema) + in-app value cards. Gated on D6 having real history and on the legal-cleared public-surfacing posture (ADR-066).

## 9. Open Items & Assumptions

- **[OPEN — Epic 2] FR13 rolling window + min-obs floor.** Deferred by decision; revisit condition: Epic 2 kickoff with ≥30 days of history. Owner: Erik.
- **[ASSUMPTION] Live disparity count ~217** (memory) — verify against `/api/value/disparities` at Epic 1 implementation; the FR11 rollups build on the real number.
- **[ASSUMPTION] FR14 delivered-index** reuses the existing distance/gas math unchanged — confirm the gas layer exposes a reusable round-trip function at Epic 2.
- **[NOTE FOR ARCHITECT] Winston** owns the `observation` schema call in the substrate story; the FR6/FR13 time-range query shape is the one thing worth his eyes before the schema freezes.
