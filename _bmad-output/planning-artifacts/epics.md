---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-06-08/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# Happy (Gma's Helper) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Gma's Helper, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: The page displays all Active Deals from Dispensaries within the selected radius, sorted Happy Hours (soonest-ending first) above Daily Deals (highest discount % first). A Happy Hour whose end time has passed does not appear. A Daily Deal appears until midnight Pacific time on the day it is valid. A future Happy Hour (starting later today) appears below currently active ones with a "Starts at HH:MM" label.

FR-2: Each Deal card displays: Dispensary name, Road Distance (miles, 1 decimal), Gas Cost (dollars, 2 decimals), deal description, discount percentage, active window or "Active today," and Discount Display (discount % beside Gas Cost). Active Happy Hour cards display a countdown to end time (HH:MM remaining). Gas Cost uses Vehicle MPG if set; falls back to National Average MPG.

FR-3: When no Active Deals exist within the selected radius, the page displays a no-deals message and the timestamp of the last Scraper run. Last-updated timestamp is visible at all times (not only in empty state).

FR-4: Dispensaries marked Stale are omitted from the feed. A non-intrusive indicator shows the count of sources currently unavailable.

FR-5: The user can set a maximum Road Distance in miles (1–50). The Deal Feed updates immediately to show only Deals from Dispensaries within that distance. Selected radius persists in localStorage (key: gma_distance_miles, default: 25). Radius values above 50 miles are not settable in v1.

FR-6: Gas Cost appears on every Deal card on first page load, computed from National Average MPG (hardcoded 28 MPG) and the current Gas Price. No user action required.

FR-7: Gas Price (EIA API) is fetched server-side and refreshed on a schedule. Both Gas Price and National Average MPG values used in calculations are no more than 24 hours old.

FR-8: A gear icon opens three cascading dropdowns (Year → Make → Model) populated from the fueleconomy.gov public API (must send Accept: application/json). On selection, Vehicle MPG replaces National Average MPG across all Gas Cost calculations. Selection persists in localStorage (gma_vehicle_mpg + gma_vehicle_label). Gear panel closes after selection and shows selected vehicle MPG. Previously selected vehicle is restored on return visit. If fueleconomy.gov is unreachable, dropdowns show an error and Gas Cost falls back to National Average MPG silently.

FR-9: The Scraper runs every 60 minutes and attempts to fetch and parse Deal data from every configured Dispensary URL. A failed fetch marks the Dispensary Stale and does not overwrite the last valid data. A parse failure also marks the Dispensary Stale.

FR-10: The Scraper extracts per Deal: discount description, discount amount (if parseable), active window (start/end time or "all day"), and day(s) of validity. Deals are classified as type "happy_hour" (explicit time window) or "daily" (no time window). Parsed data is stored in data.json server-side.

FR-11: No Dispensary requiring a ferry crossing to reach from zip 98270 is included in the Coverage Zone. This is enforced statically — excluded dispensaries are never added to data.json.

FR-12: Each Scraper run result (success/fail per source + timestamp) is written to logs.json. Operator can view the log without accessing a database directly. Satisfies operator monitoring requirement.

FR-13: On first page load (no gma_age_confirmed in localStorage), a full-page age gate with an "I am 21 or older" button obscures all content. Deal feed is not rendered until the user confirms. After confirmation, localStorage is set and the overlay does not reappear on reload or return visits. Clearing localStorage resets the age gate.

### NonFunctional Requirements

NFR-1: Deal data shown to users is no more than 60 minutes stale under normal operation (FR-9 schedule enforces this).

NFR-2: Gas Price and National Average MPG values are no more than 24 hours stale (server-side refresh).

NFR-3: Scraper failures mark the source Stale and do not overwrite the last valid deal data (error isolation, atomic writes).

NFR-4: All deal active-window evaluation uses America/Los_Angeles (Pacific Time). process.env.TZ = 'America/Los_Angeles' MUST be the first executable line in server/index.ts.

