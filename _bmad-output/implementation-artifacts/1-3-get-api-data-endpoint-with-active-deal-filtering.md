---
baseline_commit: c97da548f0e2317cdfe53d9e2bbab4d8a47bd1a4
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

# Story 1.3: GET /api/data Endpoint with Active Deal Filtering

Status: review

## Story

As a **developer**,
I want `GET /api/data` implemented — reading `data.json`, filtering active deals against Pacific Time, and returning the structured response,
So that the frontend has a single, correct data source to build the deal feed on.

## Acceptance Criteria

1. **Given** the server is running, **When** I `GET /api/data`, **Then** it returns HTTP 200 with `{ meta: { lastScraperRun, gasPrice, nationalMpg, gasPriceUpdatedAt }, dispensaries: [...] }`.
2. **Given** a dispensary has a `happy_hour` deal whose `endTime` has already passed in Pacific Time, **When** I `GET /api/data`, **Then** that deal does NOT appear in the response.
3. **Given** a dispensary has a `happy_hour` deal currently active in Pacific Time, **When** I `GET /api/data`, **Then** that deal appears in the response.
4. **Given** a dispensary has a `daily` deal valid today in Pacific Time, **When** I `GET /api/data`, **Then** that deal appears in the response.
5. **Given** active deal filtering logic, **When** I inspect the codebase, **Then** it lives exclusively in `server/utils/filterActiveDeals.ts` — never inlined in the route handler.
6. **Given** an unexpected error in the route, **When** `GET /api/data` fails, **Then** the response is HTTP 500 with `{ error: "Internal server error", code: "SERVER_ERROR" }`.
7. **Given** shared TypeScript types, **When** I inspect the codebase, **Then** `Deal`, `Dispensary`, `Meta`, and `ApiDataResponse` are defined in `client/src/types/index.ts`; server-only types (`ScraperResult`, `LogEntry`, `LogRun`) are in `server/types/index.ts`.

## Tasks / Subtasks

- [x] Task 1: Define shared TypeScript types (AC: 7)
  - [x] `client/src/types/index.ts` — `Deal`, `Dispensary`, `Meta`, `ApiDataResponse` matching the canonical `data.json` schema
  - [x] `server/types/index.ts` — `ScraperResult`, `LogEntry`, `LogRun` matching the `logs.json` schema (re-use `Deal` from client types via relative import — TS-only, no runtime cost)
- [x] Task 2: Implement active deal filtering utility (AC: 2, 3, 4, 5)
  - [x] `server/utils/filterActiveDeals.ts` — exports `filterActiveDeals(dispensaries: Dispensary[]): Dispensary[]`, returns a new array where each dispensary's `deals` array contains only currently-active deals
  - [x] Handle `type: "happy_hour"` — active only if today's Pacific weekday is in `daysValid` (or `daysValid` includes `"everyday"`) AND current Pacific time is within `[startTime, endTime)`
  - [x] Handle `type: "daily"` — active if today's Pacific weekday matches `daysValid` (or `"everyday"`); if `startTime`/`endTime` are both `null`, treat as active all day
  - [x] `server/utils/filterActiveDeals.test.ts` — Vitest, covering AC2 (expired happy_hour), AC3 (active happy_hour), AC4 (active daily), plus a wrong-weekday case and an `everyday` case
- [x] Task 3: Implement `GET /api/data` route (AC: 1, 5, 6, 7)
  - [x] `server/routes/dataRoute.ts` — Express router/handler that reads `server/data/data.json` fresh on each request, calls `filterActiveDeals`, responds `{ meta, dispensaries }`
  - [x] Wrap in try/catch per the architecture's error pattern — on failure, `console.error('[dataRoute]', err)` and respond 500 `{ error: 'Internal server error', code: 'SERVER_ERROR' }`
- [x] Task 4: Wire route into `server/index.ts` (AC: 1)
  - [x] Remove the Story 1.1 placeholder `app.get('/api/data', ...)` handler
  - [x] Mount the new `dataRoute` handler at `GET /api/data`
- [x] Task 5: Route-level test (AC: 1, 6)
  - [x] Add `supertest` + `@types/supertest` as server devDependencies
  - [x] `server/routes/dataRoute.test.ts` — asserts 200 + correct shape against the seeded `data.json`, and a 500 + `{ error, code }` shape when `data.json` is unreadable (mock `fs`)

## Dev Notes

### TZ is already global — use native `Date`, no date library needed

