---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-09'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-06-08/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/addendum.md
workflowType: 'architecture'
project_name: 'Happy'
user_name: 'Erikc'
date: '2026-06-08'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (13 FRs):**
- Deal Feed (FR-1–4): Active deal display, card content, empty state, stale indicator
- Distance Filter (FR-5): Client-side radius filtering, 1–50 miles, localStorage-persisted
- Gas-Cost Calculator (FR-6–8): National Average MPG default, daily refresh, optional vehicle precision mode via fueleconomy.gov
- Scraper (FR-9–12): 60-minute scheduled crawl, deal classification, ferry exclusion, operator monitoring log
- Age Gate (FR-13): First-visit overlay, localStorage confirmation

**Non-Functional Requirements:**
- Data freshness: Deals ≤60 min stale; Gas Price + National MPG ≤24h stale
- Error isolation: Scraper failures mark source Stale, do not overwrite last valid data
- Timezone: All deal active-window evaluation in America/Los_Angeles (Pacific Time)
- Mobile-first: Primary use case is mobile (pre-trip check)
- No server-side user data: all user preferences in localStorage
- Compliance: Age gate required; scraping limited to own-site data; no youth marketing

**Scale & Complexity:**
- Primary domain: Full-stack web (SPA + scheduled backend + thin API layer)
- Complexity level: Low-Medium
- Estimated architectural components: 5

### Technical Constraints & Dependencies

- Origin fixed at zip 98270 centroid; no GPS; road distance required (not straight-line)
- Ferry exclusion: static exclusion list applied at dispensary configuration time
- fueleconomy.gov public API: cascading Year → Make → Model dropdowns
- Four external API dependencies: Routing API, fueleconomy.gov, Gas Price source, National MPG source
- Web app only — no app-store presence (avoids Google Play cannabis policy + Apple/Texas age-verification requirements)

### Cross-Cutting Concerns Identified

- **Timezone consistency**: Pacific Time applied everywhere deal windows are evaluated (server and client)
- **Staleness tracking**: Two staleness dimensions — per-dispensary scrape health + per-value data age (gas/MPG)
- **External API resilience**: All four external dependencies need fallback behavior on failure
- **localStorage schema**: Three independent keys (age gate, distance radius, vehicle selection) need consistent naming
- **Scraper fragility**: Per-site HTML parsers break on site changes; operator monitoring log is the recovery path

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web (SPA + Express backend + file-based storage). Custom lean stack for R&D validation.

### Stack Selection Rationale

User-specified stack optimized for zero infrastructure cost, zero external services, and maximum iteration speed during R&D. Every choice eliminates a dependency that would slow validation.

### Selected Starter: Vite + React + TypeScript (react-ts template)

**Frontend Initialization Command:**

```bash
npm create vite@latest client -- --template react-ts
cd client && npm install
npm install -D tailwindcss @tailwindcss/vite
```

**Tailwind v4 vite.config.ts integration:**
```ts
import tailwindcss from '@tailwindcss/vite'
// add to plugins: [react(), tailwindcss()]
```

**Backend Initialization (manual):**
```bash
mkdir server && cd server
npm init -y
npm install express@5 axios cheerio
npm install -D typescript @types/node @types/express tsx
```

**Project Structure:**
```
happy/
├── client/          # Vite + React + Tailwind SPA
│   └── src/
├── server/          # Express + scraper
│   ├── data/
│   │   └── data.json        # dispensaries, cached deals, distances
│   ├── scrapers/            # one file per dispensary
│   ├── routes/              # API endpoints
│   └── index.ts             # Express entry (sets TZ=America/Los_Angeles)
└── README.md
```

### Architectural Decisions This Stack Makes

**Language & Runtime:** TypeScript strict mode on both sides. Node.js runtime.

**Storage:** `data.json` flat file — dispensary config, cached deal data, pre-computed road distances. No database setup, no migrations, zero cost.

**Styling:** Tailwind CSS v4.3.x — CSS-first config (no tailwind.config.js), Vite plugin integration. No PostCSS, no Autoprefixer.

**Build Tooling:** Vite 6.3.x for frontend (dev server at localhost:5173). `tsx` for backend TypeScript execution (no compile step during development).

