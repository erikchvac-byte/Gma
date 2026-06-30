#Requires -Version 5.1
<#
.SYNOPSIS
  AI-search Phase 3 -- residential-IP Weedmaps product-price accrual (commit-back to master).

.DESCRIPTION
  GitHub-Actions/datacenter IPs are HTTP-406-walled by Weedmaps (confirmed 2026-06-29: 44/44
  blocked); the same fetch returns 200 from a residential IP. The durable product store is the
  committed server/data/products.json (Render's disk is ephemeral), so accrual must run from a
  home IP. This runner mirrors the .github/workflows/scrape-weedmaps.yml commit-back step, but
  locally: it hard-resets a DEDICATED git worktree to origin/master (a guaranteed-clean base, so
  it can NEVER be left mid-rebase with a conflicted products.json), runs the unchanged
  scrapeWeedmapsRun.ts, and -- only if products.json actually changed -- commits that ONE file
  with [skip ci] and pushes to master. [skip ci] suppresses all GitHub Actions on the commit;
  Render still redeploys the fresh file.

  It operates ONLY inside the worktree (default ~\Dev\Happy-weedmaps-ingest), never your main
  Happy checkout, so a scheduled run can never collide with active development on any branch.

  Concurrency: the worktree only ever holds one throwaway scrape commit, reset to origin/master
  at the start of every run. A push that races a concurrent commit-back is retried once on a
  rebased base; if that conflicts on products.json, the run is skipped and simply re-accrues next
  run (a missed nightly snapshot is immaterial to multi-week trendlines). No stranded commit ever
  persists, so the dataset can never be silently truncated.

.NOTES
  Set up once with scripts/setup-weedmaps-task.ps1 (creates the worktree + nightly task).
  Manual run:  pwsh -NoProfile -File scripts/scrape-weedmaps-local.ps1
#>
[CmdletBinding()]
param(
    # The dedicated worktree the scrape runs in. Default matches setup's default.
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-weedmaps-ingest'),
    # A lock older than this (minutes) is treated as stale and overridden. Must exceed the task's
    # ExecutionTimeLimit (30m in setup) so a still-running instance is never wrongly overridden.
    [int]$StaleLockMinutes = 45
)

$ErrorActionPreference = 'Stop'

$WorktreePath = $WorktreePath.TrimEnd('\', '/')
$serverDir   = Join-Path $WorktreePath 'server'
$productsRel  = 'server/data/products.json'
$logDir       = Join-Path $WorktreePath '.weedmaps-ingest'
$lockFile     = Join-Path $logDir 'run.lock'
$logFile      = Join-Path $logDir ('ingest-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
$heartbeat    = Join-Path $logDir 'last-success.txt'

function Write-Log([string]$msg) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    if (Test-Path $logDir) { Add-Content -Path $logFile -Value $line -Encoding utf8 }
}

# --- preconditions ---
if (-not (Test-Path $serverDir)) {
    Write-Error "Worktree not found at '$WorktreePath'. Run scripts/setup-weedmaps-task.ps1 first."
    exit 1
}
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Preflight: a Scheduled-Task token may have a leaner PATH than an interactive shell. Fail LOUDLY
# (visible in the log) rather than dying with a cryptic terminating error every silent night.
foreach ($cmd in 'git', 'node', 'npx') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Log "ERROR: '$cmd' is not on PATH for this run -- aborting (check the Scheduled Task's PATH)"
        exit 1
    }
}

# --- single-instance lock (nightly task must never overlap itself) ---
if (Test-Path $lockFile) {
    $age      = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    $heldPid  = (Get-Content $lockFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $pidAlive = $false
    if ($heldPid -match '^\d+$') { $pidAlive = [bool](Get-Process -Id $heldPid -ErrorAction SilentlyContinue) }
    if ($pidAlive -and $age.TotalMinutes -lt $StaleLockMinutes) {
        Write-Log ('another run is active (pid {0}, lock age {1}m) -- skipping' -f $heldPid, [int]$age.TotalMinutes)
        exit 0
    }
    Write-Log ('overriding lock (pid {0} alive={1}, age {2}m)' -f $heldPid, $pidAlive, [int]$age.TotalMinutes)
}
Set-Content -Path $lockFile -Value $PID -Encoding utf8

try {
    Write-Log "=== weedmaps residential ingest start (worktree: $WorktreePath) ==="

    # 1. Reconcile the worktree to a GUARANTEED-CLEAN origin/master base. A defensive rebase-abort
    #    clears any leftover in-progress rebase from a prior crash; the hard reset then discards any
    #    un-pushed throwaway commit and any local edit, so we never scrape onto a stale/conflicted
    #    tree (a conflict-markered products.json would be read as empty and truncate the dataset).
    git -C $WorktreePath fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR: git fetch failed -- aborting run'; exit 1 }
    git -C $WorktreePath rebase --abort  # no-op (non-zero, prints to stderr) if no rebase in progress
    git -C $WorktreePath reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: reset to origin/master failed (exit $LASTEXITCODE) -- aborting run"; exit 1 }

    # 2. Scrape. Fail-soft: a per-store 406/network error returns a non-zero exit but may still
    #    have appended partial records -- never abort the commit of whatever WAS captured.
    Push-Location $serverDir
    try {
        npx tsx scripts/scrapeWeedmapsRun.ts
        $scrapeExit = $LASTEXITCODE
    } finally { Pop-Location }
    Write-Log "scrape exit code: $scrapeExit"
    if ($scrapeExit -ne 0) { Write-Log 'WARN: scrape reported errors (partial/total) -- committing whatever was captured' }

    # 3. Commit ONLY products.json, and ONLY if it changed (full block / offline => unchanged).
    $changed = git -C $WorktreePath status --porcelain -- $productsRel
    if ([string]::IsNullOrWhiteSpace($changed)) {
        Write-Log 'products.json unchanged -- nothing to commit'
        if ($scrapeExit -eq 0) { Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8 }
        exit 0
    }
    git -C $WorktreePath add -- $productsRel
    git -C $WorktreePath commit -m 'chore(data): refresh weedmaps product prices [skip ci]'
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: commit failed (exit $LASTEXITCODE)"; exit 1 }
    Write-Log 'committed refreshed products.json'

    # 4. Push, with one retry on a freshly-rebased base. If the rebase conflicts (a concurrent
    #    commit-back also touched products.json), abort it cleanly and skip -- next run re-accrues.
    $pushed = $false
    git -C $WorktreePath push origin HEAD:master
    if ($LASTEXITCODE -eq 0) {
        $pushed = $true
    } else {
        Write-Log 'push rejected (origin advanced) -- rebasing onto origin/master and retrying once'
        git -C $WorktreePath fetch origin
        git -C $WorktreePath rebase origin/master
        if ($LASTEXITCODE -ne 0) {
            git -C $WorktreePath rebase --abort
            Write-Log 'WARN: rebase conflict on products.json -- skipping this run; it will re-accrue next run'
        } else {
            git -C $WorktreePath push origin HEAD:master
            if ($LASTEXITCODE -eq 0) { $pushed = $true }
        }
    }

    if ($pushed) {
        Write-Log 'pushed to master -- accrual landed'
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
    } else {
        Write-Log 'WARN: push not completed this run -- no data lost; next run reconciles and re-accrues'
    }
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== weedmaps residential ingest end ==='
}
