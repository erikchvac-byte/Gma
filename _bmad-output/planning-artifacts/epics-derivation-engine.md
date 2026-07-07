---
stepsCompleted: [1, 2, 3]
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
FR9: Epic 1 — brand discount personas (Story 1.5)
FR10: Epic 1 — new-arrival & dormancy feed (Story 1.7)
FR11: Epic 1 — cross-store disparity surfacing + rollups (Story 1.4)
FR12: Epic 1 — brand→store matrix (Story 1.6)
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

## Epic 1 — Stories

Order is dependency-clean: no story depends on a later one. The Honesty Contract (Gates 1–5 + Inspectability) applies to every fact story; each story below states only the gates it actively exercises, but all gates remain in force.

The **honesty envelope** (decision E, resolved) is the uniform shape every served artifact uses:

```
{ data: <fact payload>, excluded: <accounting entries[]>, coverage: <coverage summary>, generatedAt: <ISO timestamp> }
```

### Story 1.0: Products-DB substrate (ADR-077 Phase 1)

As a derivation-engine maintainer,
I want `products.db` (SQLite) plus a DB-backed reader that returns the existing `ProductsFile` shape,
So that every fact stands on a queryable store with intact history, and the ~Jul-23 file-size wall is beaten.

Detailed spec lives in `_bmad-output/implementation-artifacts/products-storage-sqlite-phase-1.md` (status: ready-for-dev). Summarized here so the epic is self-contained.

**Acceptance Criteria:**

**Given** the current `products.json` history
**When** the migration runs
**Then** all observations land in `products.db` with zero truncation (full raw history preserved, NFR4)
**And** an index exists on `observation.observedAt` sized for the derivation engine's time-range queries (FR6/FR13 forward-coupling).

**Given** the DB-backed reader and the current in-memory `ProductsFile` reader
**When** `buildMatchReport` and `buildDealScopeLinks` are run through each
**Then** the outputs are byte-identical (golden-file parity test) — the pure fact-functions are unchanged; only their input source is swapped.

**Given** the substrate is in place
**Then** no existing type's behavior changes and the deals pipeline is untouched (NFR5, ADR-043/053).

### Story 1.1: Derivation runner + served-artifact envelope

As a derivation-engine maintainer,
I want a home-machine runner that computes facts from `products.db` and commits bounded JSON artifacts that Render serves read-only,
So that there is a proven, honest pipeline (the oracle) before any new fact is added.

**Acceptance Criteria:**

**Given** the residential-scrape runner pattern (`scripts/scrape-weedmaps-local.ps1`)
**When** `scripts/derive-facts-local.ps1` runs
**Then** it uses a detached git worktree, hard-resets to `origin/master`, runs `server/scripts/deriveFactsRun.ts`, commits back only `server/data/derived/*.json` with `[skip ci]`, and pushes master (FR1).

**Given** the two already-trusted computations (cross-store disparities, deal-scope links)
**When** the runner emits them
**Then** each is written to `server/data/derived/` wrapped in the honesty envelope `{ data, excluded, coverage, generatedAt }` (decision E)
**And** the disparities `data` field holds the unchanged `MatchReport` payload — the byte-identical oracle continues to live on the pure `buildMatchReport` function, not on the served JSON (decision E rationale).

**Given** Render
**When** it serves a derived artifact
**Then** it reads the committed file only — it never opens a connection to the home DB and never recomputes a fact at request time (FR2, NFR2).

