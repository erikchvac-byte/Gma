# Epic 1 Context: Project Foundation & Data Layer

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The dev environment runs, the data schema is established, and the single API endpoint serves structured deal data from seed dispensaries. Running `npm run dev` shows data flowing from `data.json` → `GET /api/data` → browser. This epic is the foundation every subsequent story builds on — no deal display, scraping, or gas math is possible without it.

## Stories

- Story 1.1: Project Scaffold (done)
- Story 1.2: Seed Dispensary Data
- Story 1.3: GET /api/data Endpoint with Active Deal Filtering

## Requirements & Constraints

- Ferry exclusion (FR-11) is enforced statically: dispensaries requiring a ferry crossing from zip 98270 (e.g., Whidbey Island, Olympic Peninsula) are never added to `data.json` — no runtime check, just don't include them.
- Flat-file storage only: `server/data/data.json` (dispensaries + cached deals + meta); `server/data/logs.json` (operator scraper log, never served to the frontend).
- All `data.json` writes must be atomic: write to `data.tmp.json` first, then `fs.renameSync` to `data.json`. Never write directly mid-scrape loop.
- `process.env.TZ = 'America/Los_Angeles'` must be the first executable line in `server/index.ts` — before all imports. Active deal windows are evaluated in Pacific Time only.
- All JSON field names in `data.json` and API responses use `camelCase` — never `snake_case`.
- TypeScript strict mode on both client and server. Tests via Vitest, co-located (`*.test.ts`).
- At least 2 real dispensaries within 50 road-miles of zip 98270 must be seeded.

## Technical Decisions

**data.json schema** (canonical — all stories must conform):
```json
{
  "meta": {
    "lastScraperRun": "ISO 8601 timestamp",
    "gasPrice": 3.45,
    "nationalMpg": 28,
    "gasPriceUpdatedAt": "ISO 8601 timestamp"
  },
  "dispensaries": [
    {
      "id": "store-slug",
      "name": "Store Name",
      "url": "https://...",
      "distanceMiles": 12.4,
      "stale": false,
      "lastFetchedAt": "ISO 8601 timestamp",
      "deals": []
    }
  ]
}
```

**logs.json initial state:** `{ "runs": [] }` — append-only, never served to frontend.

**API response shape** (`GET /api/data`):
- Success: `{ meta: Meta, dispensaries: Dispensary[] }` — active deals pre-filtered server-side
- Error: `{ error: string, code: string }` with HTTP 500

**Type locations:**
- `Deal`, `Dispensary`, `Meta`, `ApiDataResponse` → `client/src/types/index.ts`
- `ScraperResult`, `LogEntry`, `LogRun` → `server/types/index.ts`

**Active deal filtering** lives exclusively in `server/utils/filterActiveDeals.ts` — never inlined in route handlers.

**distanceMiles** values are road miles from zip 98270, looked up once via Google Maps driving directions, hardcoded in `data.json`. No routing API at runtime.

## Cross-Story Dependencies

- Story 1.1 (done) created the scaffold. `server/data/` does not exist yet — Story 1.2 creates it.
- Story 1.2 produces `data.json` and `logs.json`; Story 1.3 reads `data.json` to implement the route.
- Stories 1.2 and 1.3 together establish the schema that all Epic 2–4 stories read and write.
