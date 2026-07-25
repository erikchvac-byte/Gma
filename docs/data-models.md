# Data Models — gmas list (Happy)

> Quick Scan, 2026-06-21. There is **no database** — persistence is a single flat file (`server/data/data.json`). The canonical shapes are defined once in `client/src/types/index.ts` and imported by the server.

## Storage

| Aspect | Detail |
|---|---|
| Store | `server/data/data.json` (committed seed) |
| Shape | `ApiDataResponse = { meta, dispensaries }` |
| Writes | atomic (`atomicWriteJson` = temp-file + rename) under an in-process lock (`withDataLock`) |
| Validation gate | `normalizeDeals` on every write path; `filterActiveDeals` / `normalizeDispensaries` on read |
| Durability | ephemeral on Render (resets to seed on redeploy; re-hydrated by next hourly ingest) |
| Run log | `server/data/logs.json` (`LogRun[]`-style records) |

> **Separate substrate (ADR-077):** the derivation engine's product-pricing data lives in a local SQLite DB on the home machine (not in git, not on Render). The home runner precomputes small derived-fact JSON files into `server/data/derived/` that Render serves read-only via `/api/value/*` (fail-soft to empty). This is distinct from the `data.json` deals store modeled here. See [products-local-sqlite-ingest.md](./products-local-sqlite-ingest.md).

## Core entities

### `Deal`
The atomic unit — one promotion at one dispensary.

| Field | Type | Notes |
|---|---|---|
| `type` | `'happy_hour' \| 'daily'` | `happy_hour` is deferred in prod (ADR-030) |
| `description` | `string` | sanitized free text |
| `discountPct` | `number \| null` | percent off; null when not a simple % |
| `startTime` | `string \| null` | window start (happy_hour) |
| `endTime` | `string \| null` | window end |
| `daysValid` | `string[]` | weekday names the deal applies |

### `Dispensary`
A store and its deals + freshness/location metadata.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | stable key; matches the scraper registry id |
| `name` | `string` | display name |
| `url` | `string` | source menu URL |
| `address` | `string` (optional) | street address; rendered top-right on the card. Additive enrichment, NOT a visibility gate (ADR-043) — a bad/absent address never hides the store |
| `distanceMiles` | `number` (optional) | user-relative distance, set at read time by `applyUserDistance` = haversine(user, store) × 1.3 (ADR-057, retired the fixed-origin value of ADR-008/011); drives gas math. No location → stripped → no pill/gas. Any value in `data.json` is ignored (replaced/stripped on render) |
| `lat` / `lng` | `number` (optional) | committed real coords (ADR-044); consumed by `applyUserDistance` (ADR-057). `normalizeDispensaries` strips a non-finite value but keeps the store |
| `stale` | `boolean` | true when the last scrape failed/was empty (good data kept) |
| `lastFetchedAt` | `string` | ISO timestamp of last successful fetch |
| `status` | `'ok' \| 'stale' \| 'failed'` (optional) | per-store ingest recency (ADR-034 Goal B) |
| `deals` | `Deal[]` | active deals (read path filters expired) |

### `Meta`
Feed-level metadata used for true-cost math and freshness.

| Field | Type | Notes |
|---|---|---|
| `lastScraperRun` | `string` | ISO; advances only when a real deal push is accepted |
| `gasPrice` | `number` | $/gal — EIA WA weekly regular (`refreshGasPrice`) |
| `gasPriceUpdatedAt` | `string` | ISO of last gas refresh |

### `ApiDataResponse`
`{ meta: Meta, dispensaries: Dispensary[] }` — the `GET /api/data` payload.

## Server-only contracts (`server/types/index.ts`)

| Type | Shape | Purpose |
|---|---|---|
| `ScraperResult` | `Deal[]` | a single scraper's output |
| `IngestEntry` | `{ dispensaryId: string, deals: Deal[] }` | one store in a `POST /api/ingest` batch |
| `IngestResult` | `'ok' \| 'empty' \| 'stale' \| 'unknown'` | per-store ingest outcome (`empty` = confirmed-empty scrape, ADR-083) |
| `LogEntry` | `string` | `"ok"` or `` `error: ${string}` `` |
| `LogRun` | `{ runAt: string, results: Record<string,LogEntry> }` | one scrape-run log record |

## Derived values (not stored)

True cost is computed client-side, never persisted:

```
driveCost = distanceMiles * 2 * (gasPrice / mpg)   // client/src/utils/gasCost.ts
trueCost  = salePrice + driveCost
```

`gasPrice` comes from `Meta`; `mpg` comes ONLY from the user's vehicle selection (`useVehicleMpg`, persisted in `localStorage`). The hardcoded national-average fallback was removed (ADR-003/013 retired) — with no vehicle selected there is no `mpg`, so no gas figure is shown (distance still shows). Gas needs BOTH a distance and a vehicle.

## Relationships

```
ApiDataResponse
 ├── meta: Meta            (1)
 └── dispensaries: [       (0..n)
       Dispensary
        └── deals: [Deal]  (0..n)
     ]
```

No foreign keys, no migrations — schema evolution is a TypeScript type change plus a `data.json` reshape (no ORM/migration tooling).