**Timezone enforcement:** `process.env.TZ = 'America/Los_Angeles'` at the top of Express entry.

**Routing/Distance:** Hardcoded lookup object in data.json — road miles from 98270 to each dispensary, entered once manually, no API cost.

**Vehicle MPG:** Native browser `fetch()` directly to fueleconomy.gov — no backend proxy.

**Scheduler:** `setInterval` loop or manual `npx tsx run-scrapers.ts` — deployable with `pm2`.

**Testing:** Vitest (co-located with Vite, zero config).

**State management:** React built-ins only (useState, useEffect, useContext).

**Note:** Project initialization using the above commands is the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Gas Price source: EIA API (weekly refresh, free, official)
- National Average MPG: Hardcoded 28 MPG for R&D
- data.json schema: defined below
- API endpoint structure: single `GET /api/data` endpoint
- Active deal filtering: server-side at response time
- localStorage key schema: defined below

**Important Decisions (Shape Architecture):**
- scraperLog separated to logs.json (keeps data.json lean)
- CORS: dev-only, prod uses same-origin static serving
- Dev workflow: `concurrently` for client + server
- Deployment: VPS + pm2 + Express serves built SPA statically

**Deferred Decisions (Post-R&D):**
- User MPG toggle ("Your MPG" field) — add if truck/Prius owners report math feels off
- Rate limiting — not needed at R&D scale
- CI/CD pipeline — manual deploy for R&D

### Data Architecture

**Gas Price Source:** EIA (Energy Information Administration) public API
- Free, requires API key (stored in `.env` as `EIA_API_KEY`)
- Weekly update cadence — acceptable given gas price stability for "worth the drive" math
- Satisfies FR-7 spirit; weekly swing doesn't flip go/no-go decisions

**National Average MPG:** Hardcoded `28` in data.json `meta.nationalMpg`
- Satisfies SM-2 (15% accuracy margin)
- No live API dependency; update manually if fleet average shifts significantly
- User-set Vehicle MPG overrides this value client-side

**data.json Schema:**
```json
{
  "meta": {
    "lastScraperRun": "ISO timestamp",
    "gasPrice": 3.45,
    "nationalMpg": 28,
    "gasPriceUpdatedAt": "ISO timestamp"
  },
  "dispensaries": [
    {
      "id": "store-slug",
      "name": "Store Name",
      "url": "https://...",
      "distanceMiles": 12.4,
      "stale": false,
      "lastFetchedAt": "ISO timestamp",
      "deals": [
        {
          "type": "happy_hour | daily",
          "description": "35% off flower",
          "discountPct": 35,
          "startTime": "09:00 | null",
          "endTime": "22:00 | null",
          "daysValid": ["monday | everyday"]
        }
      ]
    }
  ]
}
```

**logs.json Schema** (separate file, operator-only):
```json
{
  "runs": [
    {
      "runAt": "ISO timestamp",
      "results": { "store-slug": "ok | error: ..." }
    }
  ]
}
```
- Not served to frontend
- Operator views directly on VPS or via a protected route (future)
- Satisfies FR-12 (scraper monitoring)

### Authentication & Security

**Age Gate:** localStorage key `gma_age_confirmed = "true"` — set on button click, checked on load. Satisfies FR-13.

**API Security:** No authentication on Express API at R&D scale. Data is public (scraped from public sites). EIA API key stored in `.env`, never committed.

**CORS:** `cors` middleware enabled for `http://localhost:5173` in `development` only. Production: Express serves built Vite SPA statically — same origin, no CORS needed.

### API & Communication Patterns

**Endpoint:** Single `GET /api/data`
- Returns full data.json payload (dispensaries + meta)
- Server filters deals to active-only at response time using Pacific Time (`TZ=America/Los_Angeles`)
- Frontend receives pre-filtered deals; applies client-side distance filter only
- Rationale: timezone logic stays in one place (server); frontend stays stateless

**Error Response Standard:**
```json
{ "error": "Human-readable message", "code": "ERROR_CODE" }
```
HTTP status codes used correctly. Scraper errors logged to logs.json, do not crash server or affect API response.