NFR-5: The app must be mobile-first and responsive across mobile and desktop. Primary use case is checking deals before getting in the car (mobile).

NFR-6: No server-side user data. All user preferences (age gate, distance radius, vehicle MPG) stored in localStorage only.

NFR-7: Age gate is legally required before any Deal content is visible. Scraping limited to publicly available own-site data only. Ad creative appropriate for adults 21+.

NFR-8: Web app only — no native app. Deliberate: avoids Google Play cannabis ban and Apple/Texas age-verification requirements.

NFR-9: TypeScript strict mode enforced on both client and server.

NFR-10: Testing via Vitest. Test files co-located with source files (*.test.ts / *.test.tsx suffix).

### Additional Requirements

- AR-1 [STARTER TEMPLATE — Epic 1, Story 1]: Project scaffold: `npm create vite@latest client -- --template react-ts` for frontend; manual `mkdir server && npm init -y` with Express v5 + tsx for backend. Root `package.json` uses `concurrently` to run both.
- AR-2: Flat-file storage: `server/data/data.json` (dispensaries + cached deals + meta); `server/data/logs.json` (operator scraper log, never served to frontend).
- AR-3: Tailwind CSS v4.3.x via `@tailwindcss/vite` plugin. No tailwind.config.js. No PostCSS. No Autoprefixer. `@import "tailwindcss"` in index.css.
- AR-4: Python Scraper microservice (port 8000) handles Dutchie/iFrame dispensaries. `server/utils/scraperClient.ts` wraps POST /scrape calls. Returns `[]` on failure; runScrapers.ts marks source Stale.
- AR-5: fueleconomy.gov API returns XML by default. `useFuelEconomy.ts` MUST send `Accept: application/json` header.
- AR-6 [PRE-CODE MANUAL STEP]: Before first scraper run, hand-populate `server/data/data.json` dispensaries array with store names, URLs, slugs, and distanceMiles values (one-time Google Maps lookup). This is Story 0 / pre-implementation setup.
- AR-7: Atomic writes for data.json — write to `data.tmp.json`, then `fs.renameSync` to `data.json`. Never write directly mid-scrape loop.
- AR-8: `process.env.TZ = 'America/Los_Angeles'` MUST be the first executable line in `server/index.ts`. Required for correct Pacific Time deal evaluation.
- AR-9: All localStorage keys use `gma_` prefix + snake_case: `gma_age_confirmed`, `gma_distance_miles`, `gma_vehicle_mpg`, `gma_vehicle_label`.
- AR-10: Required packages not auto-installed: root devDependencies: `concurrently`; server dependencies: `cors`, `dotenv`; server devDependencies: `@types/cors`.
- AR-11: Dev workflow: `concurrently` runs Vite dev server (localhost:5173) + `tsx watch server/index.ts` (localhost:3001). Vite proxies `/api/*` to localhost:3001 (configured in vite.config.ts).
- AR-12: Production: single VPS, Express serves built Vite SPA from `client/dist` via `express.static`. pm2 keeps process alive. Scraper runs via `setInterval` at server startup.
- AR-13: EIA_API_KEY stored in `.env` (never committed). `.env.example` committed as template. `.env` in .gitignore.
- AR-14: Single `GET /api/data` endpoint returns `{ meta, dispensaries[] }` (active deals only, pre-filtered server-side). Frontend applies only client-side distance filter on received data.
- AR-15: camelCase for all JSON field names in data.json and API responses. Never snake_case (e.g., `discountPct` not `discount_pct`).
- AR-16: Distance filter control is a **slider** (`<input type="range">`). Not a numeric text input. Decision recorded 2026-06-09.

### UX Design Requirements

N/A — No UX Design document was found for this project. UI implementation follows PRD functional requirements and architecture component specifications directly.

### FR Coverage Map

