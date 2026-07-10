# Epic derivation-1 Retrospective — Honest daily relational facts, served

**Date:** 2026-07-10
**Participants:** Erikc (Project Lead), Amelia (Developer, facilitating), roundtable roles (PO/Senior Dev/QA)
**Epic status:** done — 11/11 stories (2026-07-07 → 2026-07-10)
**Ratified by Erik:** as drafted; action items 1–2 run PARALLEL to Epic 2 (not blocking dev).

## Delivery metrics

- 11/11 stories done: 1.0 substrate, 1.1 runner+envelope, 1.2 helper, 1.2.5 extraction-health, 1.3 special events, 1.4 disparity rollups, 1.5 brand personas, 1.6 brand→store matrix, 1.7 new-arrival/dormancy, 1.8 freshness alerting, 1.9 remove /api/products (verified already-satisfied, zero code).
- 7 squash-merged PRs, fileset-verified each time — zero squash-drop incidents this epic (the PR#53/#58 lesson held).
- Server suite ~440 → 567 tests; production build green throughout; zero production incidents.
- All 8 derived facts serving live under the honesty envelope; derive run fresh at retro time (generatedAt 2026-07-10T18:02:47Z).

## What went well

1. **Grounding-first story creation** (live products.db checks at story-write time) corrected the spec before dev in 5 of 9 stories: 1.2.5 gained the `insufficient-history` third status; 1.4 caught the stale 217→246 disparity count plus a real geo-join gap (7 stores only in the private Weedmaps registry); 1.5 reframed discount-depth to special-frequency (fix6-honest); 1.7 found an active outage that naive dormancy would have false-fired on ~2,765 SKUs; 1.9 dissolved to zero code.
2. **3-layer adversarial review caught a real defect in every story**: 1.0 fail-soft data-loss risk + 9 more patches; 1.4 tie-inflation of timesCheapest/timesPriciest (up to 13×); 1.6 mg-parse Edibles leak into cheapest cells (201→150); 1.8 unbounded future-skew masking a dead pipeline. Dismissal discipline held: ~40 findings dismissed for contradicting ratified spec decisions — review didn't churn settled design.
3. **Honesty contract enforced structurally**: decision F made banner-rate/potency breaches non-compilable; decision E's uniform envelope let 1.8's freshness check cover all 8 facts with one generic probe.
4. **Dependency ordering was load-bearing**: 1.2.5-before-1.7 is the only reason the live Dutchie outage didn't poison the dormancy feed. The roundtable's "1.7 last, most dangerous" call was proven correct by real events during the epic.

## Challenges / lessons learned

1. **`canonicalWeightGrams` parses mg/count labels as bogus grams** (`"100mg"` → 0.1g). Standing rule: any weight/$-per-gram fact gates by `WEIGHT_BASED_CATEGORIES` + `EXCLUDED_FLAGS` (as `crossStoreValue.ts` does).
2. **Live-proof runs doubled as the only monitoring** until 1.8 — they caught a real ~2-day Dutchie scraper outage twice. 1.8 closes the gap (28h/50h windows + 6h future-skew cap on the envelope generatedAt).
3. **Planning numbers rot in days** (217→246 in under a week). Grounding-at-story-creation is the compensator and stays mandatory.
4. **Wall-clock `today` anchoring** in extraction-health can mass-flag false failures if derive runs before the day's scrape — ops-sequencing concern, deferred (deferred-work.md).

## Open items at close (pre-existing, PARALLEL track per Erik)

- `happy-time-mt-vernon` persistently stale (233h at retro time) — reds every hourly alert-gate email until cleared.
- Recurring Dutchie outage pattern (seen ~2 days twice) — root cause unknown; extraction-health artifact now provides the evidence trail.

## Previous-retro follow-through

First retrospective of the derivation increment. (Epic 6 retro's single action item — Render deploy webhook — was completed 2026-06-17.)

## Next epic preview — Epic derivation-2: Accrual facts (FR13/14/15 + FR16 gate)

All Epic 1 dependencies delivered: products.db + observedAt index, runner + envelope, 1.2 presence-aware helper, shared brandKey normalizer. Nothing discovered this epic invalidates Epic 2's plan — **no epic redefinition required**. Decomposition must fold in:

- The epics doc's data-integrity checkpoint (suspected silent-extraction + runner reliability "before deep accrual") + happy-time-mt-vernon — Erik ruled PARALLEL, not blocking.
- FR13 window/min-obs floor decision (usable history ~16 days at retro; potency only since 2026-07-04; categories expanded 2026-07-04).
- Whole-table `SELECT *` reader vs real SQLite time-range queries (Phase-2 hardening intersects FR13).
- Deferred-work items intersecting FR13: distinct-calendar-day persona floor (1.5 review), chronological-order assumption (1.3 review).
- fix6 gate: FR13 (price vs own rolling median) is exactly the honest-discount path fix6 identified; Epic 2 go-ahead reopens the gate by design.

## Action items

1. Investigate/clear `happy-time-mt-vernon` persistent-stale. Owner: dev (next work session). Success: hourly alert-gate green. Track: PARALLEL to Epic 2.
2. Root-cause the recurring Dutchie outage pattern via the extraction-health evidence trail. Owner: dev. Track: PARALLEL, before deep accrual is trusted.
3. Fold the deferred-work + checkpoint items above into Epic 2 story ACs at decomposition. Owner: Amelia/dev (same session as this retro).
4. Team agreement: grounding-first story creation + 3-layer adversarial review + live-data proof remain mandatory for every Epic 2 story.

## Readiness assessment

- Testing/quality: 567 server tests green; every story adversarially reviewed. ✅
- Deployment: all facts live on gmaslist.com via commit-back artifacts; derive run fresh same-day. ✅
- Stakeholder acceptance: Erik ratified epic completion + this retro. ✅
- Technical health: additive-only epic; deals pipeline untouched (ADR-043/053 preserved). Known debt tracked in deferred-work.md. ✅
- Blockers: none blocking Epic 2 decomposition; two data-integrity items on the PARALLEL track (above).

## Change log

- 2026-07-10: Retro held and ratified; epic-derivation-1-retrospective → done.
