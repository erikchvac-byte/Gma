# Source Tree Analysis — gmas list (Happy)

> Quick Scan (pattern-based) on 2026-06-21. Critical directories annotated; not every file listed.

## Top level

```
Happy/
├── client/                 # Part: client — React 19 SPA
├── server/                 # Part: server — Express API + Node scrape pipeline
├── scraper-svc/            # Part: scraper — Python FastAPI stealth scraper
├── design-system/          # Reference: design tokens / guidelines (not deployed)
├── docs/                   # This generated documentation set + runbooks
├── _bmad/                  # BMad method tooling/config (config.yaml lives here)
├── _bmad-output/           # BMad planning artifacts (PRD, UX, epics, stories)
├── gmaslist.com-ssl-bundle/# TLS bundle artifacts for the domain
├── .github/workflows/      # scrape-ingest.yml (hourly cron -> /api/ingest)
├── render.yaml             # Render Blueprint (single Node web service)
├── package.json            # root: dev/build/start orchestration via --prefix
├── ADR.md                  # Architecture Decision Record (authoritative)
├── GMAS_LIST_BRIEF.md      # canonical design + legal spec
└── TODO.md
```

## client/ — React 19 SPA

```
client/
├── index.html              # Vite entry HTML
├── vite.config.ts          # Vite + @vitejs/plugin-react + @tailwindcss/vite
├── eslint.config.js        # flat ESLint config
├── tsconfig*.json          # app / node / root TS project refs (strict)
└── src/
    ├── main.tsx            # ★ entry point — mounts <App/>
    ├── App.tsx             # composition root: AgeGate > Header > DealFeed > Footer + VehicleSelector
    ├── components/         # feature components (DealCard, DealFeed, AgeGate, Header, filters…)
    │   └── ui/             # design-system primitives (Button, Card, Badge, Select, RangeSlider…)
    ├── hooks/              # useDeals (fetch /api/data), useVehicleMpg, useLocalStorage, useNow…
    ├── utils/              # gasCost (true-cost math), sortDeals, dealView, dealTime, formatTime…
    ├── constants/          # legal.ts — verbatim WAC 314-55-155 warning strings
    ├── types/              # index.ts — Deal / Dispensary / Meta / ApiDataResponse (shared shape)
    ├── styles/             # tokens.css + components.css (CSS custom properties)
    └── assets/             # static assets
```

**Entry point:** `src/main.tsx`. **Integration point:** `hooks/useDeals.ts` calls `GET /api/data`.

## server/ — Express API + Node scrape pipeline

```
server/
├── index.ts                # ★ entry point — Express app; serves API + (in prod) client build
├── routes/
│   ├── dataRoute.ts        # GET /api/data  — reads data.json, filters active deals
│   └── ingestRoute.ts      # POST /api/ingest — shared-secret push (sole data writer)
├── utils/
│   ├── applyIngest.ts      # apply pushed deals to data.json (last-known-good semantics)
│   ├── runScrapers.ts      # in-process scrape orchestration (legacy path; CI uses ingestRun)
│   ├── scraperClient.ts    # ★ HTTP client to Python scraper (POST {SCRAPER_URL}/scrape)
│   ├── refreshGasPrice.ts  # EIA API — WA weekly regular gas price (daily refresh)
│   ├── normalizeDeals.ts   # validation chokepoint for incoming deals
│   ├── filterActiveDeals.ts# strips expired/out-of-window deals on read
│   ├── dataStore.ts        # withDataLock — serializes all data.json writers
│   └── atomicWrite.ts      # atomicWriteJson — temp-file + rename
├── scrapers/               # per-store scrapers + registry (index.ts = matrix source of truth)
│   ├── index.ts            # scrapers registry + storeIds
│   ├── remedy-tulalip.ts   # Axios+Cheerio (in-process, no Python needed)
│   ├── the-joint-everett.ts / jet-cannabis-everett.ts / kush21-everett-evergreen.ts  # Dutchie
│   ├── _template.ts        # scaffold for new stores
│   └── __fixtures__/       # captured HTML/JSON for scraper tests
├── scripts/
│   ├── ingestRun.ts        # ★ CLI run by GitHub Actions: scrape one store -> POST /api/ingest
│   ├── printStores.ts      # emits storeIds JSON for the CI matrix
│   └── copyData.mjs        # build step: copy data/ into dist/
├── types/index.ts          # IngestEntry / IngestResult / LogRun (server-only contracts)
└── data/
    ├── data.json           # ★ flat-file data store (committed seed; ephemeral on Render)
    └── logs.json           # scrape run log
```

**Entry point:** `index.ts` (compiled to `dist/server/index.js`). **Integration points:** serves the client; reads/writes `data.json`; calls the Python scraper.

## scraper-svc/ — Python stealth scraper

```
scraper-svc/
├── requirements.txt        # playwright 1.60.0 (pinned to image), fastapi, curl-cffi, cloudscraper
├── api/
│   └── server.py           # ★ FastAPI app: GET /health, POST /discover, POST /scrape (3 tiers)
└── scraper/
    ├── browser.py          # BrowserManager — Playwright + stealth lifecycle
    ├── fetcher.py          # tls_fetch (curl-cffi) / cloudflare_fetch (cloudscraper)
    ├── interceptor.py      # NetworkInterceptor — captures Dutchie GraphQL responses
    └── models.py           # ScrapeRequest / ScrapeResponse / InterceptedPayload (pydantic)
```

**Entry point:** `api/server.py` (`uvicorn api.server:app`). Booted in the Actions job; reachable at `SCRAPER_URL`.

## Critical-folder summary

| Folder | Purpose |
|---|---|
| `client/src/components` | User-facing UI; `ui/` holds reusable design-system primitives |
| `client/src/utils/gasCost.ts` | True-cost math — the product's core formula |
| `server/routes` | The only two HTTP endpoints (`/api/data`, `/api/ingest`) |
| `server/scrapers` | Per-store scrapers; `index.ts` is the single source of truth for the CI matrix |
| `server/scripts/ingestRun.ts` | The CI scrape-and-push entry the cron invokes |
| `server/data/data.json` | The entire persisted data store |
| `scraper-svc/api/server.py` | Stealth scrape endpoints for Dutchie menus |
| `.github/workflows/scrape-ingest.yml` | Hourly data-refresh pipeline |
