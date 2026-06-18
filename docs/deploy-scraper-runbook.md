# Deploy Runbook — Going Live with the Python Scraper Service

**Status:** Parked / not yet executed. This is the step-by-step for activating **live** Dutchie scraping on Render when a hosting budget is approved.

**Read first:** [ADR-033](../ADR.md) (topology + cost decision) and [ADR-031/032](../ADR.md) (current single-service Render reality). The code is already go-live-ready — `server/utils/scraperClient.ts` reads `process.env.SCRAPER_URL` (default `http://localhost:8000/scrape`, unchanged). Nothing here changes app behavior until you actually create the service and set the env var.

---

## Why this is needed

Today the three Dutchie scrapers POST to `http://localhost:8000/scrape` — the Python Playwright microservice at `C:\Users\erikc\Dev\Scraper` (ADR-017), which is **not deployed**. On Render the POST fails, `postScrape` returns `[]` (by contract — never throws), and `/api/data` serves bundled/last-known deals with those dispensaries marked `stale`.

Going live requires two things, both costing money (ADR-033):
1. Deploy `../Scraper` as a Render service the Happy app can reach privately.
2. Take Happy **off the free tier** so its hourly in-process `setInterval` scrape (`server/index.ts:53-56`) actually runs — free services spin down after ~15 min idle, and Playwright+Chromium needs the paid tier's RAM/shared-memory headroom (free tier 512MB vs. Chromium's ~2GB `shm_size`).

**Estimated cost:** ~$14/mo (two always-on Render Starter instances). A ~$7/mo cron-based alternative exists but is a bigger refactor — see ADR-033; not covered here.

---

## Prerequisites

- [ ] Hosting budget approved (~$14/mo).
- [ ] Access to the Render dashboard for the workspace that owns the Happy service (`Gma` / `srv-d8ni2ikm0tmc73e5uhcg`).
- [ ] The `../Scraper` repo pushed to a Git remote Render can reach (GitHub/GitLab). It is Dockerized and deploy-ready as-is.

---

## Step 1 — Deploy the Scraper as a Render private Docker service

Deploy `../Scraper` as a **Private Service** (not a Web Service) so `/scrape` is **never exposed to the public internet** — only reachable over Render's internal network from the Happy service (ADR-033 security rationale).

Paste-ready Blueprint for the **`../Scraper`** repo (commit this as `render.yaml` **in that repo, not in Happy**):

```yaml
# render.yaml — for the ../Scraper repo (Gma's Helper Python Playwright microservice)
# Deploy as a PRIVATE service: /scrape stays off the public internet, reachable
# only via Render's internal hostname from the Happy web service. See Happy ADR-033.
services:
  - type: pserv                       # private service — internal-only networking
    name: gmaslist-scraper
    runtime: docker
    plan: starter                     # always-on; free tier can't run Chromium reliably
    region: oregon                    # match the Happy service's region
    dockerfilePath: ./Dockerfile      # FROM mcr.microsoft.com/playwright/python:v1.60.0-noble, EXPOSE 8000
    healthCheckPath: /health          # service exposes GET /health -> {"status":"ok"}
    autoDeploy: true
```

Notes:
- The Dockerfile already pins Playwright to its base-image tag and pre-bakes browsers — **do not** add `playwright install`.
- The container listens on **8000** (`CMD uvicorn api.server:app --host 0.0.0.0 --port 8000`).
- If you prefer the dashboard over a Blueprint: New → Private Service → from the Scraper repo → Docker runtime → plan Starter → health check path `/health`.

---

## Step 2 — Point Happy at the Scraper via `SCRAPER_URL`

On the **Happy** Render service, add a dashboard **environment variable** (not a committed `.env` — same channel as `EIA_API_KEY`):

| Key | Value |
|-----|-------|
| `SCRAPER_URL` | `http://gmaslist-scraper:8000/scrape` |

Render internal service URLs take the form `http://<service-name>:<port>`. Here the service name is `gmaslist-scraper` (from Step 1) and the port is `8000`, with the `/scrape` path the client POSTs to.

> ⚠️ **Verify the exact internal-URL form against current Render docs at go-live** — this `http://<service-name>:<port>` form is the documented convention but is *Hypothesized* here, not verified against a live deploy (ADR-033).

`server/index.ts` already loads `dotenv/config`, and `scraperClient.ts` reads `SCRAPER_URL` per call, so no code change is needed — set the var and redeploy.

---

## Step 3 — Take Happy off the free tier

Upgrade the Happy web service (`Gma`) to **Starter** (or higher).

> **Superseded note (ADR-034 Goal C, 2026-06-18):** the in-process boot + hourly `setInterval runScrapers()` was **retired** from `server/index.ts` — Render is now read-only over `data.json` and the GitHub Actions cron → `POST /api/ingest` is the sole data writer. This runbook describes the parked ADR-033 self-host topology; the free-tier-spin-down concern that motivated this upgrade no longer applies (the cron, not Happy, drives scraping).

> **Ephemeral disk caveat:** Render's filesystem is **not** persistent — `data.json` resets to the committed seed on every redeploy. Recovery is **no longer** a boot-time `runScrapers()` (removed in Goal C); the data refreshes on the **next hourly GitHub Actions cron POST** to `/api/ingest`. To shrink the post-redeploy stale window, fire the workflow manually (`gh workflow run scrape-ingest.yml`) after a deploy or keep the committed seed reasonably fresh.

---

## Step 4 — Verify live

Two-part check:

**(a) Confirm the scraper service is up.** From a shell that can reach the service (e.g. a Render shell on the Happy service, which shares the internal network), curl its health endpoint:

```bash
curl http://gmaslist-scraper:8000/health
# expect: {"status":"ok"}
```

**(b) Confirm deals flow.** Hit the public app and confirm the Dutchie dispensaries flip out of `stale`:

```bash
curl -s https://gmaslist.com/api/data | jq '.dispensaries[] | {name, stale}'
# the-joint / jet / kush21 should show "stale": false (were true on free tier)
```

If `/health` is OK but dispensaries stay `stale:true`, check the Happy service logs for `[scraperClient]` errors — most likely the `SCRAPER_URL` value or the internal hostname is wrong (re-check Step 2 against current Render docs).

---

## Rollback

To revert to today's free/bundled-data behavior: remove (or blank) the `SCRAPER_URL` env var on Happy — `scraperClient.ts` falls back to `http://localhost:8000/scrape`, the POST fails on Render, and `/api/data` serves bundled data again. Optionally suspend/delete the `gmaslist-scraper` private service and downgrade Happy to free. No code change required.
