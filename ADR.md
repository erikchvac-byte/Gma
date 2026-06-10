# Architecture Decision Record — Gma's Helper

## Overview

Gma's Helper (working title; BMad project name: "Happy") is a single-page web app that shows active cannabis happy-hour deals within a user-set road-distance radius from the user's location. Each listing shows miles to the shop and a gas-cost-vs-savings calculation. No browsing, no discovery — just "is this deal worth the drive, right now?"

**Status:** Implementation in progress. Epic 1 (Foundation & Data Layer): stories 1.1–1.3 implemented. Epic 2 (Core Deal Experience): Story 2.1 Age Gate done (2026-06-10); Story 2.2 Deal Feed implemented (2026-06-10); next: Story 2.3 Deal Cards.
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
**Status:** Superseded by ADR-011
**Date:** 2026-06-08
**Context:** User explicitly specified 50-road-miles from zip 98270 (Marysville, WA), excluding destinations requiring ferry crossings (Olympic Peninsula, Bremerton).
**Decision:** Use driving-route distance, not straight-line/as-the-crow-flies radius math.
**Rationale:** Straight-line radius would include unreachable destinations across Puget Sound. Road-distance accurately reflects "is this worth the drive."
**Consequences:** Requires a routing/driving-distance API (meaningfully costlier and more complex than a naive geo-radius filter). Need to evaluate API options (Google Maps Routes API, OSRM, etc.) during architecture phase.
**Testing:** Validate by comparing selected WA dispensary addresses against expected include/exclude results.
**Superseded by:** ADR-011 (hardcoded JSON lookups eliminate the routing API entirely for R&D).

### ADR-003: Gas-Cost Calculator — fueleconomy.gov API + Hardcoded National MPG
**Status:** Accepted (refined by ADR-013)
**Date:** 2026-06-08 / Refined 2026-06-09
**Context:** Core differentiator is the gas-cost-vs-savings comparison. Need vehicle MPG data.
**Decision:** Default MPG is hardcoded at 28 (US fleet average) — see ADR-013. Optional precision mode via fueleconomy.gov public API (Year/Make/Model cascading dropdowns, persisted in browser localStorage). fueleconomy.gov API returns XML; client must send `Accept: application/json` header.
**Rationale:** fueleconomy.gov is a free US government API with proper endpoints intended for third-party use — no scraping, no cost, no ToS risk. The default path requires zero user setup.
**Consequences:** Dependency on fueleconomy.gov availability for precision mode. Fallback: show error in dropdown, Gas Cost falls back to nationalMpg silently.
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

### ADR-010: Lean R&D Stack (Vite + React + Express + data.json)
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Architecture phase — need a full-stack for R&D validation. Priorities: zero infrastructure cost, zero setup friction, maximum iteration speed for solo founder.
**Decision:** Frontend: Vite 6.3 + React + TypeScript + Tailwind CSS v4. Backend: Express v5 + Node.js + TypeScript (tsx). Storage: data.json flat file. Scraper: Axios 1.17 + Cheerio 1.2. Scheduler: setInterval in Express process.
**Rationale:** Every choice eliminates a dependency that would slow R&D validation. No database migrations, no cloud scheduler, no infrastructure provisioning.
**Consequences:** data.json will not scale past ~50 dispensaries without migration to SQLite. setInterval is not production-grade scheduling. Both acceptable for R&D phase.
**Testing:** R&D validation trip accuracy (SM-1, SM-2).

### ADR-011: Hardcoded Road Distance Lookups (no routing API for v1)
**Status:** Accepted — supersedes ADR-002 for R&D
**Date:** 2026-06-09
**Context:** ADR-002 flagged routing API as required. Architecture phase evaluated cost vs. R&D scale (~20–50 dispensaries, static locations, fixed origin at 98270).
**Decision:** Pre-compute road distance (via Google Maps, once) from zip 98270 to each dispensary and hardcode in `data.json` as `distanceMiles`. No routing API call at runtime.
**Rationale:** Dispensary locations are static. Zero API cost, zero latency, zero failure mode. Ferry exclusion handled at data-entry time (excluded dispensaries never added).
**Consequences:** Adding a new dispensary requires a one-time manual distance lookup. Not suitable if user-variable origin points are added later.
**Testing:** Spot-check computed distances against Google Maps for 3–5 dispensaries.

