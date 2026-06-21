# Deployment Guide — gmas list (Happy)

> Quick Scan, 2026-06-21. Authoritative detail: `ADR.md` (ADR-031/032/034) and [`deploy-scraper-runbook.md`](./deploy-scraper-runbook.md) (parked self-host path).

## Current production topology

- **One Render web service** (`gmaslist`, runtime `node`, **free** plan) serves both the React build and the Express API from a single origin.
- **Domain:** `gmaslist.com` (apex `216.24.57.1` + `www` CNAME), TLS via Google Trust Services. App also at `gma-zr94.onrender.com`.
- **Data refresh is external:** a GitHub Actions hourly cron runs the scrape pipeline and pushes to `POST /api/ingest`. Render is **read-only** over `data.json` (ADR-034 Goal C).
- The Python scraper is **not** a deployed service — it is booted inside the Actions job.

## Render configuration (`render.yaml`)

```yaml
services:
  - type: web
    name: gmaslist
    runtime: node
    plan: free
    buildCommand: npm install --include=dev && npm run build
    startCommand: npm start
    autoDeploy: true
    envVars:
      - { key: NODE_ENV, value: production }
      - { key: NODE_VERSION, value: "22" }
```

> The blueprint exists, but the live service is **manual** (created in dashboard), so `render.yaml` is not the single source of truth for the running service. The build fix (`--include=dev`) that makes the build pass lives in **root `package.json`**, not render.yaml (ADR-031/032). Auto-deploy fires via a deploy-hook webhook on push to `master`.

### Render env vars (dashboard, not committed)

| Var | Value / source |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `EIA_API_KEY` | EIA petroleum API key (gas refresh) |
| `INGEST_SECRET` | shared secret; must match the GitHub Actions secret |

## Deploy flow

1. Merge to `master`.
2. Deploy-hook webhook triggers a Render build: `npm install --include=dev && npm run build` → `npm start`.
3. `npm start` runs `node server/dist/server/index.js`, which serves `client/dist` statically + the API.

> **Ephemeral filesystem:** Render's disk is not persistent. `data.json` resets to the committed seed on every redeploy. It is re-hydrated by the **next hourly GitHub Actions cron** POST. To shrink the post-deploy stale window, run `gh workflow run scrape-ingest.yml` after a deploy, or keep the committed seed reasonably fresh.

## Data-refresh pipeline (`.github/workflows/scrape-ingest.yml`)

- **Schedule:** `0 * * * *` (hourly UTC) + manual `workflow_dispatch`.
- **`prepare` job:** runs `npx tsx scripts/printStores.ts` → emits the store matrix from the scraper registry.
- **`scrape` job (matrix, one per store, `fail-fast: false`):**
  - Dutchie stores: set up Python 3.13, `pip install -r requirements.txt`, `playwright install --with-deps chromium`, boot Uvicorn on `127.0.0.1:8000`, poll `/health`.
  - `remedy-tulalip`: skips Python (Axios+Cheerio in-process).
  - Runs `npx tsx scripts/ingestRun.ts --store "<store>"` with `INGEST_URL=https://gmaslist.com/api/ingest`, `INGEST_SECRET=${{ secrets.INGEST_SECRET }}`, `SCRAPER_URL=http://127.0.0.1:8000/scrape`.
- **Alerting:** a failed (red) scheduled run is the alert — GitHub emails the repo owner. `ingestRun` exits non-zero on any non-`ok` result, scrape throw, or POST failure (ADR-034 §6).

## Verify a deploy

```bash
curl -s https://gmaslist.com/api/data | jq '.meta'
curl -s https://gmaslist.com/api/data | jq '.dispensaries[] | {name, stale}'
# after a redeploy, kick a refresh:
gh workflow run scrape-ingest.yml
```

## Rollback

- **App:** redeploy a previous commit on Render (or revert the merge on `master`).
- **Ingest:** unset `INGEST_SECRET` on Render → `/api/ingest` returns 503 (fail closed); the app keeps serving last-known/seed `data.json`.
- **Scraper:** unset/blank `SCRAPER_URL` → `scraperClient` falls back to localhost, the POST fails, Dutchie stores serve as `stale`.

## Parked alternative (do NOT build unless budget approved)

Hosting the Python scraper as an always-on Render **private Docker service** (~$14/mo) is documented in [`deploy-scraper-runbook.md`](./deploy-scraper-runbook.md) / ADR-033. The push-ingest design (ADR-034) **superseded** this; the GitHub Actions cron is the current, free path.
