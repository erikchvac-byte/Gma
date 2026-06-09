---
title: "PRD: Gma's Helper"
status: final
created: 2026-06-08
updated: 2026-06-08
finalized: 2026-06-08
---

# PRD: Gma's Helper

## 0. Document Purpose

This PRD is the primary input for architecture, front-end development, and story creation for Gma's Helper. It is scoped to the R&D validation phase (v1): a working product small enough for one person to build and test with a group of three. The upstream sources are the product brief (brief-Happy-2026-06-08/brief.md), its addendum, and the pre-PRD crawl spike (2026-06-08). All vocabulary in §4 Features is anchored to §3 Glossary; downstream work must use those terms exactly.

---

## 1. Vision

Gma's Helper is a single-page web app that answers one question for someone about to get in the car: *is the cannabis deal near me actually worth the drive right now?* Set a distance, and the page shows every active deal within road-driving range — each one paired with a plain-language comparison of what you'd spend in gas against what you'd save.

The product exists because the obvious version — a cannabis deals aggregator — already exists across Weedmaps, Leafly, and a dozen dispensary SMS clubs, but none of them answer the only question that matters before you leave the house. The gas-cost-vs-savings comparison is the sharpest edge: nothing in the market pairs a live discount against the real cost of getting there.

For v1, success is narrow: does the page tell the truth? A small test group uses Gma's Helper to find a deal, makes the trip, and confirms both the deal terms and the math held up. No traffic targets. No revenue targets. That validation is the gate into any growth ambitions.

---

## 2. Target Users

### 2.1 Jobs to Be Done

- Know, right now, whether any cannabis deal nearby is worth driving to — without opening four apps or checking SMS clubs.
- Understand the full cost of the trip, not just the discount percentage.
- Get the answer instantly with no setup required — then decide and go.
- Optionally dial in the gas estimate to my specific vehicle, once, and have it remembered.

### 2.2 Non-Users (v1)

- People outside the 50-road-mile zone around Marysville, WA (zip 98270) — v1 is a validation zone only.
- Anyone looking to browse menus, explore stores, or place orders.
- Dispensary operators — no self-submission or account features exist.

### 2.3 User Journeys

**UJ-1. Dave checks if tonight's run is worth it.**
Dave, a budget-conscious regular, opens Gma's Helper on his phone at home in Marysville. He sees two active happy hours in range — one ending in 40 minutes, one starting at 9pm. The nearer one saves him $12 on flower with a $1.80 round-trip gas cost. He leaves for the closer store.

**UJ-2. Linda re-orients after a long break.**
Linda hasn't bought in six months and doesn't know what's current. She opens the page on her laptop, leaves the distance at default, and sees today's active deals. There's a 35%-off day deal at a store 8 miles away — gas cost $0.90. She goes.

**UJ-3. Marco finds his first local deal.**
Marco just moved to the area. He opens the app, sees five dispensaries within 20 miles, two with active deals. Each card shows road distance, savings, gas cost. He picks the better deal without needing to know any store names in advance.

---

## 3. Glossary