### ADR-012: EIA API for Gas Price (daily ≤24h refresh)
**Status:** Accepted
**Date:** 2026-06-09
**Context:** PRD OQ-1 — needed a reliable public source for US average gas price. Options: EIA (US govt), GasBuddy (unofficial API, fragile), AAA (no public API, requires scraping).
**Decision:** EIA (Energy Information Administration) public API. Refreshed daily (≤24h) in `refreshGasPrice.ts`. API key stored in `.env` as `EIA_API_KEY`.
**Rationale:** Free, official, stable. Daily (≤24h) cadence is sufficient — gas price fluctuations don't flip go/no-go decisions. GasBuddy/AAA scraping would be a maintenance liability.
**Consequences:** Gas price may be up to 24h stale. Acceptable given SM-2's 15% accuracy margin.
**Testing:** SM-2 — gas cost within 15% of actual trip fuel cost.

### ADR-013: Hardcoded National Average MPG (28 for R&D)
**Status:** Accepted
**Date:** 2026-06-09
**Context:** PRD required a daily-refreshed national-average MPG figure. No reliable live API found for a single fleet-average number (fueleconomy.gov endpoints are vehicle-specific, not fleet-average).
**Decision:** Hardcode `nationalMpg: 28` in `data.json` meta. Update manually if fleet average shifts significantly.
**Rationale:** US fleet average consistently ~28–30 MPG. Satisfies SM-2 (15% accuracy margin). Eliminates a live API dependency.
**Consequences:** Inaccurate for heavy truck owners; precision mode (ADR-003) mitigates this. If users complain math feels off, add a simple "Your MPG" text input later.
**Testing:** SM-2 — gas cost within 15% of actual trip fuel cost.

### ADR-014: data.json + logs.json Flat File Storage
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Need persistent storage for dispensary config, cached deals, gas price meta, and scraper run logs.
**Decision:** Two JSON files: `data.json` (frontend-served data) and `logs.json` (operator-only scraper log). Writes are atomic (write to `data.tmp.json`, rename). `logs.json` never served to frontend.
**Rationale:** Zero cost, zero setup, zero migrations. Sufficient for R&D scale. Separation of concerns: scraper log bloat doesn't affect frontend payload.
**Consequences:** Not suitable for concurrent writes (single-process Node.js avoids this at R&D scale). Upgrade path: SQLite when dispensary count exceeds ~50.
**Testing:** Verify atomic write prevents partial data from being served during scraper runs.

### ADR-015: Single GET /api/data Endpoint with Server-Side Active Deal Filtering
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Need API design for frontend to consume deal data. Active deal status depends on Pacific Time — timezone logic must be centralized.
**Decision:** Single `GET /api/data` endpoint returns `{ meta, dispensaries[] }` with active deals pre-filtered. Server enforces `TZ=America/Los_Angeles` as the first line of `index.ts`.
**Rationale:** Timezone logic in one place (server). Frontend stays stateless — client-side filter is distance only.
**Consequences:** All time-zone sensitive logic couples to the server. Acceptable — this is a feature, not a bug.
**Testing:** Verify Happy Hours that have expired do not appear in API response. Verify Daily Deals expire at Pacific midnight.

### ADR-016: Axios + Cheerio Scraper with Python Microservice Upgrade Path
**Status:** Accepted (refined by ADR-017)
**Date:** 2026-06-09
**Context:** Need to scrape dispensary HTML for deal data. Most target sites serve plain HTML; some require JS rendering (Dutchie iFrame menus specifically).
**Decision:** Axios + Cheerio for plain HTML scrapers. Upgrade individual scrapers to call the Python Scraper microservice (ADR-017) if a site requires a real browser runtime.
**Rationale:** Cheerio is lightweight and fast for plain HTML. The Python Scraper handles browser complexity without bringing Playwright into the Node.js process.
**Consequences:** Sites that load deals via JavaScript will fail silently (empty `Deal[]` returned) until upgraded to call the Python service.
**Testing:** Verify each dispensary scraper returns expected Deal[] before adding to production data.json.