### Frontend Architecture

**localStorage Key Schema:**

| Key | Type | Purpose |
|---|---|---|
| `gma_age_confirmed` | `"true"` | Age gate bypass |
| `gma_distance_miles` | `"25"` | Selected radius (default 25) |
| `gma_vehicle_mpg` | `"32"` | User vehicle MPG override |
| `gma_vehicle_label` | `"2019 Toyota Camry"` | Display label for gear panel |

**Client-side Router:** None. Single page, no URL-based navigation.

**Happy Hour Countdown:** `setInterval` (60-second tick) inside `useEffect` — re-evaluates active status and remaining time. Cleans up on unmount.

**Distance Filtering:** Client-side against the full dispensary array returned by `/api/data`. No re-fetch on radius change.

### Infrastructure & Deployment

**Dev Workflow:** `concurrently` at project root runs both processes in one terminal:
```json
"dev": "concurrently \"npm run dev --prefix client\" \"npx tsx watch server/index.ts\""
```
Client: `localhost:5173` · Server: `localhost:3001`

**Production Deployment:** Single VPS (Render free tier / Railway / DigitalOcean $4/mo)
- Express serves built Vite SPA from `client/dist` via `express.static`
- `pm2` keeps the process alive and restarts on crash
- Scraper runs on same process via `setInterval` at server startup
- Single port (`:3001` or assigned by host), no reverse proxy needed for R&D

**Environment Config:**
```
EIA_API_KEY=xxx        # Gas price data
NODE_ENV=production    # Controls CORS, logging
PORT=3001              # Overridable by host
```

### Decision Impact Analysis

**Implementation Sequence:**
1. Project scaffold (Vite client + Express server, concurrently dev workflow)
2. data.json + logs.json file structure and seed data
3. Express `GET /api/data` with active-deal filtering and TZ enforcement
4. Frontend Deal Feed consuming API data with distance filter
5. Gas Cost Calculator (using `meta.gasPrice` + `meta.nationalMpg`)
6. Age gate (localStorage check on load)
7. Vehicle precision mode (fueleconomy.gov cascading dropdowns)
8. Scraper engine (Axios + Cheerio, one parser per dispensary)
9. EIA gas price refresh (daily fetch, write to data.json)
10. Operator scraper log (logs.json write per run)

**Cross-Component Dependencies:**
- Scraper writes to data.json → API reads data.json → Frontend consumes API
- TZ enforcement on server affects deal active-status filtering (single source of truth)
- Vehicle MPG (localStorage) overrides `meta.nationalMpg` client-side only
- logs.json is write-only from scraper; never read by frontend

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 areas where AI agents could make different choices without explicit rules:
naming conventions, file structure, API response shape, date handling,
error patterns, loading state, scraper structure, data.json mutation.

---

### Naming Patterns

**JSON Field Naming (data.json and API responses):** `camelCase`
- `distanceMiles`, `discountPct`, `startTime`, `lastFetchedAt`, `gasPriceUpdatedAt`
- Never: `distance_miles`, `discount_pct`

**TypeScript Code:** Standard TS conventions
- Functions and variables: `camelCase` — `getActiveDeals()`, `distanceMiles`
- React components: `PascalCase` — `DealCard`, `DistanceFilter`, `AgeGate`
- Types and interfaces: `PascalCase` — `Deal`, `Dispensary`, `ApiResponse`
- Constants: `SCREAMING_SNAKE_CASE` — `DEFAULT_DISTANCE_MILES`, `MAX_DISTANCE_MILES`
- Boolean variables: `is`/`has` prefix — `isStale`, `hasAgeConfirmation`

**File Naming:**
- React components: `PascalCase.tsx` — `DealCard.tsx`, `AgeGate.tsx`
- Hooks: `camelCase.ts` with `use` prefix — `useDeals.ts`, `useLocalStorage.ts`
- Server routes/utils: `camelCase.ts` — `dealsRoute.ts`, `filterActiveDeals.ts`
- Scrapers: `kebab-case.ts` matching store slug — `altitude-dispensary.ts`
- Test files: co-located, same name + `.test.ts` suffix — `DealCard.test.tsx`

