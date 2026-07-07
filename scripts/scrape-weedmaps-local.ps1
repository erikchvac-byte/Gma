#Requires -Version 5.1
<#
.SYNOPSIS
  Residential-IP Weedmaps product-price accrual -- appends observations into the LOCAL products.db
  (ADR-077 Phase 1). No git commit: the raw dataset left git for local SQLite.

.DESCRIPTION
  GitHub-Actions/datacenter IPs are HTTP-406-walled by Weedmaps (44/44 blocked); the same fetch
  returns 200 from a residential IP, so accrual must run from a home IP. ADR-077 moved the durable
  raw store OUT of git into a local SQLite DB (PRODUCTS_DB_PATH, default ~\GmaS-data\products.db),
  OUTSIDE any worktree so a `git reset --hard` can never wipe accrued history. This runner
  hard-resets a DEDICATED worktree to origin/master (fresh scraper code + store registry), then runs
  the UNCHANGED scrapeWeedmapsRun.ts with PRODUCTS_DB_PATH set so its main() appends straight into
  the DB (append-only, idempotent). Nothing is committed here -- the small DERIVED facts are produced
  and pushed separately by derive-facts-local.ps1.

  It operates ONLY inside the worktree (default ~\Dev\Happy-weedmaps-ingest), never your main checkout.

.NOTES
  Manual run:  pwsh -NoProfile -File scripts/scrape-weedmaps-local.ps1
  See docs/products-local-sqlite-ingest.md.
#>
[CmdletBinding()]
param(
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-weedmaps-ingest'),
    # The durable local store, OUTSIDE the worktree (shared with the Dutchie feeder + derive runner).
    [string]$DbPath = (Join-Path $HOME 'GmaS-data\products.db'),
    [int]$StaleLockMinutes = 45
)

$ErrorActionPreference = 'Stop'

$WorktreePath = $WorktreePath.TrimEnd('\', '/')
$serverDir   = Join-Path $WorktreePath 'server'
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
$dbDir = Split-Path -Parent $DbPath
if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory -Path $dbDir | Out-Null }

# Preflight: a Scheduled-Task token may have a leaner PATH than an interactive shell. Fail LOUDLY.
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
    Write-Log "=== weedmaps residential ingest start (worktree: $WorktreePath, db: $DbPath) ==="

    # 1. Reconcile the worktree to a GUARANTEED-CLEAN origin/master base so we always run the latest
    #    scraper code + store registry. The external DbPath is untouched by this reset.
    git -C $WorktreePath fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR: git fetch failed -- aborting run'; exit 1 }
    git -C $WorktreePath rebase --abort  # no-op if no rebase in progress
    git -C $WorktreePath reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: reset to origin/master failed (exit $LASTEXITCODE) -- aborting run"; exit 1 }

    # 2. Scrape straight into the local DB (PRODUCTS_DB_PATH). Fail-soft: a per-store 406/network
    #    error returns non-zero but may still have appended partial records to the DB.
    Push-Location $serverDir
    try {
        $env:PRODUCTS_DB_PATH = $DbPath
        npx tsx scripts/scrapeWeedmapsRun.ts
        $scrapeExit = $LASTEXITCODE
    } finally { Pop-Location }
    Write-Log "scrape exit code: $scrapeExit"
    if ($scrapeExit -eq 0) {
        Write-Log 'weedmaps accrual appended to products.db'
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
    } else {
        Write-Log 'WARN: scrape reported errors (partial/total) -- whatever was captured is already in the DB'
    }
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== weedmaps residential ingest end ==='
}
