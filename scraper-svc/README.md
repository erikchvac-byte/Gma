# scraper-svc — vendored Python scraper (ADR-034 Goal D / ADR-089)

Stealth-browser scraping service (FastAPI + Playwright + GraphQL interception).
Booted per-run by BOTH production paths:

- **Deals ingest (CI):** `.github/workflows/scrape-ingest.yml` boots it in-job
  (`uvicorn api.server:app`, port 8000) so `server/scripts/ingestRun.ts` can read
  Dutchie menus and POST results to `/api/ingest`.
- **Product accrual (local):** `scripts/scrape-dutchie-local.ps1` (nightly
  Scheduled Task) boots the same service from the `~\Dev\Happy-dutchie-ingest`
  worktree for `scrapeProductsRun.ts` → local `products.db` (ADR-077).

**THIS DIRECTORY IS THE SOURCE OF TRUTH.** It is developed, tested, and patched
in-repo (see `tests/`, run `python -m pytest` from this directory using `.venv`).
`C:\Users\erikc\Dev\Scraper` is a STALE early dev copy — do NOT edit it and do
NOT re-sync from it (that would overwrite in-repo fixes, e.g. the ADR-089
numbered-pagination walk).

Contents: `scraper/` (BrowserManager, NetworkInterceptor + the ADR-089
`paginate_filtered_products` numbered-page walk, fetchers, models),
`api/server.py` (FastAPI `POST /scrape`, `POST /discover`, `GET /health`),
`tests/` (pytest, pure/fake-page — no network), `requirements.txt` (pinned).
Python 3.13.

Key request fields (`ScrapeRequest`): `url`, `intercept_pattern` (regex over
response URLs), `wait_for_pattern` (block until this op fires), `tier`
(`browser`/`tls`/`cloudflare`), `paginate` (opt-in Dutchie FilteredProducts
numbered-page walk — product scrape only; the deals scrape omits it, keeping its
navigate-wait-return timing unchanged).