**API Endpoints:** `kebab-case`, plural nouns. Single endpoint: `GET /api/data`

**localStorage Keys:** `gma_` prefix, `snake_case`
- `gma_age_confirmed`, `gma_distance_miles`, `gma_vehicle_mpg`, `gma_vehicle_label`

---

### Structure Patterns

**Project File Organization:**
```
happy/
├── client/
│   └── src/
│       ├── components/     # React components (PascalCase.tsx)
│       ├── hooks/          # Custom hooks (useX.ts)
│       ├── types/          # Shared TypeScript types (index.ts)
│       ├── utils/          # Pure functions (camelCase.ts)
│       └── main.tsx
├── server/
│   ├── data/
│   │   ├── data.json
│   │   └── logs.json
│   ├── scrapers/           # One file per dispensary (kebab-case.ts)
│   ├── routes/             # Express route handlers
│   ├── utils/              # Server utilities
│   └── index.ts            # Entry point — TZ set here, first line
└── package.json
```

**Shared Types:** All shared types in `client/src/types/index.ts`.
Server-only types in `server/types/index.ts`.

---

### Format Patterns

**API Response — Success:**
```ts
// GET /api/data — direct object, no wrapper
{
  meta: { lastScraperRun, gasPrice, nationalMpg, gasPriceUpdatedAt },
  dispensaries: Dispensary[]
}
```

**API Response — Error:**
```ts
{ error: string, code: string }
// HTTP status codes: 200, 400, 500 only
```

**Date/Time format:** ISO 8601 strings in all JSON — `"2026-06-08T14:30:00.000Z"`
Parse to `Date` at render time; never store `Date` objects in React state.

**Deal time fields:** 24-hour strings — `"09:00"`, `"22:00"`, `null` for all-day.
Never store 12-hour format (`"9am"`) in data.json.

---

### Process Patterns

**Active Deal Filtering (Server):**
Always filter in `server/utils/filterActiveDeals.ts`. Never inline in route handlers.

**data.json Writes (Scraper):**
Write atomically: write to `data.tmp.json`, then `fs.renameSync` to `data.json`.
Never write directly mid-scrape — prevents serving partial data.

**Error Handling — Server:**
```ts
try {
  // route logic
} catch (err) {
  console.error('[route-name]', err)
  res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
}
```

**Error Handling — Client:**
Catch at the `useDeals` hook level. Expose `error: string | null` to components.
Never fetch directly in components — all data access through hooks.

**Loading State Pattern:**
```ts
const { data, isLoading, error } = useDeals()
// Render: isLoading → skeleton | error → message | data → feed
```

**Scraper File Contract:**
```ts
export default async function scrape(): Promise<Deal[]>
// Returns [] on parse failure. Never throws. Caller handles Stale marking.
// Plain HTML dispensaries: use Axios + Cheerio directly.
// Dutchie/iFrame dispensaries: call scraperClient.ts → POST /scrape on Python service,
//   then transform intercepted[].data (raw GraphQL JSON) → Deal[].
```

---

### Enforcement Guidelines

**All AI agents MUST:**
- Set `process.env.TZ = 'America/Los_Angeles'` as the **first line** of `server/index.ts`
- Use `camelCase` for all JSON fields in data.json and API responses
- Route all client data access through custom hooks, never raw `fetch` in components
- Write data.json atomically (tmp file + rename)
- Return `Deal[]` (empty on failure) from scrapers — never throw
- Co-locate test files with source (`*.test.ts` suffix)
- Prefix all localStorage keys with `gma_`

**Anti-Patterns:**
- `snake_case` in JSON fields (`discount_pct` → `discountPct`)
- `fetch('/api/data')` directly inside a React component
- Writing to `data.json` mid-scrape loop
- Hardcoding timezone strings anywhere except `server/index.ts`
- Storing `Date` objects in React state

## Project Structure & Boundaries

### Complete Project Directory Structure

