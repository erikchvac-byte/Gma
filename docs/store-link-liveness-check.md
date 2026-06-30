# Store-card link-liveness check (residential nightly)

Nightly verification that every store card's link (`Dispensary.url`) still resolves, run from a
**residential IP** because Dutchie — like Weedmaps — 403-walls datacenter / GitHub-Actions IPs, so
CI cannot tell a real 404 from the bot-wall. From a home IP the HTTP status codes are truthful.

This is the scheduling layer on top of the ADR-068 guard (`server/scripts/checkStoreLinks.ts`),
which was built and tested but deliberately left off-CI and unscheduled until now (ADR-069). It is
the **read-only** sibling of the ADR-064 Weedmaps residential runner — it never commits or pushes.

## What it checks

By default it probes the **live production feed** (`https://gmaslist.com/api/data`) — the actual
links users click — not the committed seed, so a link that dies *after* deploy is still caught.
The guard GETs each `url` and classifies: `200–399 = ok`, `404/410 = broken` (the only thing that
alerts), `403/429/5xx/transport-error = unknown` (bot-wall / throttle / transient — never alerts).

## How it works

- **`scripts/setup-check-store-links-task.ps1`** (run once) creates a dedicated **git worktree** at
  `~\Dev\Happy-linkcheck` **detached at `origin/master`**, installs server deps there, and registers
  a daily Windows Scheduled Task (default **04:30**, after the 03:30 Weedmaps task).
- **`scripts/check-store-links-local.ps1`** (the task target, also runnable by hand) **hard-resets
  the worktree to `origin/master`** (so it always runs the committed, known-good guard) → runs the
  guard against the live feed → on a dead link, raises an alert.

The worktree is isolated from your main `Happy` checkout, so the nightly job never runs your WIP and
never collides with whatever branch/edits you have in progress.

### Alerting

A silent check is useless, so on a dead link the runner:

1. Writes a persistent **`LINK-ALERT.txt`** under `~\Dev\Happy-linkcheck\.linkcheck\` (the durable
   signal — it stays until the next clean run clears it) with the dead store id(s) and a fix pointer.
2. Raises a **best-effort Windows toast / tray balloon** (BurntToast if installed, else a balloon).
   Only shows while you are logged on; failure is swallowed — the file is the source of truth.
3. Logs the verdict lines to the dated log.

It distinguishes a real **dead link** (`404/410`) from a run that simply **could not complete**
(live feed unreachable, etc.) so a transient site blip is not mistaken for a broken link.

On a clean run it touches a **`last-success.txt`** heartbeat — a stale timestamp means the check
has been failing silently (PATH lost, site unreachable for days).

> The runner exits 0 even when it finds a dead link: a failed Scheduled-Task *result code* is
> invisible day-to-day, so the alert is the file + toast, not the exit code.

> **The task runs as you, only while you are logged on.** `-StartWhenAvailable` covers a PC that was
> off/asleep at the trigger (runs at next wake); if the machine is on but your account is *logged
> off*, the run waits until you next log on. Fine for a personal desktop.

## One-time setup

From your main `Happy` checkout (must be on a residential network):

```powershell
pwsh -NoProfile -File scripts/setup-check-store-links-task.ps1
```

Options: `-WorktreePath <path>` (default `~\Dev\Happy-linkcheck`), `-TaskTime HH:mm` (default
`04:30`), `-TaskName <name>` (default `GmaS Store Link Check`). Add `-WhatIf` to preview without
making changes. Safe to re-run (idempotent: prunes stale worktree metadata, skips an existing
worktree / `node_modules`, replaces the task).

> Prerequisites: Node + npm and Git on PATH (the runner re-checks each run and aborts loudly into
> its log if missing — a Scheduled-Task token can have a leaner PATH).

## Verify

```powershell
# Run the check immediately (from a residential IP)
pwsh -NoProfile -File scripts/check-store-links-local.ps1

# Confirm the scheduled task exists
Get-ScheduledTask -TaskName 'GmaS Store Link Check'
```

Expected: a `[checkStoreLinks] <verdict> <store> <status>` line per store, then
`ok — no dead links` and a refreshed `last-success.txt`. If a link is dead you'll get a toast and a
`LINK-ALERT.txt`. To check the committed seed instead of live: pass `-DataUrl ''`.

Logs, the run-lock, `last-success.txt`, and any `LINK-ALERT.txt` live under
`~\Dev\Happy-linkcheck\.linkcheck\` and are never committed.

## Fixing a dead link

See ADR-068 / `feedback_store-link-method`: repoint the store's `url` to its live own-site page
(own-site first; a Dutchie slug only when verified live), commit, and re-run the check to confirm.

## Remove

```powershell
Unregister-ScheduledTask -TaskName 'GmaS Store Link Check' -Confirm:$false
git -C . worktree remove ..\Happy-linkcheck
```