### ADR-017: Python Scraper Microservice for Dutchie/iFrame Dispensaries
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Dutchie iFrame menus cannot be scraped by Axios+Cheerio — menu data is loaded by JavaScript inside an iFrame and is invisible to standard HTTP clients. Happy Time (the primary target dispensary) uses Dutchie for all three WA locations (Mt Vernon, Pullman, Yakima). A working Python Playwright microservice already exists at `C:\Users\erikc\Dev\Scraper` (FastAPI on port 8000), tested against live Dutchie menus.
**Decision:** Dutchie dispensary scraper files in `server/scrapers/` call `POST http://localhost:8000/scrape` on the Python Scraper service via a shared `server/utils/scraperClient.ts` wrapper. The TypeScript scraper file transforms raw GraphQL JSON (`intercepted[].data`) → `Deal[]`. The scraper contract (`export default async function scrape(): Promise<Deal[]>`) is unchanged — `runScrapers.ts` has no knowledge of which tier a scraper uses.
**Rationale:** The Python Scraper encapsulates browser automation, playwright-stealth fingerprint spoofing, and GraphQL network interception. Isolating this complexity in a separate service means Dutchie API changes, stealth patches, and browser engine upgrades never touch the Node.js codebase. The Happy scraper files stay thin — they own only the business logic (GraphQL → Deal transform).
**Consequences:** Dutchie scrapers require the Python service on port 8000. Local dev: start Python service alongside Node.js. Production: both processes must be deployed (Docker Compose at `C:\Users\erikc\Dev\Scraper\docker-compose.yml`). If the service is unavailable, `scraperClient.ts` catches the error and the scraper returns `[]` — existing stale-handling in `runScrapers.ts` applies.
**Testing:** Verify Happy Time Mt Vernon `scrape()` returns non-empty `Deal[]` with Scraper service running. Verify `[]` returned (no throw) when service is down.

### ADR-018: Build-Time Data Copy Script for dist/
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Code review of Story 1.3 found that `tsc` only compiles `.ts` files — `server/data/data.json` and `server/data/logs.json` were never copied to `dist/`, so `dataRoute.ts`'s `__dirname`-relative `DATA_PATH` resolved to a non-existent file in production builds, causing `/api/data` to return 500.
**Decision:** Added `server/scripts/copyData.mjs` (Node `cpSync`/`mkdirSync`, cross-platform) that copies `server/data/` → `dist/server/data/`, run via `server/package.json`'s `build` script (`tsc && node scripts/copyData.mjs`).
**Rationale:** Keeps `__dirname`-relative paths in `dataRoute.ts` valid at the same relative depth in both dev (tsx) and built (`dist/`) environments, without changing the route code itself.
**Consequences:** Any future non-`.ts` runtime asset under `server/` must be added to `copyData.mjs` or it will be silently missing from `dist/`.
**Testing:** Verified end-to-end — built the project, ran `dist/server/index.js` with `NODE_ENV=production`, confirmed `GET /api/data` returns 200 with correct data (previously 500/ENOENT).

