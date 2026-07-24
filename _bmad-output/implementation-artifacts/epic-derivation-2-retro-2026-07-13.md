# Epic derivation-2 Retrospective — Accrual facts (the honest discount + delivered/regional value)

**Date:** 2026-07-13
**Participants:** Erikc (Project Lead), Amelia (Developer, facilitating), roundtable roles (PO/Senior Dev/QA)
**Epic status:** done — 3/3 stories (2026-07-11 → 2026-07-13)
**Ratified by Erik:** as drafted. Decisions captured below (Epic 3 direction; oracle-freshness promoted to one named story).

## Delivery metrics

- 3/3 stories done, all 3-layer adversarially reviewed:
  - 2.1 price-vs-own-rolling-median (D6/FR13, fix6 keystone) — 7/7 ACs; first real consumer of the `(product_key, observedAt)` SQLite indices; series key = (product, option label verbatim), effective price = `specialPrice ?? basePrice` single-reduced at runner boundary; min-obs floor in distinct calendar days.
  - 2.2 cheapest-delivered input fact (D7/FR14) — 4/4 ACs; per match-key `specialPrice ?? basePrice` + store lat/lng, NO baked-in origin (ADR-057) — delivered cost composes user-relatively downstream via existing `roundTripGasCost`.
  - 2.3 regional price-floor + availability gap (D8/FR15, ADR-086) — 5/5 ACs; union-find single-linkage clustering (haversine R=3958.8, `CLUSTER_RADIUS_MILES=10` Erik-ratified), 3rd sibling of 1.4/2.2.
- Server suite 567 → 678 tests green; production build clean throughout; zero production incidents.
- fix6 gate closed the honest way: FR13 shipped price-vs-own-median as the only honest discount path fix6 identified — Epic 2 go-ahead reopened the gate by design, and it closed clean.

## What went well

1. **Grounding-first held for a third epic.** Every story re-checked against live products.db at write time: 2.1 grounded ~16-day usable history and ships suppression-heavy by design (207 below own median at floor 7); 2.3 caught a pre-written centroid-fixture bug (diagonal ≈10.10mi asserting a merge just outside the 10mi radius; lng +0.1→+0.05).
2. **The Epic 1 sibling pattern paid off.** 2.2 and 2.3 slotted in as the 2nd/3rd siblings of 1.4 (`crossStoreValue.ts`), reusing disparities + geoLookup + storeStatus with no rebuild. 2.3's floors reconciled byte-for-byte (432 floors, 0 mismatches) against the committed disparities.
3. **Honesty gates stayed structural, not aspirational.** Gate-1 ≥2-store cells, `WEIGHT_BASED_CATEGORIES`/`EXCLUDED_FLAGS` mg-parse gating, and the FR16 type-gate carried across all three — no banner-rate or potency claim could compile.
4. **Reviews found real defects again, dismissal discipline held.** 2.1: same-day time-latest tie-break + UTC-midnight anchor fixes. 2.3: `Number.isFinite` geo guard vs NaN/Infinity phantom singletons + module-wide `localeCompare` collation consistency; 10 findings dismissed for contradicting ratified spec decisions.

## Challenges / lessons learned