- **Deal** — A time-bounded discount offered by a Dispensary, either as a Happy Hour (time-windowed) or a Daily Deal (active all day). A Deal has a discount description, an active window, and the Dispensary it belongs to.
- **Happy Hour** — A Deal with a specific start time and end time within a single day (e.g., 7–8am, 9pm–close). Distinguished from a Daily Deal by the presence of an explicit time window.
- **Daily Deal** — A Deal active for the full calendar day with no specific time window (e.g., "35% off select brands today only").
- **Active Deal** — A Deal whose active window includes the current moment (server time, Pacific timezone).
- **Dispensary** — A licensed cannabis retail location with a crawlable public website that serves Deal data as plain HTML. The source of Deals via the Scraper.
- **Scraper** — The server-side scheduled job that fetches, parses, and stores Deal data from Dispensary websites.
- **Coverage Zone** — The geographic area from which Dispensaries are drawn: within 50 road-miles of zip 98270 (Marysville, WA), excluding any destination requiring a ferry crossing.
- **Road Distance** — Driving-route distance between zip 98270 and a Dispensary, as calculated by the Routing API. Not straight-line distance.
- **Gas Cost** — Estimated fuel cost for a round trip to a Dispensary, computed from Road Distance × 2, Gas Price per gallon, and the active MPG value.
- **Discount Display** — The deal's saving potential shown to the user. Displayed as the discount percentage and Gas Cost side by side (e.g., "35% off — costs you $1.80 to get there"). [NOTE FOR PM: collapsing to a single Net Savings dollar figure requires knowing the user's intended spend, which is unknown. Side-by-side display is the honest default; see OQ-7.]
- **Net Savings** — The user's actual saving on a trip, computable only when a spend amount is known. Not computed by default in v1 — replaced by Discount Display. Reserved for a future precision mode if user-entered spend is added.
- **National Average MPG** — The current US national average vehicle fuel efficiency, refreshed server-side every 24 hours from a public source.
- **Vehicle MPG** — User-set fuel efficiency for their specific year/make/model, sourced from the fueleconomy.gov public API. Overrides National Average MPG when set.
- **Gas Price** — Current average price per gallon of gasoline, refreshed daily server-side from a public source. [ASSUMPTION: exact source TBD during architecture — EIA, AAA, or GasBuddy public data.]
- **Routing API** — The third-party service used to calculate Road Distance. Selection deferred to architecture phase.
- **Stale** — A Dispensary whose Deal data could not be successfully fetched or parsed in the most recent Scraper run.

---

## 4. Features

### 4.1 Deal Feed

**Description:** The primary surface. Displays all Active Deals from Dispensaries within the user-selected radius. Sort order: Happy Hours first (soonest-to-expire ascending), then Daily Deals (highest discount percentage first). Each Deal card shows: Dispensary name, Road Distance, Gas Cost, deal description, discount percentage, active window or "Active today," and Discount Display (discount % and Gas Cost side by side — see §3 Glossary). The feed reflects the most recent Scraper run; a manual refresh button triggers a page reload. Expired Happy Hours drop off automatically as their window closes. When no Active Deals are in range, an empty state with the last Scraper run timestamp is shown. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-1: Display Active Deals in range

The page displays all Active Deals from Dispensaries within the selected radius, sorted Happy Hours (soonest-ending first) above Daily Deals (highest Net Savings first).

**Consequences (testable):**
- A Happy Hour whose end time has passed does not appear.
- A Daily Deal appears until midnight Pacific time on the day it is valid.
- A Happy Hour scheduled for later today appears in the feed with a "Starts at HH:MM" label, below currently active Happy Hours.

#### FR-2: Deal card content

Each Deal card displays: Dispensary name, Road Distance (miles, one decimal place), Gas Cost (dollars, two decimal places), deal description, discount percentage, active window or "Active today," and Discount Display (discount % beside Gas Cost — e.g., "35% off — $1.80 to get there"). [NOTE FOR PM: see OQ-7 — collapsing to a single Net Savings dollar figure requires knowing user spend; side-by-side display is the v1 default.]

**Consequences (testable):**
- Gas Cost uses Vehicle MPG if set; falls back to National Average MPG.
- Discount Display shows the deal's discount percentage and Gas Cost as two separate values on the same card.
- Active Happy Hour cards display a countdown to end time (HH:MM remaining).

#### FR-3: Empty state

When no Active Deals exist within the selected radius, the page displays a message indicating no deals are currently active and the timestamp of the last Scraper run.

**Consequences (testable):**
- Empty state shown when Active Deal count is zero.
- Last-updated timestamp visible at all times, not only in empty state.

#### FR-4: Stale source indicator

Dispensaries marked Stale are omitted from the feed. A non-intrusive indicator shows the count of sources currently unavailable.

**Consequences (testable):**
- Stale Dispensaries do not appear in the feed.
- The unavailable-source count is visible on the page.

