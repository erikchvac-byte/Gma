# API Contracts — gmas list (Happy)

> Quick Scan, 2026-06-21. Two services expose HTTP: the **Express server** (public) and the **Python scraper** (internal/CI-only).

---

## Express server (`server/`)

Base URL (prod): `https://gmaslist.com`. Local: `http://localhost:3001`.

### `GET /api/data` — public read

Returns the current deal feed. Reads `data/data.json` and strips expired/out-of-window deals via `filterActiveDeals` at read time.

**Response `200`** (`ApiDataResponse`):

```json
{
  "meta": {
    "lastScraperRun": "2026-06-18T19:14:00.000Z",
    "gasPrice": 5.343,
    "gasPriceUpdatedAt": "2026-06-17T12:00:00.000Z"
  },
  "dispensaries": [
    {
      "id": "remedy-tulalip",
      "name": "Remedy Tulalip",
      "url": "https://…",
      "address": "9226 34th Avenue NE, Tulalip, WA 98271",
      "distanceMiles": 4.2,
      "stale": false,
      "lastFetchedAt": "2026-06-18T19:14:00.000Z",
      "deals": [
        {
          "type": "daily",
          "description": "20% off edibles",
          "discountPct": 20,
          "startTime": null,
          "endTime": null,
          "daysValid": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
        }
      ]
    }
  ]
}
```

**Errors:** `500` `{ "error": "Internal server error", "code": "SERVER_ERROR" }` on read/parse failure.

---

### `POST /api/ingest` — authenticated deal push (sole data writer)

Used by the GitHub Actions cron (`scripts/ingestRun.ts`). Not for public use.

**Headers:** `content-type: application/json`, `x-ingest-secret: <INGEST_SECRET>`.

**Body:**

```json
{
  "stores": [
    { "dispensaryId": "the-joint-everett", "deals": [ /* Deal[] */ ] }
  ]
}
```

**Response `200`:**

```json
{ "results": { "the-joint-everett": "ok" } }
```

Per-store result is one of:
- `ok` — deals normalized & applied; dispensary marked fresh (`stale:false`).
- `stale` — empty/invalid deals; good data kept, dispensary flagged `stale:true`.
- `unknown` — no dispensary with that `id` in `data.json` (nothing written).

**Errors:**

| Status | Code | Condition |
|---|---|---|
| `503` | `INGEST_DISABLED` | `INGEST_SECRET` not configured (fail closed) |
| `401` | `UNAUTHORIZED` | missing/incorrect `x-ingest-secret` (constant-time check) |
| `400` | `BAD_REQUEST` | `stores` missing/empty or any entry lacks `dispensaryId:string` + `deals:array` |
| `500` | `SERVER_ERROR` | unexpected failure |

**Security notes:** secret compared via SHA-256 digest + `timingSafeEqual` (no length or content timing leak). Dispensaries matched by `.find(d => d.id === …)` — never index by a request-supplied key (prototype-pollution safe).

---

## Python scraper (`scraper-svc/`) — internal / CI-only

Base URL: `http://127.0.0.1:8000` (booted in the Actions job). **Never exposed publicly.**

### `GET /health`
`200` → `{ "status": "ok" }`. Polled before scraping.

### `POST /scrape`
Unified scrape. Body (`ScrapeRequest`):

```json
{
  "url": "https://dutchie.com/embedded-menu/…",
  "intercept_pattern": "dutchie\\.com",
  "wait_for_pattern": "…",
  "tier": "browser",
  "headless": true,
  "timeout": 45000
}
```

`tier`: `browser` (Playwright+stealth+interception, default), `tls` (curl-cffi), `cloudflare` (cloudscraper).

**Response `200`** (`ScrapeResponse`):

```json
{
  "request_url": "…",
  "tier_used": "browser+stealth",
  "success": true,
  "duration_ms": 1234.5,
  "intercepted": [{ "url": "…", "status": 200, "data": { } }],
  "raw_html": null
}
```

**Errors:** `502` with `detail` on any scrape failure.

### `POST /discover` — debug
Loads the page and returns every URL that fired a network response (`{ duration_ms, urls: [{status,url}] }`). Use to find the real menu API pattern before `/scrape`.

---

## Consumer contracts (the Node `scraperClient`)

`server/utils/scraperClient.ts` wraps `POST /scrape` and **never throws**: on service-down / non-2xx / `success:false` / timeout it returns `[]`, degrading the store to `stale`. Target URL read per-call from `SCRAPER_URL` (default `http://localhost:8000/scrape`).
