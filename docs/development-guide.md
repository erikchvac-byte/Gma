# Development Guide — gmas list (Happy)

> Quick Scan, 2026-06-21. Multi-part monorepo; each part installs its own deps via `--prefix`.

## Prerequisites

| Tool | Version | For |
|---|---|---|
| Node.js | 22 (`NODE_VERSION` in render.yaml) | client + server |
| npm | bundled with Node | all installs |
| Python | 3.13 | `scraper-svc/` only |
| Playwright browsers | chromium (`python -m playwright install`) | scraper only |

## First-time setup

```bash
# from repo root
npm install                       # root (concurrently)
npm install --prefix client
npm install --prefix server

# scraper (optional unless you touch Dutchie scraping)
cd scraper-svc
pip install -r requirements.txt
python -m playwright install chromium
cd ..
```

Environment: copy `.env.example` → `.env`. Relevant vars:

| Var | Used by | Notes |
|---|---|---|
| `EIA_API_KEY` | server `refreshGasPrice` | gas price; missing ⇒ keeps last-known price |
| `INGEST_SECRET` | server `/api/ingest` + `ingestRun` | ingest is **disabled (503)** if unset |
| `SCRAPER_URL` | server `scraperClient` | default `http://localhost:8000/scrape` |
| `PORT` / `NODE_ENV` | server | default 3001; prod serves client build |

## Run locally

```bash
# both client (Vite :5173) and server (Express :3001) together:
npm run dev                       # root — concurrently runs client dev + tsx watch server

# or individually:
npm run dev --prefix client       # Vite, http://localhost:5173
npm run dev --prefix server       # tsx watch index.ts, http://localhost:3001
```

In dev the server enables CORS for `localhost:5173`, so the SPA can call `/api/data` cross-origin. In production both are the same origin.

## Build

```bash
npm run build                     # root: installs client+server (--include=dev) then builds both
# expands to:
#   npm run build --prefix client  -> tsc -b && vite build  -> client/dist
#   npm run build --prefix server  -> tsc && node scripts/copyData.mjs -> server/dist
npm start                         # node server/dist/server/index.js (serves client/dist + API)
```

> ⚠️ The root `build` deliberately runs `npm install --include=dev` for both parts: under `NODE_ENV=production` npm skips dev deps and the build (vite/tsc) fails. This is load-bearing in `package.json` (the build fix is in package.json, **not** render.yaml — ADR-031/032).

## Test

```bash
npm run test --prefix client      # Vitest + React Testing Library (jsdom)
npm run test --prefix server      # Vitest + supertest
cd scraper-svc && pytest          # pytest + pytest-asyncio
```

**TypeScript strict mode is required** and **tests are expected for everything** (CLAUDE.md). Most source files ship with a colocated `*.test.ts(x)`.

## Lint

```bash
npm run lint --prefix client      # ESLint flat config
```

## Common tasks

**Add a new store scraper:**
1. Create `server/scrapers/<store-id>.ts` (use `_template.ts`) exporting `() => Promise<Deal[]>`.
2. Register it in `server/scrapers/index.ts` — that's the single source of truth; the CI matrix picks it up automatically via `scripts/printStores.ts`.
3. Add the dispensary record (matching `id`) to `server/data/data.json`.
4. Add a test with a fixture under `scrapers/__fixtures__/`.

**Run the scrape+ingest pipeline manually (CI-equivalent):**
```bash
cd server
INGEST_URL=https://gmaslist.com/api/ingest INGEST_SECRET=<secret> \
  npx tsx scripts/ingestRun.ts --store remedy-tulalip
# omit --store to run all registered stores
```

**Trigger the live cron manually:** `gh workflow run scrape-ingest.yml`.

## Conventions

- TypeScript strict; ESM modules (`"type": "module"`).
- Every new module gets a colocated test.
- Update **`ADR.md`** for any architectural decision (CLAUDE.md ADR rule) and keep `_bmad-output/` sprint status current.
- Never delete/disable anything on any system without explicit approval (CLAUDE.md safety rule).