FR-1: Epic 2 — Active deal feed, sort order (Happy Hours soonest-ending → Daily Deals by discount %)
FR-2: Epic 2 — Deal card fields: name, distance, gas cost, discount, time window, countdown
FR-3: Epic 2 — Empty state message + last-run timestamp (always visible)
FR-4: Epic 2 — Stale source indicator (omit stale dispensaries, show unavailable count)
FR-5: Epic 2 — Distance radius filter (client-side, localStorage-persisted, default 25 mi)
FR-6: Epic 2 — Default gas cost using seed gas price + hardcoded 28 MPG (no user action)
FR-7: Epic 3 — EIA gas price server-side refresh (≤24h stale)
FR-8: Epic 3 — Vehicle precision mode (fueleconomy.gov cascading dropdowns, localStorage)
FR-9: Epic 4 — 60-minute scraper schedule; source marked Stale on failure, no data overwrite
FR-10: Epic 4 — Deal classification: happy_hour vs daily; storage to data.json
FR-11: Epic 1 — Ferry exclusion — static, enforced at seed time (no code needed)
FR-12: Epic 4 — Operator monitoring log (logs.json, per-run per-source success/fail + timestamp)
FR-13: Epic 2 — Age gate (21+ button, localStorage, blocks feed until confirmed)

## Epic List

### Epic 1: Project Foundation & Data Layer
The dev environment runs, the data schema is established, and the single API endpoint serves structured deal data from seed dispensaries. Running `npm run dev` shows data flowing from data.json → GET /api/data → browser. Every subsequent story builds on this.
**FRs covered:** FR-11 (ferry exclusion — enforced statically when seeding dispensary data)

### Epic 2: Core Deal Experience
A user opens the app, confirms they are 21+, and immediately sees active cannabis deals near them — each card showing dispensary name, distance, discount, time window, and gas cost. They can filter by distance and see when data was last updated.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-13

### Epic 3: Gas Cost Accuracy & Personalization
The gas price is sourced from the EIA API (refreshed on schedule) instead of the seed value, and users can optionally select their vehicle year/make/model for personalized MPG. The gas math is now trustworthy and personalizable.
**FRs covered:** FR-7, FR-8

### Epic 4: Live Deal Data via Scraper
Deals come from real dispensary websites, scraped on a 60-minute schedule. Failures are isolated (source marked Stale, last valid data preserved). Erik can monitor scraper health via the operator log. The app is ready for R&D validation.
**FRs covered:** FR-9, FR-10, FR-12

---

## Epic 1: Project Foundation & Data Layer

The dev environment runs, the data schema is established, and the single API endpoint serves structured deal data from seed dispensaries. Running `npm run dev` shows data flowing from `data.json` → `GET /api/data` → browser. Every subsequent story builds on this.

### Story 1.1: Project Scaffold

As a **developer**,
I want the project scaffold (Vite + React + TS client, Express + TS server) running concurrently from the repo root,
So that I have a verified, correctly structured foundation every subsequent story builds on.

**Acceptance Criteria:**

**Given** I run `npm install` at the project root and then `npm run dev`,
**When** both processes start,
**Then** the Vite dev server is available at `localhost:5173` AND Express is available at `localhost:3001`.

**Given** Vite's `/api` proxy is configured,
**When** the client calls `localhost:5173/api/data`,
**Then** the request is forwarded to `localhost:3001/api/data`.

**Given** TypeScript strict mode is configured on both client and server,
**When** the TypeScript compiler runs,
**Then** zero type errors are present.

**Given** the project root,
**When** I inspect `.gitignore`,
**Then** `node_modules/`, `.env`, and `client/dist/` are excluded, and `.env.example` is committed with `EIA_API_KEY`, `NODE_ENV`, `PORT` keys.

**Given** `server/index.ts` exists,
**When** I read the first executable line,
**Then** it is `process.env.TZ = 'America/Los_Angeles'` — before any imports or other statements.

**Given** the server package,
**When** I check `package.json` dependencies,
**Then** `cors` and `dotenv` are present as dependencies, `@types/cors` is a devDependency, and the root has `concurrently` as a devDependency.

