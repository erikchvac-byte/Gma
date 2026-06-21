# Integration Architecture — gmas list (Happy)

> How the parts communicate. Quick Scan, 2026-06-21. See ADR-034 for the push-ingest decision.

## Topology

```
┌─────────────┐   GET /api/data    ┌──────────────────────────────┐
│  Browser    │ ─────────────────▶ │  Render web service          │
│  (React SPA)│ ◀───────────────── │  (Express + client/dist)     │
└─────────────┘   {meta,disp[]}    │   reads data.json (READ-ONLY)│
                                   └──────────────┬───────────────┘
                                                  ▲ POST /api/ingest
                                                  │ (x-ingest-secret)
                              ┌───────────────────┴────────────────────┐
                              │  GitHub Actions cron (hourly, UTC)      │
                              │  scrape-ingest.yml                      │
                              │   prepare → matrix(scrape per store)    │
                              │   ingestRun.ts  ── scrape ──┐           │
                              └─────────────────────────────┼──────────┘
                                                            ▼ POST /scrape
                                          ┌──────────────────────────────┐
                                          │ Python scraper (booted in-job)│
                                          │ FastAPI + Playwright stealth  │
                                          └──────────────────────────────┘
```

The Python scraper runs **only inside the Actions job** — it is not a long-lived service the Render app talks to. Render never calls the scraper in the current (ADR-034) topology.

## Integration points

### 1. Client → Server: `GET /api/data`
- **Type:** REST (HTTP GET), same-origin in production.
- **Caller:** `client/src/hooks/useDeals.ts` (fetch on mount, AbortController-cancellable).
- **Payload:** `ApiDataResponse = { meta: Meta, dispensaries: Dispensary[] }` (see [Data Models](./data-models.md)).
- **Production:** one Render origin serves both the React build and the API, so this is same-origin (no CORS).
- **Dev:** server enables CORS for `http://localhost:5173`.
- **Resilience:** client validates response shape and `normalizeDispensaries` drops malformed records; a malformed 200 sets an error state rather than crashing render.

### 2. GitHub Actions cron → Server: `POST /api/ingest`
- **Type:** REST (HTTP POST), shared-secret authenticated.
- **Caller:** `server/scripts/ingestRun.ts` (run by `.github/workflows/scrape-ingest.yml`, hourly UTC + manual dispatch).
- **Auth:** `x-ingest-secret` header, compared constant-time (SHA-256 + `timingSafeEqual`). Endpoint **fails closed** (503) if `INGEST_SECRET` is unset on the server.
- **Body:** `{ stores: [{ dispensaryId, deals: Deal[] }, …] }`.
- **Response:** `{ results: { [dispensaryId]: 'ok' | 'stale' | 'unknown' } }`.
- **Semantics:** sole writer of `data.json`. Empty/invalid deals never overwrite good data (flagged `stale`). One store per matrix job; a non-`ok` result fails the CI run (red = alert email, ADR-034 §6).

### 3. Server scrape pipeline → Python scraper: `POST {SCRAPER_URL}/scrape`
- **Type:** REST (HTTP POST).
- **Caller:** `server/utils/scraperClient.ts` (`postScrape`), used by the Dutchie store scrapers.
- **Target:** `SCRAPER_URL` env (default `http://localhost:8000/scrape`); in CI this is `http://127.0.0.1:8000/scrape` (service booted in-job).
- **Request:** `{ url, intercept_pattern, wait_for_pattern, tier, headless, timeout }`.
- **Response:** `ScrapeResponse` with `intercepted[]` (captured Dutchie GraphQL payloads) or `raw_html`.
- **Resilience:** `postScrape` **never throws** — service down / non-200 / `success:false` / timeout all return `[]`, degrading the store to `stale` instead of failing the run.

## Shared contracts

- **`Deal` / `Dispensary` / `Meta` / `ApiDataResponse`** are defined once in `client/src/types/index.ts` and imported by the server (`server/types/index.ts`, routes, utils) — a single cross-part source of truth. See [Data Models](./data-models.md).
- **Store registry** (`server/scrapers/index.ts`) is the single source of truth for which stores exist; the CI matrix is generated from it via `scripts/printStores.ts`.

## Environment / secrets crossing boundaries

| Secret/var | Set where | Used by |
|---|---|---|
| `INGEST_SECRET` | Render env + GitHub Actions secret | server (verify) ↔ ingestRun (send) |
| `INGEST_URL` | GitHub Actions env | ingestRun → `https://gmaslist.com/api/ingest` |
| `SCRAPER_URL` | CI job env (default localhost) | scraperClient → Python scraper |
| `EIA_API_KEY` | Render env | refreshGasPrice (gas meta) |