**Given** the disparity port
**Then** the same-product join key precision is asserted (G1): trim/other-form products cannot be surfaced as "cheapest" of a different product (Mary's match-key caution).

**Given** any emitted artifact
**Then** it carries an `excluded[]` accounting block (FR7, Inspectability) and is bounded in size (NFR2)
**And** `data.json`, the deals pipeline, and existing types' behavior are unchanged (FR3, NFR5).

### Story 1.2: Presence-aware time-series helper (Gate 3 primitive)

As a fact author,
I want a shared helper that walks a per-SKU observation series while distinguishing "no observation that day" from "observed, unchanged,"
So that every trend/delta fact is gap-tolerant by construction rather than by ad-hoc per-fact logic.

**Acceptance Criteria:**

**Given** an observation series with a missing day
**When** the helper walks it
**Then** it reports that day as "no observation" (a gap), never as "observed, unchanged" or as a change event (Gate 3, FR6).

**Given** two consecutive observations with identical values
**When** the helper walks them
**Then** it reports "observed, unchanged" (distinct from a gap).

**Given** the helper ships
**Then** it ships with at least one real first consumer wired through it (so "done" is observable, not a dormant utility) — that consumer is Story 1.2.5.

**Given** the helper
**Then** it lives as an additive module under `server/utils/` and changes no existing behavior (NFR5)
**And** it has strict-typed unit tests covering gap, unchanged, and change cases (NFR6).

### Story 1.2.5: Source/extraction-health fact

As a derivation-engine maintainer,
I want a derived fact that flags when a store's menu likely broke in extraction versus is genuinely empty,
So that downstream facts (especially the dormancy feed) are not computed over a silently-holed asset.

**Acceptance Criteria:**

**Given** each store's product count for today and that store's own trailing median count from `products.db`
**When** the fact computes at derivation time
**Then** it flags a suspected silent-extraction failure when today's count collapses against the store's trailing median (decision C) — computed entirely at derivation time, with no scraper change, inside the additive boundary (NFR5).

**Given** `caravan-cannabis-burlington` (the live suspected-failure proof)
**Then** the fact surfaces it as suspected-extraction-failure rather than empty-menu.

**Given** a store that is genuinely "COMING SOON"/empty
**Then** the fact distinguishes it from an extraction break (does not falsely flag).

**Given** the fact
**Then** it consumes the 1.2 helper, is gap-tolerant, emits an `excluded[]`/coverage block in the envelope (FR7), and has strict-typed tests (NFR6).

### Story 1.3: Special start/end event detection (D1)

As a shopper-facing data consumer,
I want per-SKU special-start and special-end events detected from the observation series,
So that "today's price change" is surfaced honestly as a special beginning or ending (since list prices are sticky and all movement is specials).

**Acceptance Criteria:**

**Given** a SKU whose `specialPrice` appears where none was
**When** the fact runs through the 1.2 helper
**Then** it emits a special-start event; when a `specialPrice` disappears it emits a special-end event (FR8).

**Given** a gap in the series
**Then** a missing day is never emitted as a special-start or special-end (Gate 3) — the ambiguity is preserved, not resolved into an event.

**Given** the discount magnitude
**Then** the fact does not present the banner/product-special discount % as a signal of value (Gate 2); it reports the event, not a "how good is this deal" claim.

**Given** the fact
**Then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests including the gap case (NFR6).

### Story 1.4: Cross-store disparity rollups (D4)

As a data consumer,
I want rollups over the already-computed cross-store disparities,
So that the keystone fact is summarizable (by category, brand, geo) without recomputing or mutating the base disparities artifact.

**Acceptance Criteria:**

**Given** the disparities artifact ported in Story 1.1
**When** rollups are computed
**Then** they are written to a SEPARATE artifact `disparity-rollups.json`, never as a mutation of `disparities.json` — so the 1.1 oracle stays valid (decision A).

**Given** each disparity feeding a rollup
**Then** it rests on the same-product join key (G1); a loose key must not let a different product inflate a rollup (match-key precision AC).

**Given** the rollups
**Then** each $/gram comparison is honest same-product cross-store only — no whole-catalog leaderboard (Gate 1).

**Given** the artifact
**Then** it uses the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests (NFR6).

### Story 1.5: Brand discount personas (D2)

As a data consumer,
I want a per-brand persona (always-on-special / never-discounted / typical discount depth) derived from ~12 days of history,
So that brand-level discounting behavior is characterized honestly over time.

**Acceptance Criteria:**

**Given** a brand's observation history
**When** the persona is computed
**Then** it classifies always-on-special / never-discounted / typical depth from the temporal series via the 1.2 helper, gap-tolerant (FR9, Gate 3).

**Given** the discount inputs
**Then** the persona's input type is narrowed so the flat banner/store-wide promo rate is NOT reachable (decision F, Gate 2) — a persona built on the meaningless flat rate does not compile.

**Given** potency
**Then** the same type-gate makes potency fields unreachable here (decision F, Gate 5); Epic 1 adds no potency dimension.

**Given** brand identity
**Then** a shared brand-key normalizer is added to the shared helper layer and owned once (decision B), so 1.5 and 1.6 can ship in either order.

**Given** the fact
**Then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests, including a compile-level test that the banner-rate/potency breach is unreachable (NFR6, decision F).

### Story 1.6: Brand→store matrix (D5)

As a data consumer,
I want a matrix of which stores carry each brand, at what tiers, and cheapest,
So that brand availability and price positioning across stores is a queryable fact (and a feed for personas).

**Acceptance Criteria:**

**Given** fields present on every product record
**When** the matrix is built
**Then** it is a pure cross-sectional grouping (brand → stores → tiers → cheapest) requiring no new derivation, using the shared brand-key normalizer from 1.5 (decision B).

**Given** "cheapest" per cell
**Then** it rests on the same-product join key where a $/gram claim is made (Gate 1, match-key precision); grouping by brand alone never asserts a cross-product price winner.

**Given** the input type
**Then** the flat banner rate and potency fields are unreachable (decision F, Gates 2/5).

**Given** the fact
**Then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests (NFR6).

### Story 1.7: New-arrival & dormancy feed (D3)

As a data consumer,
I want a per-run feed of genuinely-new and newly-dormant SKUs,
So that catalog turnover is surfaced without ever mistaking a missed scrape for a delisting.

Placed last of the facts because it is the most dangerous; safe only once extraction-health (1.2.5) exists.

**Acceptance Criteria:**

**Given** a SKU absent from a single run
**When** the feed computes dormancy
**Then** it MUST carry the missed-scrape-ambiguity flag and never assert removal from one absent run (Gate 4, FR10).

**Given** a store flagged by 1.2.5 as suspected-extraction-failure
**Then** SKUs absent under that store are NOT emitted as dormant (the feed consumes extraction-health, so a silent hole is not read as delisting).

**Given** a genuinely new SKU
**Then** it is emitted as a new-arrival via the 1.2 helper, gap-tolerant (Gate 3).

**Given** the fact
**Then** it emits the honesty envelope with `excluded[]`/coverage (FR7) and has strict-typed tests covering the missed-scrape and extraction-hole cases (NFR6).

### Story 1.8: Derivation-run freshness / health alerting

As a derivation-engine maintainer,
I want alerting on the freshness and health of the derivation run,
So that a stalled or unhealthy run is caught, reusing the existing alert path rather than a second system.

**Acceptance Criteria:**

**Given** the existing `evaluateAlert` path
**When** freshness alerting is added
**Then** it extends that path rather than building a second alert system (decision D).

**Given** a served artifact
**When** the freshness check runs
**Then** it reads `generatedAt` off the honesty envelope (uniform wrapper makes the check generic across artifacts, decision E).

**Given** a run older than the freshness window
**Then** an alert fires; a fresh run does not (parity with the existing alert-gate discipline — reds only on real staleness).

**Given** the change
**Then** it is additive and strict-typed with tests (NFR5, NFR6).

### Story 1.9: Remove /api/products

As a derivation-engine maintainer,
I want `/api/products` removed so Render serves only derived facts,
So that the raw request-time products route is retired (FR4) and ADR-077 Phase 1 open-decision #2 is resolved.

**Open fork (to resolve with Erik before this story is dev'd):** remove now behind a grep-clean gate of all client + server references (Amelia) vs defer past the Epic 3 surface cutover (John). `client/` already has zero references, so the grep-clean side is largely satisfied. ACs below are written for the remove-now path; if deferred, this story moves to Epic 3.

**Acceptance Criteria:**

**Given** the codebase
**When** `/api/products` is removed
**Then** a grep of `client/` and `server/` returns zero remaining references to the route (grep-clean gate) before merge.

**Given** the derived-facts artifacts
**Then** they fully cover what any prior `/api/products` consumer needed (no capability is silently dropped).

**Given** the removal
**Then** the deals pipeline and `data.json` are untouched (FR3), the build is green, and no existing type's behavior changes (NFR5).

## Epic 1 — Story summary

11 stories: 1.0 (substrate), 1.1 (runner + envelope), 1.2 (time-series helper), 1.2.5 (extraction-health), 1.3 (special events / D1), 1.4 (disparity rollups / D4), 1.5 (brand personas / D2), 1.6 (brand→store matrix / D5), 1.7 (new-arrival & dormancy / D3), 1.8 (freshness alerting), 1.9 (remove /api/products).

FR coverage for Epic 1: FR1 (1.1), FR2 (1.1), FR3 (1.1 + cross-cutting), FR4 (1.9), FR5 (1.1), FR6 (1.2), FR7 (all fact stories), FR8 (1.3), FR9 (1.5), FR10 (1.7), FR11 (1.4), FR12 (1.6). All Epic 1 FRs covered.

Decisions folded: A→1.4, B→1.5/1.6, C→1.2.5, D→1.8, E→1.1 (all artifacts), F→1.5/1.6. Open: 1.9 fork.