**Given** Tailwind CSS v4,
**When** I inspect `client/vite.config.ts`,
**Then** it uses `@tailwindcss/vite` plugin (no `tailwind.config.js`, no PostCSS), and `client/src/index.css` contains `@import "tailwindcss"`.

---

### Story 1.2: Seed Dispensary Data

As a **developer**,
I want `server/data/data.json` initialized with the defined schema and seeded with real dispensaries (ferry exclusion applied), and `server/data/logs.json` initialized empty,
So that the API can serve structured deal data from day one and the scraper has a valid schema to write to.

**Acceptance Criteria:**

**Given** `server/data/data.json` exists,
**When** I validate its structure,
**Then** it conforms exactly to: `{ meta: { lastScraperRun, gasPrice, nationalMpg, gasPriceUpdatedAt }, dispensaries: [...] }`.

**Given** the `dispensaries` array,
**When** I inspect each entry,
**Then** every entry contains: `id` (store slug, kebab-case), `name`, `url`, `distanceMiles` (road miles from zip 98270 per Google Maps driving directions), `stale: false`, `lastFetchedAt`, and `deals: []`.

**Given** the Coverage Zone rules (FR-11),
**When** I review all dispensaries in the array,
**Then** none require a ferry crossing from zip 98270 (Whidbey Island, Olympic Peninsula destinations are absent).

**Given** the dispensaries array,
**When** I count entries,
**Then** at least 2 real dispensaries within 50 road-miles of zip 98270 are present.

**Given** `meta.nationalMpg`,
**When** I read its value,
**Then** it is `28`.

**Given** `meta.gasPrice`,
**When** I read its value,
**Then** it contains a valid seed dollar value (e.g., `3.45`) to be replaced by EIA data in Epic 3.

**Given** `server/data/logs.json` exists,
**When** I read it,
**Then** it contains `{ "runs": [] }`.

---

### Story 1.3: GET /api/data Endpoint with Active Deal Filtering

As a **developer**,
I want `GET /api/data` implemented — reading `data.json`, filtering active deals against Pacific Time, and returning the structured response,
So that the frontend has a single, correct data source to build the deal feed on.

**Acceptance Criteria:**

**Given** the server is running,
**When** I `GET /api/data`,
**Then** it returns HTTP 200 with `{ meta: { lastScraperRun, gasPrice, nationalMpg, gasPriceUpdatedAt }, dispensaries: [...] }`.

**Given** a dispensary has a `happy_hour` deal whose `endTime` has already passed in Pacific Time,
**When** I `GET /api/data`,
**Then** that deal does NOT appear in the response.

**Given** a dispensary has a `happy_hour` deal currently active in Pacific Time,
**When** I `GET /api/data`,
**Then** that deal appears in the response.

**Given** a dispensary has a `daily` deal valid today in Pacific Time,
**When** I `GET /api/data`,
**Then** that deal appears in the response.

**Given** active deal filtering logic,
**When** I inspect the codebase,
**Then** it lives exclusively in `server/utils/filterActiveDeals.ts` — never inlined in the route handler.

**Given** an unexpected error in the route,
**When** GET /api/data fails,
**Then** the response is HTTP 500 with `{ error: "Internal server error", code: "SERVER_ERROR" }`.

**Given** shared TypeScript types,
**When** I inspect the codebase,
**Then** `Deal`, `Dispensary`, `Meta`, and `ApiDataResponse` are defined in `client/src/types/index.ts`; server-only types (`ScraperResult`, `LogEntry`, `LogRun`) are in `server/types/index.ts`.

---

## Epic 2: Core Deal Experience

A user opens the app, confirms they are 21+, and immediately sees active cannabis deals near them — each card showing dispensary name, distance, discount, time window, and gas cost. They can filter by distance and see when data was last updated.

### Story 2.1: Age Gate