```
happy/
├── package.json                     # Root: "dev" (concurrently), "build", "start"
├── .env                             # EIA_API_KEY, NODE_ENV, PORT (not committed)
├── .env.example                     # Template — committed
├── .gitignore
├── ADR.md
│
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts               # react() + tailwindcss() plugins + /api proxy
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   └── src/
│       ├── main.tsx                 # Entry point; renders <App />
│       ├── App.tsx                  # AgeGate wrapper → DealFeed layout
│       ├── index.css                # @import "tailwindcss" (Tailwind v4)
│       ├── components/
│       │   ├── AgeGate.tsx          # FR-13: full-page overlay, localStorage check
│       │   ├── DealFeed.tsx         # FR-1, FR-3, FR-4: deal list + empty state + stale badge
│       │   ├── DealCard.tsx         # FR-2: single card — name, distance, gas cost, countdown
│       │   ├── DistanceFilter.tsx   # FR-5: radius slider/input control
│       │   ├── VehicleSelector.tsx  # FR-8: gear icon + cascading Year→Make→Model dropdowns
│       │   └── StaleIndicator.tsx   # FR-4: non-intrusive stale source count
│       ├── hooks/
│       │   ├── useDeals.ts          # Fetches GET /api/data; returns { data, isLoading, error }
│       │   ├── useLocalStorage.ts   # Generic typed localStorage get/set hook
│       │   ├── useDistanceFilter.ts # FR-5: reads/writes gma_distance_miles
│       │   ├── useVehicleMpg.ts     # FR-8: reads/writes gma_vehicle_mpg + gma_vehicle_label
│       │   └── useFuelEconomy.ts    # FR-8: client fetch to fueleconomy.gov (years, makes, models)
│       ├── utils/
│       │   ├── gasCost.ts           # Pure fn: (distanceMiles, gasPrice, mpg) → dollar cost
│       │   └── formatTime.ts        # Countdown display, 24h→12h, ISO→readable
│       └── types/
│           └── index.ts             # Deal, Dispensary, Meta, ApiDataResponse — canonical types
│
└── server/
    ├── package.json
    ├── tsconfig.json
    ├── index.ts                     # FIRST LINE: process.env.TZ; Express setup + routes + scheduler
    ├── data/
    │   ├── data.json                # Dispensaries + cached active deals + meta
    │   └── logs.json                # Scraper run history — operator only, never served to frontend
    ├── routes/
    │   └── dataRoute.ts             # GET /api/data — reads data.json, calls filterActiveDeals
    ├── scrapers/
    │   └── _template.ts             # Starter: export default async function scrape(): Promise<Deal[]>
    ├── utils/
    │   ├── filterActiveDeals.ts     # FR-1: active deal logic using Pacific Time
    │   ├── runScrapers.ts           # FR-9, FR-12: orchestrates scrapers, writes data.json + logs.json
    │   ├── refreshGasPrice.ts       # FR-7: fetches EIA API, patches meta.gasPrice in data.json
    │   ├── atomicWrite.ts           # Writes data.tmp.json then fs.renameSync → data.json
    │   └── scraperClient.ts         # POST /scrape wrapper for Dutchie scrapers — returns raw intercepted[] or []
    └── types/
        └── index.ts                 # Server-only types: ScraperResult, LogEntry, LogRun
```

### Architectural Boundaries

**API Boundary — single external interface:**
- `GET /api/data` → `{ meta: Meta, dispensaries: Dispensary[] }` (active deals only, pre-filtered)
- Error: `{ error: string, code: string }` with HTTP 500
- Operator log access is direct file read on VPS — no API endpoint for logs

**Component Boundaries:**
- `AgeGate` wraps `App` — nothing below renders until `gma_age_confirmed` is set
- `DealFeed` owns distance filtering — receives full dispensary list, applies `gma_distance_miles` client-side
- `DealCard` is purely presentational — receives `Dispensary` + computed `gasCostDollars` as props
- `VehicleSelector` owns its own localStorage state; notifies parent via `onMpgChange(mpg, label)` callback
- All data fetching isolated to `hooks/` — zero direct `fetch()` calls in component files

**Data Boundaries:**
- `data.json` — single source of truth; written by scraper, read by API route
- `logs.json` — append-only; written by `runScrapers.ts`, never read by frontend or API
- `localStorage` — client-only persistence; four keys, all prefixed `gma_`