---

### 4.2 Distance Filter

**Description:** A control (slider or numeric input) letting the user set the maximum Road Distance for included Dispensaries. [ASSUMPTION: default 25 miles; maximum 50 miles for v1.] Applied client-side against pre-loaded data; does not trigger a new Scraper run. Selection persists across sessions.

**Functional Requirements:**

#### FR-5: User-adjustable distance radius

The user can set a maximum Road Distance in miles. The Deal Feed updates immediately to show only Deals from Dispensaries within that distance. Realizes UJ-1, UJ-2, UJ-3.

**Consequences (testable):**
- Dispensaries beyond the selected radius are excluded from the feed.
- Setting radius to maximum (50 miles) shows all Coverage Zone Dispensaries with Active Deals.
- Selected radius persists in localStorage across page reloads.

**Out of Scope:**
- Radius values above 50 miles are not settable in v1.
- The origin point is not user-adjustable. [ASSUMPTION: fixed at zip 98270 centroid for v1 — no browser GPS.]

---

### 4.3 Gas-Cost Calculator

**Description:** Computes Gas Cost for each Dispensary card using Road Distance, Gas Price, and the active MPG value. Fully functional on page load with no user input. An optional precision mode (gear icon) lets users select their vehicle (Year → Make → Model) to replace National Average MPG with Vehicle MPG. Selection stored in localStorage; panel collapses to show the resulting MPG value after selection. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-6: Default gas-cost calculation

Gas Cost appears on every Deal card on first page load, computed from National Average MPG and the current Gas Price.

**Consequences (testable):**
- Gas Cost visible on every card with no user action.
- National Average MPG is no more than 24 hours stale.

#### FR-7: Gas Price and MPG refresh

Gas Price and National Average MPG are both fetched server-side and refreshed every 24 hours.

**Consequences (testable):**
- Both values used in calculations are no more than 24 hours old.

#### FR-8: Vehicle precision mode

A gear icon opens three cascading dropdowns: Year → Make → Model, populated from the fueleconomy.gov public API. On selection, Vehicle MPG replaces National Average MPG across all Gas Cost calculations. Selection persists in localStorage.

**Consequences (testable):**
- Selecting a vehicle updates all Gas Cost values immediately.
- Gear panel closes after selection and displays the selected vehicle's MPG.
- Previously selected vehicle is restored from localStorage on return visit.
- If fueleconomy.gov API is unreachable, dropdowns show an error and Gas Cost falls back to National Average MPG silently.

---

### 4.4 Deal Sourcing (Scraper)

**Description:** Server-side scheduled job that fetches and parses Deal data from each configured Dispensary's public website on a 60-minute interval. [ASSUMPTION: 60-minute refresh is appropriate given Happy Hours are hours-long windows.] Own-site crawling only — no Weedmaps, Leafly, or third-party aggregator scraping in v1. Dispensaries whose deal data lives exclusively on third-party platforms are excluded from the Coverage Zone. Each Dispensary requires a manually written parser; no auto-discovery. Broken sources are marked Stale and logged for operator review.

**Functional Requirements:**

#### FR-9: Scheduled scraping

The Scraper runs every 60 minutes and attempts to fetch and parse Deal data from every configured Dispensary URL.

**Consequences (testable):**
- Deal data shown to users is no more than 60 minutes stale under normal operation.
- A failed fetch (network error, HTTP non-2xx) marks the Dispensary as Stale and does not overwrite the last valid data.
- A parse failure (site structure changed) also marks the Dispensary as Stale.

#### FR-10: Deal classification and storage

The Scraper extracts per Deal: discount description, discount amount (if parseable as a number), active window (start/end time or "all day"), and day(s) of validity. Deals are classified as Happy Hour or Daily Deal based on presence of a time window.

**Consequences (testable):**
- A Deal with an explicit start and end time is stored as type Happy Hour.
- A Deal with no time window is stored as type Daily Deal.
- Parsed data is stored server-side and served to the front-end on request.

