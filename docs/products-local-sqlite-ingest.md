# Products → local SQLite ingest (ADR-077 Phase 1)

The raw longitudinal product dataset no longer lives in git. It lives in a **local SQLite DB on
the home machine** (`products.db`), and only small **derived facts** (`server/data/derived/*.json`)
are committed and served by Render.

**Load-bearing rule:** Render only ever reads the committed derived JSON. It never opens
`products.db`. If the home machine is off, the site keeps serving the last-pushed facts — only
fresh accrual/derivation pauses.

## Canonical paths

- **DB (the durable store):** `PRODUCTS_DB_PATH`, default `~/GmaS-data/products.db`. Kept OUTSIDE
  any git worktree so a `git reset --hard` in an ingest worktree can never touch it. Backups (raw
  JSON + first DB) are under `~/GmaS-data/backups/`.
- **Ingest worktrees** (dedicated, hard-reset to `origin/master` each run — never your main checkout):
  - `~/Dev/Happy-dutchie-ingest` — Dutchie feeder
  - `~/Dev/Happy-weedmaps-ingest` — Weedmaps feeder (existing, from ADR-064)
  - `~/Dev/Happy-ingest` — derivation runner

## One-time setup

1. Create the data dir and worktrees:
   ```powershell
   New-Item -ItemType Directory -Force "$HOME\GmaS-data" | Out-Null
   git -C "$HOME\Dev\Happy" worktree add "$HOME\Dev\Happy-ingest" master
   git -C "$HOME\Dev\Happy" worktree add "$HOME\Dev\Happy-dutchie-ingest" master
   # (Happy-weedmaps-ingest already exists from setup-weedmaps-task.ps1)
   ```
2. Seed the DB from the last raw file (idempotent, re-runnable):
   ```powershell
   cd "$HOME\Dev\Happy\server"
   npx tsx scripts/importProductsToSqlite.ts --source data\products.json --db "$HOME\GmaS-data\products.db"
   ```
   (If `products.json` is already gone from your checkout, import from the backup under
   `~/GmaS-data/backups/`.) The importer asserts record + observation counts match the source exactly.
3. Dutchie prereqs (one-time, in the worktree's `scraper-svc`):
   ```powershell
   cd "$HOME\Dev\Happy-dutchie-ingest\scraper-svc"
   pip install -r requirements.txt
   python -m playwright install chromium
   ```

## Nightly flow (run in this order)

```powershell
pwsh -NoProfile -File scripts/scrape-dutchie-local.ps1     # Dutchie menu → products.db
pwsh -NoProfile -File scripts/scrape-weedmaps-local.ps1    # Weedmaps menu → products.db (residential IP)
pwsh -NoProfile -File scripts/derive-facts-local.ps1       # products.db → derived/*.json → commit+push master
```

Each script is single-instance-locked, logs under its worktree's `.<name>-ingest/`, and is
fail-soft (a partial scrape still persists what it captured; a push race retries once then skips
and re-accrues next run). Only `derive-facts-local.ps1` commits — the two feeders write to the DB
and commit nothing. The commit is `[skip ci]`, so Render redeploys the fresh facts without
re-triggering Actions.

Schedule the three with Windows Task Scheduler (mirror `scripts/setup-weedmaps-task.ps1`), staggered
so derive runs after the feeders.

## Verifying

- `~/GmaS-data/products.db` grows over time; the feeders' `.<name>-ingest/last-success.txt` heartbeats update.
- After a derive run, `https://gmaslist.com/api/value/disparities` reflects the new numbers within a
  few minutes of the deploy.

## Notes / open items

- **Phase-2 checkpoint:** before "one machine owns all raw data," resolve the
  `caravan-cannabis-burlington` suspected silent-extraction failure (empty menu vs. broken parser) —
  moving fully local without fixing it would bake a silent hole into the raw asset.
- Backup of `products.db` is Erik's responsibility (git's free offsite backup was given up to kill
  the file-size wall). Phase-2 target for backup TBD (private-repo git-LFS / object storage / drive-sync).