As a **first-time visitor**,
I want a full-page overlay requiring me to confirm I am 21 or older before seeing any content,
So that deal content is only accessible to adults and the site is legally compliant.

**Acceptance Criteria:**

**Given** I visit the app for the first time (no `gma_age_confirmed` in localStorage),
**When** the page loads,
**Then** a full-page overlay obscures ALL content — the deal feed is not rendered.

**Given** the age gate is visible,
**When** I click "I am 21 or older",
**Then** the overlay disappears, `gma_age_confirmed` is set to `"true"` in localStorage, and the deal feed becomes visible.

**Given** `gma_age_confirmed = "true"` is in localStorage,
**When** I reload the page or return to the site,
**Then** the age gate does NOT appear.

**Given** `gma_age_confirmed` exists,
**When** I clear localStorage and reload,
**Then** the age gate reappears.

**Given** the component tree,
**When** I inspect it,
**Then** `AgeGate.tsx` wraps `App` — no deal content is rendered until confirmed.

---

### Story 2.2: Deal Feed with Active Deals & Empty State

As a **cannabis deal seeker**,
I want to see a sorted list of active deals from dispensaries near me,
So that I can quickly scan what's available right now.

**Acceptance Criteria:**

**Given** the API returns active deals,
**When** the page loads (after age confirmation),
**Then** the deal feed displays all dispensaries with active deals.

**Given** the deal feed is populated,
**When** I scan the sort order,
**Then** active Happy Hours appear first (soonest-ending first), followed by Daily Deals (highest discount percentage first).

**Given** a Happy Hour scheduled for later today,
**When** it appears in the feed,
**Then** it shows below currently active Happy Hours with a "Starts at HH:MM" label.

**Given** the API returns no active deals,
**When** the feed renders,
**Then** an empty state message is shown AND the last Scraper run timestamp is visible.

**Given** the last Scraper run timestamp,
**When** deals ARE present in the feed,
**Then** the timestamp is still visible (always shown, not only in empty state).

**Given** data is loading,
**When** the fetch is in flight,
**Then** a loading skeleton or indicator is shown.

**Given** the API returns an error,
**When** the fetch fails,
**Then** a user-friendly error message is displayed (no raw error details exposed).

**Given** all data fetching,
**When** I inspect the component,
**Then** it routes through `useDeals.ts` — no direct `fetch()` call inside `DealFeed.tsx`.

---

### Story 2.3: Deal Cards

As a **cannabis deal seeker**,
I want each deal card to show the dispensary name, distance, deal description, discount percentage, and time window,
So that I have enough information to evaluate each deal at a glance.

**Acceptance Criteria:**

**Given** a Happy Hour deal card,
**When** I view it,
**Then** it shows: dispensary name, road distance (X.X miles), deal description, discount percentage, and active time window (e.g., "9:00 PM – close").

**Given** a Daily Deal card,
**When** I view it,
**Then** it shows: dispensary name, road distance, deal description, discount percentage, and "Active today".

**Given** an active Happy Hour card,
**When** I view the countdown,
**Then** it displays time remaining to end (HH:MM format) and updates every 60 seconds without a page reload.

**Given** a Happy Hour whose end time passes,
**When** the countdown reaches zero,
**Then** the card automatically disappears from the feed without a page refresh.

**Given** road distance display,
**When** I read the value,
**Then** it is formatted to one decimal place (e.g., "12.4 miles").

**Given** `DealCard.tsx`,
**When** I inspect it,
**Then** it is purely presentational — it receives `Dispensary` data and computed values as props and does not fetch any data.

---

### Story 2.4: Gas Cost Calculation

As a **cannabis deal seeker**,
I want every deal card to show the estimated round-trip gas cost,
So that I can immediately see what the drive will actually cost me before deciding to go.

**Acceptance Criteria:**

**Given** a deal card,
**When** the page loads,
**Then** Gas Cost is visible on every card with no user action required.

