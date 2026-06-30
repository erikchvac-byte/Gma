# Weedmaps residential-IP ingestion (AI-search Phase 3)

Nightly accrual of Weedmaps product prices, run from a **residential IP** because
GitHub-Actions / datacenter IPs are HTTP-406-walled by Weedmaps (confirmed 2026-06-29: 44/44
requests blocked; the same fetch returns 200 from a home IP). The durable product store is the
committed `server/data/products.json` (Render's disk is ephemeral), so this is how Phase 3 (CAP-6
observation accrual) actually accumulates days→weeks of data for the B1 "vs own median" trendlines.

It reuses the unchanged `server/scripts/scrapeWeedmapsRun.ts` and mirrors the commit-back step in
`.github/workflows/scrape-weedmaps.yml` — only it runs locally instead of on a walled runner.

## How it works

- **`scripts/setup-weedmaps-task.ps1`** (run once) creates a dedicated **git worktree** at
  `~\Dev\Happy-weedmaps-ingest` **detached at `origin/master`** (detached, not a `master` branch
  checkout, so your main `Happy` checkout can still `git checkout master`), installs server deps
  there, and registers a daily Windows Scheduled Task.
- **`scripts/scrape-weedmaps-local.ps1`** (the task target, also runnable by hand) **hard-resets the
  worktree to `origin/master`** (a guaranteed-clean base) → runs the scrape → if `products.json`
  changed, commits that **one file** with `[skip ci]` and pushes to `master`.

The worktree is isolated from your main `Happy` checkout, so the nightly job never collides with
whatever branch/edits you have in progress. The hard-reset-to-`origin/master` base means the
worktree can never be left mid-rebase: a push that races a concurrent commit-back is retried once,
and if that conflicts the run is skipped and simply re-accrues next run (no stranded commit, no
silent dataset truncation). `[skip ci]` suppresses all GitHub Actions on the commit; Render still
redeploys and serves the refreshed file.

> **The task runs as you, only while you are logged on.** `-StartWhenAvailable` covers a PC that
> was off/asleep at the trigger (it runs at next wake), but if the machine is on with your account
> *logged off*, the run waits until you next log on. For a personal desktop that's normally fine;
> for true logged-off operation, re-register the task with stored credentials.

## One-time setup

From your main `Happy` checkout (must be on a residential network):

```powershell
pwsh -NoProfile -File scripts/setup-weedmaps-task.ps1
```

Options: `-WorktreePath <path>` (default `~\Dev\Happy-weedmaps-ingest`), `-TaskTime HH:mm`
(default `03:30`), `-TaskName <name>` (default `GmaS Weedmaps Ingest`). Add `-WhatIf` to preview
the worktree/install/task actions without making changes. Safe to re-run (idempotent: it prunes
stale worktree metadata, skips an existing worktree / `node_modules`, and replaces the task).

> Prerequisites: Node + npm and Git on PATH (the runner re-checks this each run and aborts loudly
> into its log if missing — relevant because a Scheduled-Task token can have a leaner PATH).

## Verify

```powershell
# Run the scrape immediately (from a residential IP)
pwsh -NoProfile -File scripts/scrape-weedmaps-local.ps1

# Confirm the refresh commit landed
git -C ..\Happy-weedmaps-ingest log --oneline -1 server/data/products.json

# Confirm the scheduled task exists
Get-ScheduledTask -TaskName 'GmaS Weedmaps Ingest'
```

Expected: per-store counts in the log; on change a `chore(data): refresh weedmaps product prices
[skip ci]` commit pushes to `master`; on a full block/offline run, `products.json unchanged —
nothing to commit` and exit 0 (never an error). Logs, the run-lock, and a `last-success.txt`
heartbeat (touched whenever the scrape itself succeeds) live under
`..\Happy-weedmaps-ingest\.weedmaps-ingest\` and are never committed. **To spot a silent stall,
check that `last-success.txt` is recent** — a stale timestamp means the scrape has been failing
(e.g. the residential IP also started getting 406, or Node/git fell off PATH).

## Remove

```powershell
Unregister-ScheduledTask -TaskName 'GmaS Weedmaps Ingest' -Confirm:$false
git -C . worktree remove ..\Happy-weedmaps-ingest
```

## Do NOT enable the GitHub Actions schedule

`.github/workflows/scrape-weedmaps.yml` keeps its `schedule:` disabled on purpose — the runner's
datacenter IP would 406 nightly. `workflow_dispatch` is kept only to re-probe the runner IP in the
future. This residential runner is the supported accrual path.