#### FR-11: Ferry exclusion

No Dispensary requiring a ferry crossing to reach from zip 98270 is included in the Coverage Zone, regardless of Road Distance.

**Consequences (testable):**
- Dispensaries on Whidbey Island, the Olympic Peninsula, and other ferry-dependent destinations are not present in the Dispensary configuration.

#### FR-12: Scraper monitoring

Each Scraper run result (success/fail per source, timestamp) is logged and accessible via a simple operator view or log file. Enables Erik to identify and fix broken parsers.

**Consequences (testable):**
- After each run, a record exists with per-source success/failure status and run timestamp.
- Operator can view the log without accessing a database directly.

**Notes:**
- [NOTE FOR PM] Scraping carries ToS and legal exposure. Before adding Dispensaries beyond the initial R&D set, review each target site's ToS and establish a legal position on scraping cannabis retail sites.
- Each new Dispensary requires a developer to manually write a parser targeting that site's HTML structure. This is intentional for v1 — no auto-discovery.

---

### 4.5 Age Gate

**Description:** Full-page overlay on first visit requiring the user to confirm they are 21 or older before any Deal content is visible. [ASSUMPTION: button-click confirmation with no identity verification is appropriate for an informational site at R&D scale.] Confirmation stored in localStorage; overlay does not reappear on subsequent visits from the same browser.

**Functional Requirements:**

#### FR-13: Age verification overlay

On first page load (no prior localStorage confirmation), a full-page age gate with a "I am 21 or older" button obscures all content. Deal feed is not rendered until the user confirms.

**Consequences (testable):**
- Deal feed content is not visible before confirmation.
- After confirmation, localStorage is set and the overlay does not reappear on reload or return visits from the same browser.
- Clearing localStorage resets the age gate.

---

## 5. Non-Goals (Explicit)

- No store browsing, menu exploration, or product discovery beyond active deals.
- No user accounts, profiles, saved favorites, or history.
- No ordering, reservations, or transactional features of any kind.
- No native mobile apps or app-store presence — web app only.
- No coverage outside the 50-mile validation zone around zip 98270 in v1.
- No coverage outside the US.
- No manual deal curation or dispensary self-submission pipeline.
- Not a cannabis culture brand — visual design targets budget-aware adults, not the cannabis aesthetic.
- No pop-up or interstitial advertising.
- No Weedmaps/Leafly scraping in v1 — aggregator data deferred to Phase 2.
- No user geolocation — origin point is fixed at zip 98270.

---

## 6. MVP Scope

### 6.1 In Scope

- Single-page web app, mobile-and-desktop responsive (no native app).
- Deal Feed with Active Deals from the Coverage Zone, sorted by deal type and value.
- Distance filter (1–50 road-miles from zip 98270 centroid).
- Gas-cost-vs-savings calculation per Deal card, defaulting to National Average MPG and daily Gas Price.
- Vehicle precision mode via fueleconomy.gov API (opt-in, localStorage-persisted).
- Scheduled scraper for own-site Dispensary deal data (60-minute interval).
- Stale source count indicator.
- Age gate (21+ button-click confirmation, localStorage).
- Operator scraper monitoring log.

### 6.2 Out of Scope for MVP

- Banner/sidebar advertising slots — deferred to Phase 2. Not required to validate the core "is this deal worth the drive?" R&D hypothesis.
- Weedmaps/Leafly aggregator integration — deferred to Phase 2 (requires JS rendering or private API access).
- Dispensaries whose deal data lives on third-party platforms — excluded from v1 Coverage Zone.
- User GPS/geolocation — origin fixed at 98270 centroid. [NOTE FOR PM: geolocation would meaningfully improve accuracy for users elsewhere in the zone; revisit if R&D validates the concept.]
- Push/SMS deal alerts.
- Multi-origin points (e.g., "near work" vs. "near home").
- Coverage expansion beyond the 50-mile zone.
- User accounts or any server-side user data storage.

---

## 7. Success Metrics

**Primary**

