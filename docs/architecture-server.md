# Architecture — Server (`server/`)

> Part type: **backend** (Node/Express). Quick Scan, 2026-06-21.

## Executive summary

An Express 5 service that (a) serves the public read API `GET /api/data`, (b) serves the built React client in production from the same origin, and (c) accepts authenticated deal pushes at `POST /api/ingest`. Persistence is a single flat file, `data/data.json`, written atomically under an in-process lock. On Render the service is **read-only** over that file — the GitHub Actions cron is the sole writer (ADR-034 Goal C). A daily background task refreshes the gas price from the EIA API.

## Technology stack

| Category | Technology | Version | Notes |
|---|---|---|---|
| Language | TypeScript | ^5 | ESM (`"type": "module"`), strict |
| HTTP framework | Express | ^5.0 | path-to-regexp v8 — note SPA-fallback RegExp |
| Scrape HTTP | axios | ^1.0 | to Python scraper + ingest POST |
| HTML parse | cheerio | ^1.0 | Axios+Cheerio stores (e.g. remedy-tulalip) |
| Config | dotenv | ^16 | `EIA_API_KEY`, `INGEST_SECRET`, `SCRAPER_URL` |
| Runtime/build | tsx (dev), tsc + copyData.mjs (build) | — | output to `dist/server/index.js` |
| Testing | Vitest + supertest | ^3 / ^7 | route + util unit/integration tests |

## Architecture pattern

**Thin route handlers over a flat-file store, with a strict ingestion chokepoint.** Two endpoints only. All writes funnel through `withDataLock` (serialization) + `atomicWriteJson` (temp-file + rename) so concurrent writers can't corrupt `data.json`. `normalizeDeals` is the single validation gate every write path uses.

`index.ts` bootstrap:

```
process.env.TZ = 'America/Los_Angeles'
app.use(express.json())
dev: CORS allow http://localhost:5173
GET  /api/data    -> dataRoute
POST /api/ingest  -> ingestRoute
prod: express.static(client/dist) + SPA fallback RegExp /^(?!\/api).*/
boot: refreshGasPrice() now, then every 24h
```

## Endpoints

See [API Contracts](./api-contracts.md) for full request/response detail.

- **`GET /api/data`** — reads `data.json`, runs `filterActiveDeals` (drops expired/out-of-window deals at read time), returns `{ meta, dispensaries }`. 500 on read/parse failure.
- **`POST /api/ingest`** — fails closed if `INGEST_SECRET` unset (503); constant-time secret check via SHA-256 + `timingSafeEqual` (401); shape-validates `{ stores: [{dispensaryId, deals}] }` (400); applies via `applyIngest` and returns per-store `ok|stale|unknown`.

## Data layer

- **Store:** `data/data.json` — `{ meta: Meta, dispensaries: Dispensary[] }`.
- **Writers:** `applyIngest` (push), `refreshGasPrice` (gas meta), legacy `runScrapers`. All wrapped in `withDataLock` + atomic write.
- **Last-known-good semantics:** an empty/invalid scrape never overwrites good deals — the dispensary is just flagged `stale: true`. `meta.lastScraperRun` advances only when something was actually accepted.
- **Prototype-pollution safe:** ingest matches dispensaries by `id` via `.find`, never indexing by a request-supplied key.
- **Ephemeral on Render:** filesystem resets to the committed seed on redeploy; re-hydrated by the next hourly cron POST.

## Scrape pipeline

- `scrapers/index.ts` — registry mapping `storeId -> () => Promise<Deal[]>` and `storeIds` (the **single source of truth** for the CI matrix).
- Per-store scrapers: `remedy-tulalip` (Axios+Cheerio, in-process) vs Dutchie stores (`the-joint-everett`, `jet-cannabis-everett`, `kush21-everett-evergreen`) which route through `scraperClient.postScrape` → the Python service.
- `scripts/ingestRun.ts` — CLI the CI cron runs: scrape one store (`--store <id>`, 90s backstop timeout) → `normalizeDeals` → `POST /api/ingest`. Exit code is the alert signal: any non-`ok` per-store result, scrape throw, or POST failure ⇒ non-zero exit ⇒ red (emailed) CI run.
- `scripts/printStores.ts` — emits `storeIds` JSON to drive the Actions matrix.

`scraperClient.postScrape` **never throws** — any failure returns `[]`, so a scrape degrades a store to `stale` rather than crashing the run.

## Development workflow

```bash
npm install --prefix server
npm run dev   --prefix server     # tsx watch index.ts (PORT 3001)
npm run build --prefix server     # tsc && node scripts/copyData.mjs
npm run start --prefix server     # node dist/server/index.js
npm run test  --prefix server     # Vitest (+ supertest)

# one-off CI-equivalent run:
INGEST_URL=https://gmaslist.com/api/ingest INGEST_SECRET=… \
  npx tsx scripts/ingestRun.ts --store remedy-tulalip
```

Env vars: `EIA_API_KEY` (gas refresh), `INGEST_SECRET` (ingest auth — fail-closed), `SCRAPER_URL` (Python scraper target; default `http://localhost:8000/scrape`), `NODE_ENV`, `PORT`.

## Testing strategy

Vitest unit tests beside every util and route, plus supertest integration tests for `dataRoute`/`ingestRoute`. Scraper tests use captured fixtures in `scrapers/__fixtures__/`. `ingestRun`/`runScrapers` are tested via injectable `postFn`/`registry` seams.