`process.env.TZ = 'America/Los_Angeles'` is set as the first line of `server/index.ts` (Story 1.1). This means **every** `Date` method in the server process (`getDay()`, `getHours()`, `getMinutes()`, `toLocaleString()`, etc.) already returns Pacific Time values — no `date-fns`/`dayjs`/`luxon` needed. `filterActiveDeals.ts` should just call `new Date()` and use native getters directly.

For tests, since `index.ts` (which sets `TZ`) won't necessarily be imported by `filterActiveDeals.test.ts`, set `process.env.TZ = 'America/Los_Angeles'` at the top of the test file (or in a Vitest setup file) before constructing test `Date`s, so weekday/time math is deterministic and matches production.

### Active deal filtering logic

```ts
// server/utils/filterActiveDeals.ts
import type { Dispensary, Deal } from '../../client/src/types/index.js'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function isDealActive(deal: Deal, now: Date): boolean {
  const today = DAY_NAMES[now.getDay()]
  const dayMatches = deal.daysValid.includes('everyday') || deal.daysValid.includes(today)
  if (!dayMatches) return false

  if (deal.startTime === null || deal.endTime === null) return true

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= parseTimeToMinutes(deal.startTime) && nowMinutes < parseTimeToMinutes(deal.endTime)
}

export function filterActiveDeals(dispensaries: Dispensary[], now: Date = new Date()): Dispensary[] {
  return dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => isDealActive(deal, now)),
  }))
}
```

Pass `now` as an optional parameter (defaulting to `new Date()`) so tests can inject a fixed time without mocking globals.

**Known limitation (acceptable for this story):** overnight windows where `endTime < startTime` (e.g. `21:00`–`02:00`) are not specially handled — none of the seeded deals (currently all empty `deals: []`) require this. If Epic 4 scraping produces such a deal, this will need revisiting; do not over-engineer for it now.

**Dispensaries are never removed** — only each dispensary's `deals` array is filtered. A dispensary with zero active deals still appears in the response with `deals: []`; the frontend's empty-state (FR-3) handles display.

### Route implementation

```ts
// server/routes/dataRoute.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import { filterActiveDeals } from '../utils/filterActiveDeals.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/data.json')

export function dataRoute(_req: Request, res: Response) {
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8')
    const { meta, dispensaries } = JSON.parse(raw)
    const response: ApiDataResponse = { meta, dispensaries: filterActiveDeals(dispensaries) }
    res.json(response)
  } catch (err) {
    console.error('[dataRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
```

```ts
// server/index.ts — replace the Story 1.1 placeholder
import { dataRoute } from './routes/dataRoute.js'
// ...
app.get('/api/data', dataRoute)
```

Note ESM (`"type": "module"`, `NodeNext` module resolution): all relative imports must include the `.js` extension even though the source files are `.ts` — this matches the existing `server/index.ts` conventions.

### Type definitions

```ts
// client/src/types/index.ts
export interface Deal {
  type: 'happy_hour' | 'daily'
  description: string
  discountPct: number
  startTime: string | null
  endTime: string | null
  daysValid: string[]
}

export interface Dispensary {
  id: string
  name: string
  url: string
  distanceMiles: number
  stale: boolean
  lastFetchedAt: string
  deals: Deal[]
}

export interface Meta {
  lastScraperRun: string
  gasPrice: number
  nationalMpg: number
  gasPriceUpdatedAt: string
}

export interface ApiDataResponse {
  meta: Meta
  dispensaries: Dispensary[]
}
```

```ts
// server/types/index.ts
import type { Deal } from '../../client/src/types/index.js'

export type ScraperResult = Deal[]

export type LogEntry = string // "ok" | `error: ${string}`

export interface LogRun {
  runAt: string
  results: Record<string, LogEntry>
}
```

`ScraperResult`/`LogEntry`/`LogRun` aren't consumed yet (Epic 4 scope) — defining them now satisfies AC7 and locks in the shape so Epic 4 doesn't redefine it differently.

### Reading data.json

Read with `readFileSync` fresh on every request (no in-memory caching) — `server/data/data.json` is small and is overwritten by the Epic 4 scraper at runtime; caching would serve stale data after a scrape. This matches the architecture's "single source of truth on disk" model.

### Testing