### Requirements to Structure Mapping

- **FR-1–4 (Deal Feed):** `DealFeed.tsx` + `DealCard.tsx` + `StaleIndicator.tsx` + `useDeals.ts` + `filterActiveDeals.ts`
- **FR-5 (Distance Filter):** `DistanceFilter.tsx` + `useDistanceFilter.ts` — pure client-side
- **FR-6–7 (Gas Cost + Refresh):** `gasCost.ts` (client) + `refreshGasPrice.ts` (server) + `meta.gasPrice` in `data.json`
- **FR-8 (Vehicle Mode):** `VehicleSelector.tsx` + `useFuelEconomy.ts` + `useVehicleMpg.ts` — entirely client-side
- **FR-9–12 (Scraper):** `server/scrapers/*.ts` + `runScrapers.ts` + `atomicWrite.ts` + `logs.json`
- **FR-11 (Ferry Exclusion):** No code — excluded dispensaries never appear in `data.json`
- **FR-13 (Age Gate):** `AgeGate.tsx` + `gma_age_confirmed` localStorage key

### Integration Points

**External Integrations:**

| Service | Direction | Location | Fallback |
|---|---|---|---|
| EIA API (gas price) | Server outbound | `refreshGasPrice.ts` | Keep last known value in data.json |
| fueleconomy.gov (vehicle MPG) | Client outbound | `useFuelEconomy.ts` | Show error in dropdown, fall back to `nationalMpg` |
| Python Scraper service (Dutchie/iFrame menus) | Server outbound | `server/utils/scraperClient.ts` → `server/scrapers/happy-time-*.ts` | Return `[]`; `runScrapers.ts` marks source Stale |

**Data Flow (end-to-end):**
```
[Plain HTML sites]     → scrapers/*.ts (Axios+Cheerio)                              → runScrapers.ts → atomicWrite → data.json
[Dutchie iFrame sites] → Python Scraper :8000 → scrapers/*.ts (GraphQL → Deal[])   → runScrapers.ts → atomicWrite → data.json
[EIA API]              → refreshGasPrice.ts                                         → atomicWrite → data.json (meta.gasPrice)
data.json → dataRoute.ts → filterActiveDeals.ts → GET /api/data response
GET /api/data → useDeals.ts → DealFeed.tsx → DealCard.tsx (× n)
localStorage(gma_distance_miles) → DealFeed client-side filter
localStorage(gma_vehicle_mpg)    → gasCost.ts calculation per card
fueleconomy.gov → useFuelEconomy.ts → VehicleSelector.tsx → useVehicleMpg.ts → localStorage
```

### Development Workflow Integration

**Dev:** `npm run dev` at root starts `concurrently`:
- Vite dev server → `http://localhost:5173` (HMR)
- `tsx watch server/index.ts` → `http://localhost:3001`
- Vite proxies `/api/*` to `localhost:3001` (in `vite.config.ts`)

**Production Build:**
```bash
npm run build   # builds client/dist/
npm start       # Express serves client/dist as static + API on PORT
```

