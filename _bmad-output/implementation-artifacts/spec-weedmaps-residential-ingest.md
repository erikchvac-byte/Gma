---
title: 'Weedmaps residential-IP ingestion (AI-search Phase 3 accrual)'
type: 'feature'
created: '2026-06-29'
status: 'done'
context: []
baseline_commit: 'd07f52edce5c5a49f6e6cc61d1844f8741b3cedf'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Phase 3 (CAP-6 accrual) cannot run for Weedmaps because GitHub-Actions/datacenter IPs are HTTP-406-walled by Weedmaps (confirmed 2026-06-29: 44/44 blocked); the same fetch returns 200 from Erik's residential IP. The durable product store is the committed `server/data/products.json` (Render disk is ephemeral), so accrual must be driven from a residential machine. Today there is no committed mechanism to do that — the working runner exists but nothing schedules, commits, or pushes it locally.

**Approach:** Add a committed PowerShell runner that executes the existing `scrapeWeedmapsRun.ts` from Erik's home IP inside a **dedicated git worktree pinned to master** (so it never disturbs Erik's working checkout), then commits `products.json` with `[skip ci]` and pushes to master — mirroring the existing Dutchie/Actions commit-back exactly. Add a one-time setup script that creates the worktree, installs server deps, and registers a Windows Task Scheduler nightly job. Manual invocation stays available.

## Boundaries & Constraints

**Always:** Operate only inside the dedicated worktree, never Erik's main `Happy` checkout. `git add` ONLY `server/data/products.json` — never `-A`. Commit message carries `[skip ci]`. Fail-soft: any per-store 406/network error contributes 0 records and never aborts other stores or the commit of whatever was captured. Commit/push ONLY when `products.json` actually changed. Keep the existing ≥2s jittered throttle (do not add a faster cadence). Reuse `scrapeWeedmapsRun.ts` and the registry unchanged.

**Ask First:** Changing the push target away from master; enabling the disabled `scrape-weedmaps.yml` cron; altering scrape cadence below nightly or throttle below the gate-validated values.

**Never:** Modify `scrapeWeedmapsRun.ts`, the scraper registry, `normalizeProduct`, or `persistProductObservations`. Enable the GH-Actions `schedule:` (datacenter IP stays 406-walled). Commit `node_modules`, logs, or any file other than `products.json`. Run the scrape against Erik's working checkout/branch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Residential IP, stores return JSON | Observations appended; `products.json` changed → commit `[skip ci]` + push master | N/A |
| Full block / offline | All stores 406 or no network | 0 records, `products.json` unchanged → no commit, exit 0 (not an error) | Logged, soft |
| Partial block | Some stores 406 | Captured stores appended; file changed → committed | Per-store error logged, soft |
| Push conflict | Concurrent commit on master | `git pull --rebase --autostash` then push; retry once | Persistent fail → warn, leave commit for next run |
| Overlapping run | Previous run still active | Lock file present → skip this invocation, exit 0 | Stale-lock note logged |
| Erik mid-edit | Main checkout dirty on a feature branch | Worktree is isolated → run unaffected | N/A |

</frozen-after-approval>

## Code Map

