# Architecture — Scraper (`scraper-svc/`)

> Part type: **backend** (Python/FastAPI). Quick Scan, 2026-06-21.

## Executive summary

A standalone Python stealth-scraping microservice. Its job is to read **Dutchie-powered dispensary menus**, which are JavaScript-rendered and invisible to Axios+Cheerio. It exposes an HTTP API the Node server calls. It is **not deployed as a Render service** — it is vendored into the repo (from `C:/Users/erikc/Dev/Scraper`, ADR-017/034) and **booted inside the GitHub Actions job** for the duration of a scrape run, then torn down. The parked alternative (a paid always-on Render private Docker service) is documented in [deploy-scraper-runbook.md](./deploy-scraper-runbook.md) and ADR-033 but is **not** the current path.

## Technology stack

| Category | Technology | Version | Notes |
|---|---|---|---|
| Language | Python | 3.13 | (CI uses 3.13; Docker base image is Playwright python) |
| API | FastAPI + Uvicorn | 0.136 / 0.49 | ASGI; `uvicorn api.server:app` |
| Validation | pydantic | 2.13 | `ScrapeRequest`/`ScrapeResponse` models |
| Browser tier | Playwright + playwright-stealth | 1.60.0 / 2.0.3 | **version pinned to the Docker image tag** |
| TLS tier | curl-cffi | 0.15 | TLS-fingerprint spoof, no JS |
| CF tier | cloudscraper | 1.2.71 | Cloudflare challenge solver, no JS |
| Testing | pytest + pytest-asyncio + httpx | — | async endpoint tests |

## Architecture pattern

**Tiered fetch strategy behind one endpoint.** `POST /scrape` selects a tier by `request.tier`:

- `browser` (default) — Playwright + stealth + **network interception**. Loads the page and captures matching network responses (Dutchie's GraphQL menu payload) via `NetworkInterceptor`. This is the tier Dutchie menus use.
- `tls` — `curl_cffi` TLS-fingerprint spoof; lightweight, no JS.
- `cloudflare` — `cloudscraper`; solves CF challenges, no JS.

All tiers return a uniform `ScrapeResponse { request_url, tier_used, success, duration_ms, intercepted[], raw_html }`. Errors surface as HTTP 502.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness — `{ "status": "ok" }`; the Actions job polls this before scraping |
| POST | `/discover` | debug — returns every URL that fired a network response (find the real API pattern) |
| POST | `/scrape` | unified scrape; tier-selected; returns intercepted payloads or raw HTML |

For Dutchie: `tier=browser`, `intercept_pattern="dutchie\\.com"`, optional `wait_for_pattern` for the specific menu API endpoint.

## Modules

- `api/server.py` — FastAPI app + tier dispatch.
- `scraper/browser.py` — `BrowserManager`: Playwright + stealth lifecycle (async context managers).
- `scraper/fetcher.py` — `tls_fetch` (curl-cffi) and `cloudflare_fetch` (cloudscraper).
- `scraper/interceptor.py` — `NetworkInterceptor`: subscribe to URLs, navigate, collect responses.
- `scraper/models.py` — pydantic request/response/payload models.

## How it is run (current)

In `.github/workflows/scrape-ingest.yml`, for every non-`remedy-tulalip` (Dutchie) store:

```bash
pip install -r requirements.txt
python -m playwright install --with-deps chromium
nohup python -m uvicorn api.server:app --host 127.0.0.1 --port 8000 &
# poll GET /health until ready, then the Node ingestRun calls SCRAPER_URL=/scrape
```

The Node side reaches it via `SCRAPER_URL` (`server/utils/scraperClient.ts`), default `http://localhost:8000/scrape`. `remedy-tulalip` is Axios+Cheerio and skips the ~90s Playwright install entirely.

## Development workflow

```bash
cd scraper-svc
pip install -r requirements.txt
python -m playwright install chromium
python -m uvicorn api.server:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health      # -> {"status":"ok"}
pytest                                  # async endpoint/unit tests
```

## Notes & constraints

- **Playwright version must equal the Docker base image tag** (`v1.60.0-noble`) — see the comment in `requirements.txt`.
- The service is internal/debug-grade: `/scrape` must never be exposed to the public internet if it is ever deployed (ADR-033 — private service only).