**Scraper Template** (`server/scrapers/_template.ts`):
```ts
import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Deal } from '../types'

export default async function scrape(): Promise<Deal[]> {
  try {
    const { data } = await axios.get('https://dispensary-url.com/deals')
    const $ = cheerio.load(data)
    // parse and return Deal[]
    return []
  } catch {
    return []  // caller marks source Stale
  }
}
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology versions are compatible. Tailwind v4 uses the
`@tailwindcss/vite` plugin (not PostCSS) — correctly specified. Express v5 is the current
recommended release for new projects. No version conflicts detected across the full stack.

**Pattern Consistency:** camelCase JSON fields, hooks-only data fetching, server-side TZ
enforcement, and atomic data.json writes are all mutually reinforcing. No contradictions.

**Structure Alignment:** Every pattern rule has a corresponding file in the project tree
(`filterActiveDeals.ts`, `atomicWrite.ts`, `hooks/`, `scrapers/`). Structure enables patterns.

### Requirements Coverage Validation ✅

All 13 functional requirements have explicit architectural support:

| FR | Owner File(s) | Status |
|---|---|---|
| FR-1 Active deals in range | `filterActiveDeals.ts` + `DealFeed.tsx` | ✅ |
| FR-2 Deal card content | `DealCard.tsx` + `gasCost.ts` + `formatTime.ts` | ✅ |
| FR-3 Empty state + timestamp | `DealFeed.tsx` + `meta.lastScraperRun` | ✅ |
| FR-4 Stale indicator | `StaleIndicator.tsx` + `Dispensary.stale` | ✅ |
| FR-5 Distance filter | `DistanceFilter.tsx` + `useDistanceFilter.ts` | ✅ |
| FR-6 Default gas cost | `gasCost.ts` + `meta.nationalMpg` (28 MPG) | ✅ |
| FR-7 Gas price/MPG refresh | `refreshGasPrice.ts` (EIA) + hardcoded MPG | ✅ |
| FR-8 Vehicle precision mode | `VehicleSelector.tsx` + `useFuelEconomy.ts` | ✅ |
| FR-9 60-min scraper schedule | `runScrapers.ts` + `setInterval` in `index.ts` | ✅ |
| FR-10 Deal classification | Scraper contract: `type: "happy_hour" \| "daily"` | ✅ |
| FR-11 Ferry exclusion | Static — excluded dispensaries never added to `data.json` | ✅ |
| FR-12 Operator log | `logs.json` written per `runScrapers.ts` run | ✅ |
| FR-13 Age gate | `AgeGate.tsx` + `gma_age_confirmed` localStorage | ✅ |

**NFR Coverage:** Data freshness (≤60 min deals, ≤24h gas price), error isolation (stale flag +
atomic writes), Pacific Time enforcement, mobile-first responsive, no server-side user data,
age gate compliance — all addressed.

### Implementation Readiness Validation ✅

All critical decisions documented with verified versions. Implementation sequence defined
(Steps 1–10 in Core Architectural Decisions). Scraper template provided. All 8 conflict
categories addressed with concrete examples and anti-patterns.

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps:**

1. **fueleconomy.gov API returns XML by default.** `useFuelEconomy.ts` must send
   `Accept: application/json` header. Agents must not assume JSON response.

2. **Missing packages not listed explicitly:**
   - Root `package.json` devDependencies: `concurrently`
   - Server `package.json` dependencies: `cors`, `dotenv`
   - Server `package.json` devDependencies: `@types/cors`

3. **Initial data.json seed is a manual step.** Before the first scraper run, a developer
   must hand-populate `dispensaries[]` with store names, URLs, slugs, and `distanceMiles`
   values (looked up once via Google Maps). This is Story 0 / pre-implementation setup.

**Nice-to-Have Gaps:**
- EIA API endpoint specifics resolved when implementing `refreshGasPrice.ts`
- pm2 config file (`ecosystem.config.js`) not specified — fine for R&D, add when deploying

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — all 13 FRs covered, no critical gaps, stack versions verified,
patterns are explicit and enforceable.

**Key Strengths:**
- Zero-cost, zero-infrastructure stack eliminates R&D setup friction entirely
- Single `GET /api/data` endpoint with server-side active filtering = simple, correct timezone handling
- Atomic write pattern prevents serving partial/corrupt deal data
- All user state in localStorage — no backend user data surface at all
- Scraper contract (returns `Deal[]`, never throws) makes adding new dispensaries trivial

**Areas for Future Enhancement:**
- Replace data.json with SQLite when dispensary count exceeds ~50 or concurrent writes become a concern
- Replace setInterval with a proper cron library (node-cron) if scheduling reliability matters
- Add a lightweight `/api/logs` endpoint for operator log access without VPS shell access

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently — especially camelCase JSON, hooks-only fetching, atomic writes
- `process.env.TZ = 'America/Los_Angeles'` MUST be the first executable line in `server/index.ts`
- Send `Accept: application/json` when fetching fueleconomy.gov endpoints

**First Implementation Priority:**
```bash
# Step 0 (pre-code): Hand-populate server/data/data.json with dispensary list + distanceMiles
# Step 1: Scaffold the project
npm create vite@latest client -- --template react-ts
mkdir server && cd server && npm init -y
```
