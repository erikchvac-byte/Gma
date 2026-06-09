# Architecture Decision Record — Gma's Helper

## Overview

Gma's Helper (working title; BMad project name: "Happy") is a single-page web app that shows active cannabis happy-hour deals within a user-set road-distance radius from the user's location. Each listing shows miles to the shop and a gas-cost-vs-savings calculation. No browsing, no discovery — just "is this deal worth the drive, right now?"

**Status:** R&D / pre-build. Product brief complete. PRD final (2026-06-08).
**Owner:** Erik (solo founder), Marysville WA area.

---

## Architecture Decisions

### ADR-001: Lightweight Single-Page Web App (no native app)
**Status:** Accepted
**Date:** 2026-06-08
**Context:** Cannabis apps face app-store gatekeeping — Google Play bans cannabis-sale-facilitating apps outright (enforced as of 2025-2026); Apple allows licensed dispensary apps but with geo-restrictions. Texas's App Store Accountability Act (effective 2026-01-01) adds age-verification burdens.
**Decision:** Build as a lightweight browser-based single-page web app. No native mobile app, no app-store presence.
**Rationale:** Sidesteps Google's outright ban and emerging age-verification law entirely. Accessible on any device via browser.
**Consequences:** No push notifications, no app-store discovery. Must be mobile-responsive. Hosting/deployment simpler than native.
**Testing:** N/A at this stage.

### ADR-002: Road-Distance Routing (not straight-line radius)
**Status:** Accepted
**Date:** 2026-06-08
**Context:** User explicitly specified 50-road-miles from zip 98270 (Marysville, WA), excluding destinations requiring ferry crossings (Olympic Peninsula, Bremerton).
**Decision:** Use driving-route distance, not straight-line/as-the-crow-flies radius math.
**Rationale:** Straight-line radius would include unreachable destinations across Puget Sound. Road-distance accurately reflects "is this worth the drive."
**Consequences:** Requires a routing/driving-distance API (meaningfully costlier and more complex than a naive geo-radius filter). Need to evaluate API options (Google Maps Routes API, OSRM, etc.) during architecture phase.
**Testing:** Validate by comparing selected WA dispensary addresses against expected include/exclude results.

### ADR-003: Gas-Cost Calculator — fueleconomy.gov API
**Status:** Accepted
**Date:** 2026-06-08
**Context:** Core differentiator is the gas-cost-vs-savings comparison. Need vehicle MPG data.
**Decision:** Default to live national-average US MPG (refreshed every 24h, no hardcoded value). Optional precision mode via fueleconomy.gov public API (Year/Make/Model cascading dropdowns, persisted in browser localStorage).
**Rationale:** fueleconomy.gov is a free US government API with proper endpoints intended for third-party use — no scraping, no cost, no ToS risk. The default path requires zero user setup.
**Consequences:** Dependency on fueleconomy.gov availability. Need a fallback for the national-average source. Vehicle selection UX must be friction-free (gear icon, 3 taps, saved forever).
**Testing:** Verify fueleconomy.gov API returns expected MPG values for known Year/Make/Model combinations. Verify localStorage persistence across sessions.

### ADR-004: Scrape/Aggregate for Deal Sourcing
**Status:** Accepted (with known open risk)
**Date:** 2026-06-08
**Context:** No centralized real-time deal feed exists for cannabis dispensaries. Deals live on individual dispensary websites, SMS clubs, and Instagram — fragmented.
**Decision:** Scrape and aggregate from publicly available dispensary websites and menus. No manual curation, no dispensary self-submission at launch.
**Rationale:** Only feasible solo-founder approach at launch. Keeps the system independent of dispensary cooperation.
**Consequences:** Open risks — (1) ToS/legal exposure from scraping dispensary sites; (2) operational fragility when sites change layout; (3) data freshness challenges. These must be addressed in architecture work: monitoring for breakage, stale-data fallbacks, legal/ethics position on scraping cannabis retail sites specifically.
**Testing:** Accuracy check — small test group (Erik, wife, possibly a friend) verifies displayed deals match real-world deals when they walk in the door.

### ADR-006: Own-Site Crawling Only for v1 (no aggregator scraping)
**Status:** Accepted
**Date:** 2026-06-08
**Context:** Pre-PRD crawl spike (2026-06-08) confirmed ~60% of area dispensaries serve deal data as plain crawlable HTML. Weedmaps/Leafly deal detail requires JS rendering or private API access. Dispensaries using third-party menu subdomains exclusively have no crawlable own-site deal data.
**Decision:** v1 scrapes own-site HTML only. Weedmaps/Leafly deferred to Phase 2. Dispensaries without crawlable own-site deal data excluded from v1 Coverage Zone.
**Rationale:** Simplest viable approach for R&D validation. Avoids JS rendering dependency and aggregator ToS exposure.
**Consequences:** Coverage is ~60% of area dispensaries. Remaining ~40% excluded until Phase 2. Each new dispensary requires a manually written parser.
**Testing:** Spike confirmed Wild Seed Wellness, Remedy Tulalip, Hangar 420 are crawlable. Parser accuracy validated by test-group trips.