- `server/utils/filterActiveDeals.test.ts` (Vitest): construct `Dispensary[]` fixtures with `happy_hour` and `daily` deals, pass an explicit `now: Date` to `filterActiveDeals`, assert which deals survive. Cover: AC2 (happy_hour, `now` past `endTime`), AC3 (happy_hour, `now` within window), AC4 (daily valid today), a deal whose `daysValid` doesn't include today (filtered out), and an `everyday` deal.
- `server/routes/dataRoute.test.ts` (Vitest + supertest): build a minimal Express app (`express().get('/api/data', dataRoute)`), `supertest(app).get('/api/data')`, assert `200` and response shape `{ meta, dispensaries }` against the real seeded `server/data/data.json`. For the 500 case, mock `node:fs`'s `readFileSync` (e.g. `vi.spyOn`/`vi.mock('node:fs')`) to throw, and assert `500` + `{ error: 'Internal server error', code: 'SERVER_ERROR' }`.
- Run `cd server && npm test` (or `npm test -- --run` for non-watch).

### Project Structure Notes

This story adds:
```
server/
├── routes/
│   └── dataRoute.ts
│   └── dataRoute.test.ts
├── types/
│   └── index.ts
└── utils/
    ├── filterActiveDeals.ts
    └── filterActiveDeals.test.ts
client/src/types/
└── index.ts
```

### References

- Epic context: `_bmad-output/implementation-artifacts/epic-1-context.md` — canonical `data.json` schema, API response shape, cross-story dependencies
- Architecture: API & Communication Patterns, Format Patterns, Process Patterns (Active Deal Filtering, Error Handling — Server) sections
- Architecture: Naming Patterns — `camelCase` JSON fields, `server/utils/filterActiveDeals.ts`, `server/routes/` structure
- Story 1.1 (`1-1-project-scaffold.md`) — established `process.env.TZ` first-line rule, Express/CORS setup, placeholder route being replaced
- Story 1.2 (`spec-1-2-seed-dispensary-data.md`) — `server/data/data.json` seed data this route reads (4 dispensaries, all `deals: []` currently — filtering logic must be correct even though no deals exist yet to filter)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (claude-sonnet-4-6)

### Debug Log References

None — implementation followed the Dev Notes prescriptions directly; no failing debug cycles.

### Completion Notes List

- Implemented all 5 tasks per Dev Notes; logic matches the prescribed `filterActiveDeals`/`dataRoute` implementations verbatim.
- Added 6 unit tests to `filterActiveDeals.test.ts` (AC2 expired happy_hour, AC3 active happy_hour, AC4 active daily, wrong-weekday case, `everyday` case, plus a "dispensary never removed" case) and 2 route tests to `dataRoute.test.ts` (AC1 200 shape, AC6 500 shape via mocked `node:fs`).
- **Architecture fix required for AC7's cross-package import (`server/**` importing `client/src/types/index.ts`)**: `server/tsconfig.json` had `rootDir: "./"`, which caused `tsc --noEmit` to fail with TS6059 ("File is not under 'rootDir'") for any file importing from `../../client/src/types`. Fixed by changing `rootDir` to `".."` (the repo root). This shifts `tsc`'s build output from `dist/index.js` to `dist/server/index.js`, so `server/package.json`'s `start` script was updated to `node dist/server/index.js` to match. `npm run build` was verified to produce the expected `dist/server/...` and `dist/client/src/types/...` structure; the generated `dist/` was removed afterward (already gitignored).
- Full server suite: `npm test` → 3 files, 10 tests, all passing. Client suite: 1 file, 1 test, passing (no regressions).

### File List

- `client/src/types/index.ts` (new)
- `server/types/index.ts` (new)
- `server/utils/filterActiveDeals.ts` (new)
- `server/utils/filterActiveDeals.test.ts` (new)
- `server/routes/dataRoute.ts` (new)
- `server/routes/dataRoute.test.ts` (new)
- `server/index.ts` (modified — wired `dataRoute`, removed Story 1.1 placeholder)
- `server/tsconfig.json` (modified — `rootDir: ".."` to support cross-package type imports)
- `server/package.json` (modified — added `supertest`/`@types/supertest` devDependencies; `start` script updated to `node dist/server/index.js`)

## Change Log

- 2026-06-09: Story implemented — shared types, `filterActiveDeals` utility, `GET /api/data` route wired into `server/index.ts`, full unit + route test coverage added. `server/tsconfig.json` `rootDir` adjusted to `".."` to support the cross-package `client/src/types` import required by AC7 (and `server/package.json` `start` script updated accordingly).
