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
| `distanceMiles` | `number` | from the user's reference point (Marysville-area) — drives gas math |
| `stale` | `boolean` | true when the last scrape failed/was empty (good data kept) |
| `lastFetchedAt` | `string` | ISO timestamp of last successful fetch |
| `deals` | `Deal[]` | active deals (read path filters expired) |

### `Meta`
Feed-level metadata used for true-cost math and freshness.

| Field | Type | Notes |
|---|---|---|
| `lastScraperRun` | `string` | ISO; advances only when a real deal push is accepted |
| `gasPrice` | `number` | $/gal — EIA WA weekly regular (`refreshGasPrice`) |
| `nationalMpg` | `number` | fallback MPG when user hasn't picked a vehicle |
| `gasPriceUpdatedAt` | `string` | ISO of last gas refresh |

### `ApiDataResponse`
`{ meta: Meta, dispensaries: Dispensary[] }` — the `GET /api/data` payload.

## Server-only contracts (`server/types/index.ts`)

| Type | Shape | Purpose |
|---|---|---|
| `ScraperResult` | `Deal[]` | a single scraper's output |
| `IngestEntry` | `{ dispensaryId: string, deals: Deal[] }` | one store in a `POST /api/ingest` batch |
| `IngestResult` | `'ok' \| 'stale' \| 'unknown'` | per-store ingest outcome |
| `LogEntry` | `string` | `"ok"` or `` `error: ${string}` `` |
| `LogRun` | `{ runAt: string, results: Record<string,LogEntry> }` | one scrape-run log record |

## Derived values (not stored)

True cost is computed client-side, never persisted:

```
driveCost = distanceMiles * 2 * (gasPrice / mpg)   // client/src/utils/gasCost.ts
trueCost  = salePrice + driveCost
```

`gasPrice` comes from `Meta`; `mpg` from the user's vehicle selection (`useVehicleMpg`, persisted in `localStorage`), falling back to `meta.nationalMpg`.

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