**Given** Gas Cost calculation,
**When** computed,
**Then** it uses the formula: `(distanceMiles × 2) × (gasPrice / mpg)`.

**Given** Gas Cost display,
**When** I read the value,
**Then** it is formatted to two decimal places (e.g., `$1.80`).

**Given** the Discount Display,
**When** I view a card,
**Then** discount percentage and Gas Cost appear side by side (e.g., "35% off — $1.80 to get there").

**Given** no vehicle MPG is set in localStorage,
**When** Gas Cost is calculated,
**Then** it uses `meta.nationalMpg` (28) from the API response.

**Given** `gasCost.ts`,
**When** I inspect the codebase,
**Then** gas cost calculation is a pure function in `client/src/utils/gasCost.ts` — not inlined in `DealCard.tsx`.

---

### Story 2.5: Distance Filter

As a **cannabis deal seeker**,
I want to set a maximum drive distance and have the deal feed update instantly,
So that I only see deals worth the drive from my location.

**Acceptance Criteria:**

**Given** the distance filter on page load,
**When** I check its default value,
**Then** it is 25 miles.

**Given** I drag the distance slider to 10 miles,
**When** I release the slider,
**Then** the deal feed immediately shows only dispensaries ≤10 road miles away — no page reload.

**Given** I drag the slider to maximum (50 miles),
**When** the feed updates,
**Then** all Coverage Zone dispensaries with active deals appear.

**Given** the distance slider (`<input type="range" min="1" max="50">`),
**When** I attempt to set it above 50,
**Then** the slider does not allow values above 50.

**Given** I set the distance to 30 miles and reload,
**When** the page loads,
**Then** the filter reads 30 miles (persisted as `gma_distance_miles` in localStorage).

**Given** distance filtering logic,
**When** it runs,
**Then** it is applied client-side against the full dispensary array — no new API call is triggered on radius change.

---

### Story 2.6: Stale Source Indicator

As a **cannabis deal seeker**,
I want to see how many deal sources are currently unavailable,
So that I understand the feed may be incomplete and can trust the data I do see.

**Acceptance Criteria:**

**Given** all dispensaries have `stale: false`,
**When** I view the page,
**Then** no stale indicator is shown (or it shows 0 unavailable).

**Given** one or more dispensaries have `stale: true`,
**When** I view the page,
**Then** a non-intrusive indicator shows the count of unavailable sources (e.g., "1 source unavailable").

**Given** stale dispensaries,
**When** I view the deal feed,
**Then** those dispensaries do NOT appear in the feed.

**Given** the `StaleIndicator` component,
**When** I inspect its design,
**Then** it is non-intrusive and does not disrupt the deal feed layout or require user action.

**Given** the stale count,
**When** it renders,
**Then** it is derived from the count of `dispensaries[]` entries where `stale: true` in the API response.

---

## Epic 3: Gas Cost Accuracy & Personalization

The gas price is sourced from the EIA API (refreshed on schedule) instead of the seed value, and users can optionally select their vehicle year/make/model for personalized MPG. The gas math is now trustworthy and personalizable.

### Story 3.1: EIA Gas Price Refresh

As a **cannabis deal seeker**,
I want the gas price used in calculations to come from a live, regularly refreshed source,
So that the gas cost shown on each deal card reflects real current fuel prices rather than a static seed value.

**Acceptance Criteria:**

**Given** the server starts,
**When** it initializes,
**Then** `refreshGasPrice.ts` is called immediately and the EIA API is fetched.

**Given** a successful EIA API call,
**When** the response is received,
**Then** `meta.gasPrice` in `data.json` is updated and `meta.gasPriceUpdatedAt` is set to the current ISO timestamp.

**Given** the refresh schedule,
**When** `meta.gasPriceUpdatedAt` is checked under normal operation,
**Then** it is no more than 24 hours old.

**Given** the EIA API is unreachable,
**When** the fetch fails,
**Then** the last known `meta.gasPrice` value is kept unchanged and an error is logged — the server does not crash.