- `scripts/scrape-weedmaps-local.ps1` -- NEW. Residential runner: worktree pull → scrape → conditional commit `[skip ci]` + push master (retry once); lock file + timestamped log.
- `scripts/setup-weedmaps-task.ps1` -- NEW. Idempotent one-time setup: `git worktree add` (master-pinned, default `..\Happy-weedmaps-ingest`), `npm install` in its `server/`, register nightly Task Scheduler job.
- `server/scripts/scrapeWeedmapsRun.ts` -- REUSED UNCHANGED. fetch→normalize→append runner the PS script calls.
- `.github/workflows/scrape-weedmaps.yml` -- EDIT header comment to name the new scripts; leave `schedule:` disabled.
- `docs/weedmaps-residential-ingest.md` -- NEW. Operator runbook (setup, verify, remove).
- `ADR.md` -- EDIT. ADR for residential-IP worktree commit-back.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/scrape-weedmaps-local.ps1` -- implement runner (worktree pull → scrape → conditional commit `[skip ci]` + push with one retry → lock + log) -- the core accrual mechanism
- [x] `scripts/setup-weedmaps-task.ps1` -- implement idempotent one-time setup (worktree add, server npm install, register nightly Task Scheduler job) -- makes accrual unattended
- [x] `docs/weedmaps-residential-ingest.md` -- write operator runbook (setup, verify, remove) -- so the mechanism is reproducible
- [x] `.github/workflows/scrape-weedmaps.yml` -- update header comment to reference the new scripts; leave `schedule:` disabled -- keep the canonical pointer accurate
- [x] `ADR.md` -- record the decision -- preserve rationale per project ADR rule

**Acceptance Criteria:**
- Given a clean worktree on master, when `scrape-weedmaps-local.ps1` runs from a residential IP and at least one store returns products, then `products.json` gains a timestamped observation set and is committed `[skip ci]` and pushed to master.
- Given the scrape returns 0 records (full block/offline), when the runner finishes, then no commit is made and the script exits 0 without error.
- Given Erik's main `Happy` checkout is dirty on a feature branch, when the scheduled job fires, then the run completes in the isolated worktree and Erik's checkout and branch are untouched.
- Given `setup-weedmaps-task.ps1` is run twice, when the second run executes, then it does not error or duplicate the worktree/task (idempotent).
- Given the runner pushes `products.json` to master, when CI evaluates the commit, then no GitHub Actions workflow runs (suppressed by `[skip ci]`).

## Spec Change Log

- **2026-06-29 (step-04 review hardening, patches — no frozen-intent change):** A 3-reviewer parallel pass (blind/edge/acceptance; acceptance = ACCEPT, all ACs/boundaries pass, scrape core untouched) surfaced one catastrophic and several operational defects in the runner, all fixed as patches. **Triggering findings → fixes:** (1) in-place `pull --rebase` on the shared `products.json` could wedge the worktree mid-rebase → fail-soft `readProducts` truncates the dataset to empty → **replaced step-1 with `fetch` + `reset --hard origin/master`** clean base; push-retry rebase conflict is aborted + skipped. (2) stranded unpushed commit → dissolved (clean-base reset never strands). (3) git/node/npx off Scheduled-Task PATH → preflight check aborts loudly. (4) worktree owning `master` blocks main checkout → `worktree add --detach origin/master`. (5) dead-PID lock inside stale window → PID-liveness check + stale threshold lowered to 45m (> 30m exec limit). (6) deleted-but-registered worktree → `worktree prune` + targeted stray-dir error. (7) trailing-backslash path → `TrimEnd('\')`. Added `last-success.txt` heartbeat for stall detection. **KEEP (survive any re-derivation):** scrape core (`scrapeWeedmapsRun.ts`/registry/`normalizeProduct`/`persistProductObservations`) stays byte-unchanged; commit stages ONLY `products.json` with literal `[skip ci]`; GH `schedule:` stays disabled; ASCII-only PS source (PS-5.1 BOM-less files are read as ANSI — non-ASCII punctuation breaks `powershell.exe -File` at runtime).

## Design Notes

Runner discipline (a worktree, not Erik's checkout and not a fresh clone per run, so server deps install once and the scrape can never collide with active development): preflight git/node/npx on PATH → acquire lock (dead-PID + stale-age aware) → **`git fetch` + `git reset --hard origin/master`** (guaranteed-clean base) → `npx tsx scripts/scrapeWeedmapsRun.ts` (cwd `$wt\server`) → only if `git status --porcelain -- server/data/products.json` is non-empty, `git add` that one file, commit `…[skip ci]`, push master; a raced push is retried once on a rebased base, and a products.json **rebase conflict is aborted + the run skipped** (re-accrues next run) → release lock in `finally`.

**Why hard-reset, not pull --rebase in place** (the load-bearing review finding): the Dutchie cron also commits `products.json`, so an in-place `pull --rebase` can conflict and leave the worktree mid-rebase; `productsStore.readProducts` is fail-soft and would parse the conflict-markered file as **empty, truncating the whole dataset**. Resetting to `origin/master` every run makes that state unreachable and never strands a commit. The worktree is created **detached** at `origin/master` so the main checkout can still `git checkout master`. The `[skip ci]` + products.json-only discipline is identical to `scrape-weedmaps.yml`'s commit-back step — that file is the reference.

## Verification

**Commands:**
- `pwsh -NoProfile -File scripts/scrape-weedmaps-local.ps1` (after setup, residential IP) -- expected: log shows per-store counts; on change a `[skip ci]` commit pushes to master; on full block "nothing to commit" + exit 0.
- `git -C ..\Happy-weedmaps-ingest log --oneline -1 server/data/products.json` -- expected: latest commit is the weedmaps refresh after a successful run.

**Manual checks:**
- `Get-ScheduledTask -TaskName *weedmaps*` after setup -- a registered nightly task pointing at the runner.
- Erik's main `Happy` branch/tree unchanged after a scheduled run.

## Suggested Review Order

**The accrual mechanism (the core — start here)**

- Entry point: the clean-base reset that makes a rebase-wedge / dataset-truncation unreachable (the load-bearing review fix)
  [`scrape-weedmaps-local.ps1:88`](../../scripts/scrape-weedmaps-local.ps1#L88)

- Push with one conflict-safe retry; a products.json rebase conflict is aborted + skipped (re-accrues next run)
  [`scrape-weedmaps-local.ps1:120`](../../scripts/scrape-weedmaps-local.ps1#L120)

- Single-instance lock, PID-liveness + stale-age aware (prevents both overlap and dead-PID skip)
  [`scrape-weedmaps-local.ps1:71`](../../scripts/scrape-weedmaps-local.ps1#L71)

- PATH preflight — fails loudly into the log instead of dying silently under a lean Scheduled-Task token
  [`scrape-weedmaps-local.ps1:62`](../../scripts/scrape-weedmaps-local.ps1#L62)

**Unattended setup (one-time)**

- Worktree created DETACHED at origin/master so the main checkout can still `git checkout master`
  [`setup-weedmaps-task.ps1:47`](../../scripts/setup-weedmaps-task.ps1#L47)

- Nightly Scheduled Task registration (idempotent via -Force, StartWhenAvailable)
  [`setup-weedmaps-task.ps1:70`](../../scripts/setup-weedmaps-task.ps1#L70)

**Canonical pointers & rationale (no behavior change)**

- Workflow header: confirmed-406 + DO-NOT-ENABLE hardening restored to master, now points at the runner
  [`scrape-weedmaps.yml:12`](../../.github/workflows/scrape-weedmaps.yml#L12)

- ADR-064 — full decision + the rebase-safety rationale the review surfaced
  [`ADR.md:600`](../../ADR.md#L600)

- Operator runbook (setup / verify / remove / heartbeat-stall check)
  [`weedmaps-residential-ingest.md`](../../docs/weedmaps-residential-ingest.md)
