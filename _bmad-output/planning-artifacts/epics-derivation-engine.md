---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-07-06/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-07-06/addendum.md
  - _bmad-output/implementation-artifacts/products-storage-sqlite-phase-1.md
  - ADR.md (ADR-077)
---

# Derivation Engine (Gma's Helper) — Epic Breakdown

## Overview

This document decomposes the **Derivation Engine PRD** into implementable stories. It is a **new product increment**, separate from the original `epics.md` (Epics 1–6, shipped). Scope of this run: **Epic 1 only** — Tier 1 facts (D1–D5) plus the derivation-runner/served-artifact infrastructure they share. Epics 2–3 are listed for context but not decomposed here.

## Requirements Inventory

### Functional Requirements

**Capability A — Derivation runner & served-artifact infrastructure (Epic 1 foundation)**

FR1: A derivation runner executes on the home machine against `products.db` on each daily run and emits bounded JSON artifacts to `server/data/derived/`, committed back `[skip ci]` (mirrors the residential-scrape runner pattern).
FR2: Render serves derived artifacts read-only and never opens a live connection to the home DB, never recomputes a fact at request time. *(load-bearing rule)*
FR3: All artifacts are additive — new files, no change to `data.json`, the deals pipeline, or existing types' behavior (mirrors ADR-053 decoupling).
FR4: `/api/products` is removed; Render serves only derived facts. *(also resolves ADR-077 Phase 1 story open decision #2)*
FR5: All facts are recomputed on one daily derivation run (uniform freshness); ~24h banner→SKU staleness accepted.
FR6: A shared presence-aware time-series helper — distinguishing "no observation that day" from "observed, unchanged" (Gate 3) — is provided once and used by every trend/delta fact (FR8, FR13).
FR7: Every fact emits an accounting block (counts of what it excluded and why), extending the `MatchReport` pattern. *(Inspectability)*

**Capability B — Tier 1 facts: honest today, daily content (Epic 1)**

FR8 (D1): Special start/end event detection — list prices are sticky (0% drift); all movement is specials, so "daily price change" = special-start or special-end. Computed from the observation series, gap-tolerant (FR6).
FR9 (D2): Brand discount personas — per brand: always-on-special / never-discounted / typical discount depth (from ~12 days of history).
FR10 (D3): New-arrival & dormancy feed — genuinely-new + dormant SKUs per run; MUST carry the missed-scrape ambiguity flag (Gate 4).
FR11 (D4): Cross-store disparity surfacing — the keystone fact, already computed (217 live); needs a served consumer surface + rollups, not new derivation.
FR12 (D5): Brand→store matrix — who carries brand X, at what tiers, cheapest; pure grouping over fields present on every record; feeds FR9.

**Capability C — Tier 2 facts (Epic 2, NOT decomposed here)**

FR13 (D6): Price vs own rolling median — the only honest discount; gap-tolerant, min-obs gated. Window/floor decided at Epic 2 start. Requires SQLite time-range queries.
FR14 (D7): Cheapest-*delivered* index — item `specialPrice` + real round-trip fuel; composes with existing distance/gas layer.
FR15 (D8): Regional price floor + availability gap — per category, per geo cluster derived from lat/lng.

**Capability D — Potency gating (cross-cutting)**

FR16: Any potency-per-dollar fact is gated at ≥80% per-category coverage; terpene facts blocked (0% source); excluded count reported (Gate 5).

### NonFunctional Requirements

NFR1: Availability independence — site availability never depends on home-machine uptime or the ISP; only fresh accrual pauses when home is off.
NFR2: Zero request-time compute — Render performs no derivation at request time; all artifacts bounded in size.
NFR3: $0 cost — no new paid infrastructure (distinct from parked paid-Docker self-host, ADR-033).
NFR4: Decoupling preserved — deals pipeline untouched (ADR-043/053); full raw history preserved, no pruning.
NFR5: Reversibility — additive modules under `server/utils/` + `server/scripts/`; no change to existing types' behavior; each step reversible.
NFR6: Strict typing + tests — TypeScript strict mode; tests for every fact, including gate-enforcement and gap-tolerance cases.

### Additional Requirements (technical — ADR-077 / substrate story / PRD Dependencies)

- **Hard dependency: ADR-077 Phase 1 substrate.** Epic 1 build starts once `products.db` + the DB-backed reader (returning the existing `ProductsFile` shape) land via story `products-storage-sqlite-phase-1.md`.
- **Runner mechanism.** `scripts/derive-facts-local.ps1` mirrors `scripts/scrape-weedmaps-local.ps1`: detached git worktree, hard-reset to origin/master, run `server/scripts/deriveFactsRun.ts`, commit-back only `server/data/derived/*.json` with `[skip ci]`, push master.
- **Pure fact-functions unchanged.** `buildMatchReport` / `buildDealScopeLinks` stay byte-identical; only their *input* is adapted from in-memory `ProductsFile` to the DB-backed reader — this is what makes the parity test meaningful.
- **Schema coupling.** `observation.observedAt` indexing is designed in the substrate story with the derivation engine's time-range queries (FR6, FR13) in mind — cheap there, expensive to retrofit.
- **Data-integrity checkpoint.** `caravan-cannabis-burlington` suspected silent-extraction failure + residential-runner nightly reliability should be resolved before deep accrual so facts aren't computed over a silently-holed asset (Phase-2 concern; note for Epic 1 awareness).

### UX Design Requirements

None. This is a fact-production layer; user-facing surfaces are Epic 3 (out of scope for this run). No UX spec exists or is required for Epic 1.

### Cross-cutting Acceptance Criteria (the Honesty Contract — hard ACs on EVERY story)

- **Gate 1** — $/gram honest only same-product cross-store; no whole-catalog leaderboard.
- **Gate 2** — banner / product-special discount % carries no signal (fix6); the only honest discount is vs the product's own rolling history.
- **Gate 3** — gap-tolerance mandatory; distinguish "no observation" from "observed, unchanged."
- **Gate 4** — missed-scrape ≠ delisting; flag the ambiguity, never assert removal from one absent run.
- **Gate 5** — potency-dependent facts gated on ≥80% per-category coverage; terpenes blocked at 0%.
- **Inspectability** — every fact reports what it excluded and why (FR7).

### FR Coverage Map

FR1: Epic 1 — derivation runner emits bounded artifacts on each daily run (Story 1.1)
FR2: Epic 1 — Render reads derived files, never queries home DB (Story 1.1, 1.7)
FR3: Epic 1 — additive artifacts, deals pipeline untouched (Story 1.1, cross-cutting)
FR4: Epic 1 — remove `/api/products` (Story 1.7)
FR5: Epic 1 — one daily run, uniform freshness (Story 1.1)
FR6: Epic 1 — shared presence-aware time-series helper (Story 1.2, consumed by 1.3)
FR7: Epic 1 — every fact emits an accounting/excluded block (Story 1.1 pattern, all fact stories)
FR8: Epic 1 — special start/end event detection (Story 1.3)
FR9: Epic 1 — brand discount personas (Story 1.4)
FR10: Epic 1 — new-arrival & dormancy feed (Story 1.5)
FR11: Epic 1 — cross-store disparity surfacing + rollups (Story 1.6)
FR12: Epic 1 — brand→store matrix (Story 1.4 sibling / Story 1.6 input)
FR13: Epic 2 — price vs own rolling median (not decomposed here)
FR14: Epic 2 — cheapest-delivered index (not decomposed here)
FR15: Epic 2 — regional price floor + availability gap (not decomposed here)
FR16: Epic 2 cross-cutting — potency ≥80% per-category gate (applies when a potency fact ships)

## Epic List

### Epic 1: Honest daily relational facts, served
The home-machine derivation runner computes a family of bounded, honest, relational facts from `products.db` on each daily run and serves them read-only via Render — turning the raw longitudinal asset into the proprietary facts that are the product's value and the AI-search moat. Delivers: a reusable runner + served-artifact pattern, plus the five Tier-1 facts (special events, brand personas, new-arrival/dormancy feed, cross-store disparity surfacing, brand→store matrix). Every fact obeys the Honesty Contract (Gates 1–5) and reports what it excluded.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12
**Depends on:** ADR-077 Phase 1 substrate (`products-storage-sqlite-phase-1.md`).

### Epic 2: Accrual facts (the honest discount + delivered/regional value)
Tier 2 facts whose value accrues with history: price vs own rolling median (the only honest discount, reopens the fix6 gate), cheapest-*delivered* index, and regional price-floor/availability gaps. Builds on Epic 1's runner + time-series helper.
**FRs covered:** FR13, FR14, FR15 (+ FR16 gate when potency facts ship)
*Not decomposed in this run.*

### Epic 3: Feed the surfaces
AI-search/SEO comparison pages (`AggregateOffer`/`Dataset` schema) + in-app value cards that consume the derived facts. Gated on Epic 2's D6 history and the legal-cleared public-surfacing posture (ADR-066).
**FRs covered:** downstream consumers of FR8–FR15 output.
*Out of scope for this run.*

## Epic 1 — design decisions (party-mode roundtable + advanced elicitation, 2026-07-06)

Winston, Amelia, John, and Mary reviewed the draft 7-story split; consensus reshaped it. These are binding inputs to story creation.

Revised story set and order (dependency-clean — no story depends on a later one):

- 1.0 Substrate (ADR-077 Phase 1). Promoted into this epic as the first story, since every fact stands on it and it is what actually beats the ~Jul 23 file-size wall. Already written as `products-storage-sqlite-phase-1.md`. Load-bearing AC is the golden-file test: DB-backed reader output equals the current products.json output for buildMatchReport and buildDealScopeLinks. Also owns intact history migration (no truncation).
- 1.1 Derivation runner + served-artifact envelope. Stands up the local runner (mirrors scrape-weedmaps-local.ps1) and ports the two already-trusted computations (disparities, deal-scope) through it as served files. This is the pipeline oracle. Defines the honesty envelope. Adds no new fact.
- 1.2 Presence-aware time-series helper (Gate 3 primitive). Ships with a real first consumer so "done" is observable.
- 1.2.5 Source/extraction-health fact. Distinguishes "store menu genuinely empty" from "extraction silently broke" (caravan-cannabis-burlington is the live proof). Consumes 1.2; is itself a derived, gap-tolerant fact. Precondition for the dormancy feed.
- 1.3 Special start/end event detection (D1). Runs through 1.2.
- 1.4 Cross-store disparity rollups (D4). The port already landed in 1.1; this adds only the rollups.
- 1.5 Brand discount personas (D2). Temporal; heaviest G2 exposure.
- 1.6 Brand→store matrix (D5). Cross-sectional; can ship any time after the shared brand-normalizer exists.
- 1.7 New-arrival & dormancy feed (D3). Last of the facts because it is the most dangerous; safe only once extraction-health (1.2.5) exists.
- 1.8 Derivation-run freshness/health alerting. Reuses the existing evaluateAlert pattern; reads generatedAt off the envelope.
- 1.9 Remove /api/products. Last. Open fork (below) still to resolve.

Six design decisions from the second-order analysis (fold into the relevant story's ACs):

- A. Disparity rollups are a SEPARATE artifact (disparity-rollups.json), never a mutation of disparities.json, so the 1.1 oracle stays valid.
- B. Brand-key normalization lives in the shared infra/helper layer, owned once, so the D2 (1.5) vs D5 (1.6) order is free.
- C. Extraction-health (1.2.5) is a derivation-time fact (today's per-store count vs that store's own trailing median from products.db). No scraper change; stays inside the additive boundary (NFR5).
- D. Freshness alerting (1.8) extends the existing evaluateAlert path rather than building a second alert system.
- E. RESOLVED (Erik, flipped to option b): the honesty envelope is a UNIFORM WRAPPER `{ data, excluded[], coverage, generatedAt }` on every artifact, with the disparities `data` field holding the unchanged MatchReport. Chosen over extend-in-place because no client consumes these routes (verified: zero references in `client/`), and the byte-identical oracle lives on the pure `buildMatchReport` function (not the served JSON), so the wrapper does not touch it. Uniformity keeps the route-reader and 1.8 freshness check generic.
- F. One type-gate covers BOTH G2 and G5: narrow the persona/matrix input types so the flat banner rate AND the potency fields are not reachable — the breach does not compile.

G5 (potency) is an explicit NON-GOAL for Epic 1 (THC ~54%, terpenes 0%). Stated so no story quietly adds a potency dimension.

Open fork for 1.9 (remove /api/products): remove now behind a grep-clean gate of all client+server references (Amelia) vs defer past the Epic 3 surface cutover (John). Note: `client/` already has zero references, so the grep-clean side is largely satisfied — resolve when 1.9 is written.

Matcher-precision caution (Mary, for Winston): G1 in the disparity work lives entirely on the same-product join key; a loose key surfaces trim as "cheapest." Match-key precision is an AC on the disparity stories.
