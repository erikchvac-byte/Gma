# scraper-svc — vendored Python scraper (ADR-034 Goal D)

Vendored copy of the stealth-browser scraping service. The GitHub Actions cron
workflow (`.github/workflows/scrape-ingest.yml`) boots this in-job (`uvicorn
api.server:app`, port 8000) so the Node push-runner (`server/scripts/ingestRun.ts`)
can read Dutchie menus and POST results to `/api/ingest`.

**Source of truth:** `C:\Users\erikc\Dev\Scraper` is where this service is
developed and tested. This directory is a **copy** for CI. When the upstream
scraper changes, re-sync:

```bash
(cd ../Scraper && tar --exclude='__pycache__' --exclude='*.pyc' -cf - scraper api requirements.txt) \
  | (cd scraper-svc && tar -xf -)
```

Contents: `scraper/` (BrowserManager, NetworkInterceptor, fetchers, models),
`api/server.py` (FastAPI `POST /scrape`, `POST /discover`, `GET /health`),
`requirements.txt` (pinned). Python 3.13. See upstream `HANDOFF.md` for the full brief.