**Given** gas price refresh logic,
**When** I inspect the codebase,
**Then** it lives in `server/utils/refreshGasPrice.ts` and all writes to `data.json` use `atomicWrite.ts` (write to `data.tmp.json`, then `fs.renameSync`).

**Given** the `EIA_API_KEY` environment variable,
**When** I inspect the source code,
**Then** it is read from `process.env.EIA_API_KEY` and never hardcoded.

**Given** the updated `meta.gasPrice`,
**When** the frontend next calls `GET /api/data`,
**Then** the new gas price is reflected in the response and all deal card gas cost calculations update accordingly.

---

### Story 3.2: Vehicle Precision Mode

As a **cannabis deal seeker**,
I want to optionally select my vehicle's year, make, and model to get personalized gas cost estimates,
So that the gas math on each card reflects my actual car's fuel efficiency, not the national average.

**Acceptance Criteria:**

**Given** no vehicle is set in localStorage,
**When** I view the page,
**Then** a gear icon is visible and all gas costs use `meta.nationalMpg` (28 MPG).

**Given** I click the gear icon,
**When** the panel opens,
**Then** a Year dropdown is populated from the fueleconomy.gov API.

**Given** I select a year,
**When** the selection is made,
**Then** a Make dropdown is populated from fueleconomy.gov for that year.

**Given** I select a make,
**When** the selection is made,
**Then** a Model dropdown is populated from fueleconomy.gov for that year/make.

**Given** I complete a model selection,
**When** confirmed,
**Then** (a) the gear panel closes, (b) the panel shows the selected vehicle's MPG, (c) all deal card gas costs update immediately to use Vehicle MPG, (d) `gma_vehicle_mpg` and `gma_vehicle_label` are saved to localStorage.

**Given** `gma_vehicle_mpg` is set in localStorage,
**When** gas cost is calculated in `gasCost.ts`,
**Then** it uses the Vehicle MPG override instead of `nationalMpg`.

**Given** I return to the page with a previously selected vehicle in localStorage,
**When** the page loads,
**Then** the gear panel shows the saved vehicle label and all gas costs use the saved Vehicle MPG.

**Given** fueleconomy.gov is unreachable,
**When** I open the gear panel,
**Then** the dropdowns show an error message and gas costs continue using `nationalMpg` silently — no unhandled error.

**Given** all fueleconomy.gov API calls in `useFuelEconomy.ts`,
**When** I inspect the request headers,
**Then** every call includes `Accept: application/json` (fueleconomy.gov returns XML by default without this header).

**Given** the `VehicleSelector` component,
**When** a vehicle is selected,
**Then** it notifies the parent via `onMpgChange(mpg, label)` callback — it does not directly write to global state.

---

## Epic 4: Live Deal Data via Scraper

Deals come from real dispensary websites, scraped on a 60-minute schedule. Failures are isolated (source marked Stale, last valid data preserved). Erik can monitor scraper health via the operator log. The app is ready for R&D validation.

### Story 4.1: Scraper Engine & Orchestrator

As an **operator**,
I want a scheduled scraper engine that runs every 60 minutes, orchestrates all dispensary scrapers, and logs results to a file,
So that deal data stays fresh and I can identify and fix broken parsers.

**Acceptance Criteria:**

**Given** the server starts,
**When** it initializes,
**Then** `runScrapers.ts` is called once immediately and then on a 60-minute `setInterval`.

**Given** a scraper returns `Deal[]` (success),
**When** `runScrapers.ts` processes the result,
**Then** the dispensary's `stale` flag is set to `false` and its `deals` array is updated in `data.json`.

**Given** a scraper returns `[]` (failure path),
**When** `runScrapers.ts` processes the result,
**Then** the dispensary's `stale` flag is set to `true` and its last valid `deals` data is preserved — not overwritten with an empty array.