### ADR-007: Happy Hours Primary, Daily Deals Secondary
**Status:** Accepted
**Date:** 2026-06-08
**Context:** Spike found two deal archetypes: time-windowed Happy Hours (e.g., Remedy Tulalip 7–8am, Hangar 420 9pm–close) and all-day Daily Deals (e.g., Wild Seed Wellness brand deals).
**Decision:** Feed surfaces Happy Hours first (sorted by time remaining), then Daily Deals (sorted by discount % descending). Both types are shown; Happy Hours are the priority signal.
**Rationale:** Time-windowed deals are higher-urgency; they expire. Daily Deals fill the feed when no Happy Hours are active.
**Consequences:** Scraper must classify deals by type. Happy Hours without parseable time windows fall back to Daily Deal classification.
**Testing:** Verify sort order and classification in feed during R&D.

### ADR-008: Fixed Origin Point at Zip 98270 for v1 (no user GPS)
**Status:** Accepted (assumption — not explicitly confirmed by Erik)
**Date:** 2026-06-08
**Context:** All Road Distance and Gas Cost calculations require a starting point. Browser geolocation would improve accuracy for users not in Marysville but adds complexity.
**Decision:** Origin fixed at zip 98270 centroid for v1. No browser GPS/geolocation used.
**Rationale:** All R&D test users are in Marysville. Eliminates geolocation permission UX and simplifies routing calls. Revisit if concept validates beyond the local test group.
**Consequences:** Gas Cost estimates are inaccurate for users not in Marysville. Acceptable at R&D scale.
**Testing:** N/A — decision is a simplification for R&D.

### ADR-009: Side-by-Side Discount Display (not computed Net Savings dollar figure)
**Status:** Accepted
**Date:** 2026-06-08
**Context:** PRD authoring revealed deals are published as percentages (e.g., "35% off"), not dollar amounts. Computing a dollar Net Savings requires knowing the user's intended spend, which is unknown.
**Decision:** v1 shows "X% off — $Y to get there" side by side (Discount Display) rather than a collapsed Net Savings number.
**Rationale:** Side-by-side is honest — no invented basket size. SM-3 in the PRD validates whether users find this sufficient to make a go/no-go decision.
**Consequences:** The "is it worth it?" verdict is less instant than a single number. If SM-3 fails (users want a dollar figure), Phase 2 options are: fixed assumed basket size, or user-entered intended spend.
**Testing:** SM-3 — test group confirms Discount Display was sufficient for trip decisions.

### ADR-005: Non-Intrusive Ads Only
**Status:** Accepted
**Date:** 2026-06-08
**Context:** Need revenue mechanism. User experience is paramount.
**Decision:** Banner/sidebar ad placements only. No pop-ups, no interstitials, nothing that blocks content. If a design choice makes the page harder to use in exchange for ad placement, the ad loses.
**Rationale:** The product's value is instant, unobstructed deal information. Any ad that competes with that destroys the reason users came.
**Consequences:** Revenue ceiling is lower than aggressive ad products. Acceptable — revenue goals are intentionally modest.
**Testing:** N/A at R&D stage.

---

## Technical Constraints

- US only, v1 zone: 50 road-miles from zip 98270 (Marysville, WA), no ferry crossings
- Road-distance routing required (not straight-line)
- Deal data sourced by scraping public dispensary sites — no API or partnership dependency at launch
- Gas-cost calc: fueleconomy.gov API + live national-average MPG default
- Browser-based only; vehicle selection persisted in localStorage
- Web app must be mobile-responsive (primary use case: checking from a phone before getting in the car)

---

## Testing Results

- **R&D accuracy bar (6-month):** Small test group confirms displayed deals match real-world deals at stores, and gas-cost math holds up. No traffic/revenue targets at this stage.

---

## Known Issues

- Deal scraping fragility and ToS exposure: unresolved, flagged for architecture phase
- Routing API selection: not yet decided (see ADR-002 consequences)
- National-average MPG live source: not yet specified
- Gas Price daily source not yet selected (EIA, AAA, or GasBuddy — OQ-1 in PRD)
- Discount Display (side-by-side % + gas cost) may be insufficient as a go/no-go signal — validated by SM-3 in R&D (see ADR-009)

---

## Open Questions

- Which routing API for road-distance calculation? (cost, accuracy, ferry-exclusion capability) — PRD OQ-2
- What is the live source for US national-average vehicle MPG? — PRD OQ-3
- Which public source for daily Gas Price? (EIA, AAA, GasBuddy) — PRD OQ-1
- Legal/ethical position on scraping cannabis retail sites in WA state? — PRD OQ-5
- Scraper infrastructure: co-located job vs. separate cron/serverless? — PRD OQ-4
- Is Discount Display (% + gas cost side by side) sufficient for users to decide, or is a computed dollar savings figure needed? — PRD OQ-7

---

## Future Considerations

- Expand service zone beyond 50-mile R&D radius if validation succeeds
- User-submitted deal corrections / accuracy feedback mechanism
- Dispensary self-submission portal (if scraping proves unreliable)

---

## References

- Brief: `_bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/brief.md`
- Addendum (technical specs): `_bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/addendum.md`
- Brief decision log: `_bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/.decision-log.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-Happy-2026-06-08/prd.md`
- PRD decision log: `_bmad-output/planning-artifacts/prds/prd-Happy-2026-06-08/.decision-log.md`
- fueleconomy.gov API: https://www.fueleconomy.gov/feg/ws/

---

## Change Log

| Date | Change |
|------|--------|
| 2026-06-08 | Initial ADR created. Product brief session complete. ADR-001 through ADR-005 recorded from brief decisions. |
| 2026-06-08 | PRD session complete. PRD finalized. ADR-006 through ADR-009 added from PRD decisions and crawl spike. Open questions updated. Status updated to PRD final. |