### ADR-019: Root package.json start/build Scripts Aligned to dist/server/ Output
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Following ADR-015's `rootDir: ".."` change, `tsc` output moved from `server/dist/index.js` to `server/dist/server/index.js`, but the root `package.json`'s `start` script (`node server/dist/index.js`) and `build` script (bare `cd server && npx tsc`, skipping `copyData.mjs`) were not updated — found during Story 1.3 code review.
**Decision:** Root `start` → `node server/dist/server/index.js`. Root `build` → `npm run build --prefix client && npm run build --prefix server` (delegates to server's own build script, which includes `copyData.mjs`).
**Rationale:** Single source of truth for the server build process lives in `server/package.json`; the root scripts should delegate rather than duplicate/diverge.
**Consequences:** None — root scripts now match actual build output paths.
**Testing:** Verified `npm run build` (root) → `npm start` (root) → `GET /api/data` returns 200.

### ADR-020: Overnight Deal Time-Window Handling in filterActiveDeals
**Status:** Accepted
**Date:** 2026-06-09
**Context:** Story 1.3 code review found `isDealActive` only handled same-day windows (`nowMinutes >= start && nowMinutes < end`). Happy Hour deals spanning midnight (e.g., `22:00`–`02:00`, per ADR-007) would never be active, since `end < start` makes the comparison always false.
**Decision:** `isDealActive` now detects overnight windows (`endMinutes <= startMinutes`) and treats them as active if (today is in `daysValid` AND now ≥ startTime) OR (yesterday is in `daysValid` AND now < endTime).
**Rationale:** `daysValid` lists the day the deal *starts*; the post-midnight portion of an overnight deal belongs to the previous day's entry, not the calendar day it's currently active on.
**Consequences:** None — same-day window logic unchanged; only the `end <= start` branch is new.
**Testing:** Added 3 unit tests to `filterActiveDeals.test.ts` covering: active before midnight, active after midnight (previous day in `daysValid`), and expired the next morning. Full suite: 13/13 passing.

### ADR-021: Age Gate — Single-Button Design, Strict Boolean Check, Dialog A11y
**Status**: Accepted
**Date**: 2026-06-10
**Context**: Story 2.1 implemented the 21+ age gate (`AgeGate.tsx` wrapping App content, persisted via generic `useLocalStorage` hook under `gma_age_confirmed`). Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) found no AC violations but surfaced hardening issues and one product decision.
**Decision**: (1) Single-button gate ("I am 21 or older" only, no under-21 decline path) is the intended design — explicitly dismissed in review. (2) Gate check is strict `ageConfirmed === true`, not truthiness — `JSON.parse(item) as T` in the generic hook is an unchecked cast, so corrupted/hand-edited localStorage values (e.g. `1`, `"yes"`) must not open the gate. (3) Overlay carries `role="alertdialog"`, `aria-modal`, a labelled heading, and moves focus to the confirm button on mount; button contrast raised to `bg-green-700` for WCAG AA. (4) `setValue` wrapped in `useCallback` for stable identity.
**Rationale**: WA-compliance gate is a click-through attestation, not security; one button keeps it frictionless. The strict check costs nothing and closes the only code path where garbage storage data bypasses the gate. Dialog semantics make the takeover screen non-broken for screen-reader/keyboard users.
**Consequences**: Deferred to `_bmad-output/implementation-artifacts/deferred-work.md`: no cross-tab storage sync, no functional-update form on `setValue`, hook ignores `key` changes after mount. None affect the single-key, single-tab R&D use case. Confirmation never expires (persists in localStorage indefinitely) — required by AC3.
**Testing**: 18 client tests passing (parameterized gate-bypass cases, storage-throws branches, focus/dialog-role assertions, setValue identity). `tsc -b` and lint clean.

### ADR-022: Deal Feed — Hook-Only Data Access, Pure Sort Utility, Pinned en-US Timestamp Format
**Status**: Accepted
**Date**: 2026-06-10
**Context**: Story 2.2 added the deal feed: `useDeals` hook (sole fetch path), `sortDeals` pure utility, `formatLastUpdated`, and `DealFeed` owning loading/error/empty/populated states, mounted under the header inside `AgeGate`.
**Decision**: (1) `useDeals` fetches `/api/data` once on mount with `AbortController` cleanup; abort on unmount is swallowed (`err.name === 'AbortError'`) and never sets state — non-OK status and network failure set `error` (string), leave `data` null, no throw. (2) `sortDeals(dispensaries, now)` takes `now: Date` as a parameter (never reads the clock itself) and sorts via tiered keys: timed Happy Hours by minutes-until-end ascending — negative deltas wrap +1440 for overnight windows (e.g. 22:00–02:00, mirroring server-side ADR-020) — then null-window Happy Hours (stable input order), then Daily Deals by `discountPct` descending. (3) `formatLastUpdated` pins `toLocaleString('en-US', …)` → "Jun 10, 7:45 AM" so output doesn't drift with host locale; invalid ISO → empty string. (4) Error state shows a fixed friendly message — raw error text/status never rendered; timestamp footer renders in populated AND empty states only.
**Rationale**: Passing `now` in keeps the sort pure and unit-testable without fake timers. Pinning en-US makes tests deterministic across machines and matches the spec's example format. Hook-only data access enforces the architecture rule (zero `fetch()` in components) ahead of Stories 2.3–2.6 building on the same hook.
**Consequences**: Single fetch per mount — no polling/refresh yet (stale handling is Story 2.6). Minimal deal rows (name — description — % off) are placeholder UI replaced by `DealCard` in Story 2.3. Within-tier order of null-window Happy Hours is input order (unspecified by spec).
**Testing**: 38 client tests passing (18 pre-existing + 20 new: hook success/500/network-reject/abort-on-unmount, all I/O-matrix sort cases incl. overnight wrap, format valid/invalid, four DealFeed render states + sort order + timestamp presence, App feed-region render with stubbed fetch). `tsc -b` and lint clean.

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
- Road distances are pre-computed and hardcoded in data.json (no routing API at R&D scale)
- Deal data sourced by scraping public dispensary sites (Axios + Cheerio for plain HTML; Python Scraper microservice on port 8000 for Dutchie/iFrame sites — see ADR-017)
- Gas-cost calc: fueleconomy.gov API for vehicle precision mode; nationalMpg hardcoded at 28 for default
- Gas price: EIA public API (weekly refresh), stored in data.json meta
- All active-deal time logic uses America/Los_Angeles (Pacific Time), enforced server-side
- Browser-based only; user preferences (distance, vehicle MPG, age confirmation) persisted in localStorage
- Web app must be mobile-responsive (primary use case: checking from a phone before getting in the car)
- fueleconomy.gov API returns XML by default — must send `Accept: application/json` header
- data.json writes must be atomic (tmp file + rename) to prevent serving partial data