- **SM-1: Deal accuracy** — Test group (Erik, wife, optionally one friend) finds a Deal in the feed, makes the trip, and confirms deal terms (discount, timing) match what the store offered. Target: 100% match on all sampled trips during R&D phase. Validates FR-1, FR-9, FR-10.

- **SM-2: Gas math accuracy** — Gas Cost shown for a sampled trip is within 15% of the actual fuel cost of the round trip. Validates FR-6, FR-7.

- **SM-3: Discount Display usefulness** — Test group confirms the side-by-side "X% off — $Y to get there" display was enough to make a go/no-go decision without needing a computed savings dollar figure. Validates FR-2, OQ-7.

**Counter-metrics (do not optimize)**

- **SM-C1: Feed breadth** — Do not inflate Deal count by loosening Active status logic or marking Stale sources as healthy. A smaller accurate feed is better than a larger inaccurate one. Counterbalances SM-1.

---

## 8. Constraints and Guardrails

### Legal / Compliance

- Age gate required before any Deal content is visible (FR-13). Button-click only at R&D scale; no identity verification.
- Advertising tone must not target youth — all creative appropriate for adults 21+.
- Scraping limited to publicly available own-site data. No aggregator ToS in scope for v1. [NOTE FOR PM: ToS review required before expanding the Dispensary list beyond the initial R&D set.]

### Platform

- Web app only. No app-store presence. Deliberate choice: avoids Google Play cannabis ban and Apple/Texas age-verification requirements.
- Mobile-responsive required. Primary use case (checking before getting in the car) is mobile.

### Monetization

- Advertising deferred to Phase 2 — not in v1 scope.
- When introduced: banner and sidebar slots only. No pop-ups, interstitials, or sponsored placement. Ad creative appropriate for adults 21+, not cannabis-culture branded.

### Aesthetic and Tone

- Clear, direct, low-friction. Not "simplified for seniors." Not cannabis-branded.
- Voice: honest math. No green-leaf imagery, stoner humor, or youth-coded visual language.

---

## 9. Open Questions

1. **Gas Price source** — Which public source (EIA, AAA, GasBuddy) provides the most reliable daily US average gas price? Architecture decision.
2. **Routing API** — Which API best handles ferry-exclusion at acceptable cost for R&D scale? (Google Maps Distance Matrix, OpenRouteService, Mapbox Directions?) Architecture decision.
3. **National Average MPG source** — Most reliable public source for a single daily "average US vehicle MPG" figure?
4. **Scraper infrastructure** — Scheduled job co-located with the web server vs. separate cron + serverless function? Architecture decision.
5. **Legal position on scraping** — Brief ToS review per target site before expanding beyond the R&D Dispensary set. Low priority at 3–5 sites; higher priority before any public launch.
6. **Precision mode error UX** — If fueleconomy.gov is unreachable, does the gear icon show an explicit error or silently fall back? (FR-8 specifies the fallback behavior; UX detail to confirm at design time.)
7. **Discount Display vs. computed Net Savings** — v1 shows "X% off — $Y gas" side by side (Discount Display). Is this sufficient for users to make a go/no-go call, or does the page need a computed dollar savings figure? If computed savings is required, we need either a fixed assumed basket size or a user-input spend field. SM-3 validates this during R&D.

---

## 10. Assumptions Index

- **§4.1** — Sort order: Happy Hours by time-remaining (soonest first), then Daily Deals by Net Savings (highest first).
- **§4.2** — Default radius: 25 miles. Maximum radius: 50 miles.
- **§4.2** — Origin fixed at zip 98270 centroid for v1. No browser GPS.
- **§3 Glossary** — Gas Price source TBD; confirmed to be a daily-refreshed public US average.
- **§3 Glossary** — Active Deal evaluation uses Pacific Time (America/Los_Angeles).
- **§4.4** — Scraper interval: 60 minutes.
- **§4.5** — Age gate: button-click confirmation only; no identity verification. Appropriate for an informational site at R&D scale.