1. **The UTC-day seam is a live footgun on two facts now.** 2.1 anchors `today` to the UTC date; a run just after 00:00 UTC (~5pm PDT) lands every floor-clearing series in `noObservationToday` and commits `rows: []` over the live fact until the next scrape+derive. Benign at the scheduled ~10:30 UTC cadence, but it's the same wall-clock caveat inherited from 1.2.5 — deferred, not fixed. If the schedule ever moves near the seam: anchor `today` to the max observed day in the DB, or guard the write when `comparedCount` collapses to 0 while the DB has same-day data.
2. **The disparity oracle's stale-price property is now engine-wide.** 2.3's review surfaced that a `suspected-extraction-failure` store can set a regional floor from a stale prior-day price (`buildMatchReport` uses each product's latest observation with no today gate). It's inherited identically by disparities/cheapest-delivered/rollups — a fix belongs at the `buildMatchReport` freshness layer, hitting every disparity-derived fact at once. This converges with the Epic 1 parallel items (mt-vernon stale, Dutchie outage): **the theme is that the oracle has no freshness gate.**
3. **History is still young — accrual is the compensator.** 2.1 ships suppression-heavy (~16 days usable, floor at 7 calendar days). The fact grows more useful purely with time; no code needed, just accumulation.

## Open items at close (parallel track, converged)

- Epic 1 action items 1–2 remain live and have converged with the 2.3 stale-floor finding into one root cause: `happy-time-mt-vernon` persistent-stale + the recurring Dutchie outage + the oracle stale-price property are all the missing freshness gate at `buildMatchReport`. **Erik's decision: promote to a single named story** (below), no longer loose parallel chores.

## Previous-retro follow-through

Epic derivation-1 retro (2026-07-10) committed 4 action items:

1. Clear `happy-time-mt-vernon` persistent-stale — ⏳ NOT yet cleared; folded into the new oracle-freshness story.
2. Root-cause recurring Dutchie outage — ⏳ NOT closed; same fold. The extraction-health artifact (1.2.5) now provides the evidence trail as intended.
3. Fold deferred-work + checkpoint items into Epic 2 story ACs at decomposition — ✅ done; the FR13 window/floor, distinct-calendar-day, and chronological-order items were addressed in the 2.1/2.3 ACs.
4. Grounding-first + 3-layer review + live-data proof mandatory every story — ✅ held for all 3 Epic 2 stories.

Learning: the two data-integrity items (1, 2) survived a full epic as "parallel, non-blocking." Epic 2's own review then proved they're one engine-level property, not two chores — which is why they're now a promoted, named story rather than a standing parallel note.

## Next epic preview — Epic derivation-3: Feed the surfaces

Already in-progress. Story 3-1 (SEO `/compare` pages) sits at `review`. What Epic 2 changed:

- **In-app value cards are now unblocked.** The flagship "how good is this deal vs its own history" card depended on 2.1/FR13, which just shipped — it was the sole blocker (deferred-work, Epic 3 slice decision 2026-07-10).
- No discovery in Epic 2 invalidates Epic 3's plan. **No epic redefinition required.**

## Action items

1. **Close out story 3-1** (`review` → `done`) via code review, then continue Epic 3. Owner: dev, next session. (Erik's Epic 3 direction: close 3-1, then in-app value cards.)
2. **Create the in-app value-cards story** for Epic 3 after 3-1 closes — now unblocked by FR13. Owner: Amelia/dev at story creation. Grounding-first as usual.
3. **Promote oracle-freshness to one named story:** a today/freshness gate at the `buildMatchReport` layer, absorbing mt-vernon persistent-stale + Dutchie-outage root-cause + the 2.3 stale-floor finding. Affects every disparity-derived fact at once. Owner: dev. Track: parallel to Epic 3, but now a real story, not loose chores.
4. **Team agreement continues:** grounding-first story creation + 3-layer adversarial review + live-data proof remain mandatory for every Epic 3 story.

## Readiness assessment

- Testing/quality: 678 server tests green; every story adversarially reviewed. ✅
- Deployment: all facts serve live on gmaslist.com via commit-back artifacts; 2.3 live-proofed over committed disparities.json (0 mismatches). ✅
- Stakeholder acceptance: Erik ratified epic completion + this retro. ✅
- Technical health: additive-only epic; deals pipeline untouched (ADR-043/053 preserved). Known debt tracked in deferred-work.md. ✅
- Blockers: none blocking Epic 3; the oracle-freshness theme is the one real carry-forward, now owned as a named story.

## Change log

- 2026-07-13: Retro held and ratified; epic-derivation-2-retrospective → done. Decisions: Epic 3 = close 3-1 then value cards; oracle-freshness promoted to one named parallel story.