**Given** each completed scraper run,
**When** `runScrapers.ts` finishes all scrapers,
**Then** a log entry is appended to `logs.json`: `{ runAt: ISO timestamp, results: { "store-slug": "ok | error: ..." } }`.

**Given** `logs.json` on the VPS,
**When** I read it directly,
**Then** I can see per-source success/failure status and timestamp for every run without accessing a database.

**Given** all `data.json` writes in the scraper engine,
**When** I inspect the codebase,
**Then** every write uses `atomicWrite.ts` (write to `data.tmp.json`, then `fs.renameSync` to `data.json`) — no direct `fs.writeFileSync` to `data.json` anywhere in the scraper path.

**Given** the scraper file contract,
**When** I inspect any file in `server/scrapers/`,
**Then** it exports `export default async function scrape(): Promise<Deal[]>` and never throws — it returns `[]` on any error.

**Given** `server/scrapers/_template.ts`,
**When** reviewed,
**Then** it provides the correct starting structure for future dispensary parser files.

---

### Story 4.2: First Dispensary HTML Parsers

As a **cannabis deal seeker**,
I want deal data to come from real dispensary websites (plain HTML sources),
So that the deals shown in the feed are live and verified against the actual source.

**Acceptance Criteria:**

**Given** the initial R&D dispensary set (seeded in Story 1.2),
**When** `runScrapers.ts` executes,
**Then** at least four plain HTML scrapers successfully fetch and parse real deals from live dispensary websites.

**Given** a parsed deal with an explicit time window,
**When** stored in `data.json`,
**Then** its `type` is `"happy_hour"`, and `startTime` / `endTime` are in 24-hour format (e.g., `"09:00"`, `"22:00"`) — never 12-hour format (e.g., `"9am"`).

**Given** a parsed deal with no time window,
**When** stored in `data.json`,
**Then** its `type` is `"daily"`, and `startTime` / `endTime` are `null`.

**Given** a parsed deal,
**When** stored,
**Then** `discountPct` is a number if parseable from the deal text, or `null` if not.

**Given** a scraper file,
**When** I inspect it,
**Then** it lives in `server/scrapers/<store-slug>.ts`, uses Axios + Cheerio for HTML parsing, and follows the `_template.ts` contract.

**Given** a dispensary site changes its HTML structure,
**When** the parser fails,
**Then** the scraper returns `[]` and `runScrapers.ts` marks the source `stale: true` without overwriting the last valid deals.

---

### Story 4.3: Dutchie/iFrame Dispensary Support

As a **developer**,
I want dispensaries that serve menus via Dutchie iFrame to be scrapeable via the Python Scraper microservice,
So that the Coverage Zone can include Dutchie-powered dispensaries without requiring JavaScript rendering in the main scraper.

**Acceptance Criteria:**

**Given** a Dutchie/iFrame dispensary in `data.json`,
**When** `runScrapers.ts` calls its scraper,
**Then** the scraper routes through `scraperClient.ts`, which POSTs to the Python Scraper service at `http://localhost:8000/scrape`.

**Given** a successful Python Scraper response with intercepted GraphQL data,
**When** the scraper transforms it,
**Then** the result is a `Deal[]` following the same classification rules (`happy_hour` vs `daily`, 24-hour time strings, `discountPct` as number or null).

**Given** the Python Scraper service is unreachable,
**When** `scraperClient.ts` attempts to call it,
**Then** it returns `[]` — `runScrapers.ts` marks the dispensary `stale: true` and the main server does not crash.

**Given** `scraperClient.ts`,
**When** I inspect the codebase,
**Then** it lives in `server/utils/scraperClient.ts` and Dutchie scraper files live in `server/scrapers/` following the same `export default async function scrape(): Promise<Deal[]>` contract as plain HTML scrapers.

**Given** at least one Dutchie/iFrame dispensary in the Coverage Zone with the Python Scraper running,
**When** a full scraper run executes,
**Then** its parsed deals appear in `data.json` and are served by `GET /api/data`.