---

## Testing Results

- **R&D accuracy bar (6-month):** Small test group confirms displayed deals match real-world deals at stores, and gas-cost math holds up. No traffic/revenue targets at this stage.

---

## Known Issues

- Deal scraping fragility and ToS exposure: unresolved — ToS review required before expanding beyond the R&D dispensary set (PRD OQ-5)
- Discount Display (side-by-side % + gas cost) may be insufficient as a go/no-go signal — validated by SM-3 in R&D (see ADR-009)
- fueleconomy.gov API response format: must send `Accept: application/json` — default is XML
- Initial data.json requires a one-time manual setup (dispensary list + distanceMiles) before first scraper run

---

## Open Questions

- Legal/ethical position on scraping cannabis retail sites in WA state? — PRD OQ-5 (low priority at 3–5 sites; higher before public launch)
- Is Discount Display (% + gas cost side by side) sufficient for users to decide, or is a computed dollar savings figure needed? — PRD OQ-7 (validated by SM-3 during R&D)

**Resolved during architecture (2026-06-09):**
- ~~Routing API selection~~ → ADR-011: hardcoded JSON lookups, no API needed
- ~~National-average MPG source~~ → ADR-013: hardcoded 28 MPG for R&D
- ~~Gas Price source~~ → ADR-012: EIA public API (daily ≤24h)
- ~~Scraper infrastructure~~ → ADR-010: setInterval in Express process

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
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- fueleconomy.gov API: https://www.fueleconomy.gov/feg/ws/

---

## Change Log

| Date | Change |
|------|--------|
| 2026-06-08 | Initial ADR created. Product brief session complete. ADR-001 through ADR-005 recorded from brief decisions. |
| 2026-06-08 | PRD session complete. PRD finalized. ADR-006 through ADR-009 added from PRD decisions and crawl spike. Open questions updated. Status updated to PRD final. |
| 2026-06-09 | Architecture session complete. ADR-010 through ADR-016 added. ADR-002 superseded by ADR-011 (hardcoded distances). ADR-003 refined (hardcoded MPG). Four open questions resolved. Technical constraints updated. Status updated to Architecture complete. |
| 2026-06-09 | Scraper integration update. ADR-016 refined (Playwright upgrade path → Python microservice). ADR-017 added (Python Scraper service for Dutchie/iFrame sites). Technical constraints updated. Architecture.md Integration Points and Data Flow updated to reflect two-tier scraping strategy. |
| 2026-06-09 | Story 1.3 code review fixes. ADR-018 added (build-time `copyData.mjs` for `dist/server/data/`). ADR-019 added (root `package.json` start/build scripts aligned to `dist/server/` output). ADR-020 added (overnight Happy Hour deal handling in `filterActiveDeals`). |
| 2026-06-10 | Story 2.1 (Age Gate) implemented, code-reviewed, and marked done. ADR-021 added (single-button gate design, strict boolean check, dialog a11y). Overview status updated to implementation-in-progress. `deferred-work.md` created for review items deferred out of MVP scope. |
| 2026-06-10 | Story 2.2 (Deal Feed) implemented. ADR-022 added (hook-only data access via `useDeals`, pure `sortDeals` with overnight wrap, pinned en-US timestamp format, friendly-error rendering). 38 client tests passing. |
