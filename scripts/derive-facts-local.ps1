#Requires -Version 5.1
<#
.SYNOPSIS
  ADR-077 Phase 1 -- local derivation runner. Reads the home-machine products.db, precomputes the
  small DERIVED fact files, and commits ONLY those back to master. Render serves them; the raw DB
  never leaves this machine.

.DESCRIPTION
  The raw longitudinal product dataset left git (it was the 18MB+ file-size wall) and now lives in a
  local SQLite DB, PRODUCTS_DB_PATH (default ~\GmaS-data\products.db), OUTSIDE any git worktree so a
  `git reset --hard` can never wipe accrued history. This runner mirrors scrape-weedmaps-local.ps1's
  proven git dance: it hard-resets a DEDICATED worktree to origin/master (a guaranteed-clean base, so
  it can NEVER be left mid-rebase with conflicted files), runs the UNCHANGED pure derivation
  functions via deriveFactsRun.ts (honesty gates 1-5 / EXCLUDED_FLAGS / fix6 all run inside them),
  and -- only if the derived files actually changed -- commits server/data/derived/*.json with
  [skip ci] and pushes to master. [skip ci] suppresses all Actions on the commit; Render still
  redeploys the fresh facts.

  THE LOAD-BEARING RULE: this runs on the home machine; Render only ever reads the committed derived
  JSON. If this machine is off, the site keeps serving the last-pushed facts -- only fresh derivation
  pauses. It operates ONLY inside the worktree (default ~\Dev\Happy-ingest), never your main checkout.

.NOTES
  Prereq: the DB must be populated -- run the scrape feeders (scrape-dutchie-local.ps1 /
  scrape-weedmaps-local.ps1) first, or the one-time importProductsToSqlite.ts migration.
  Manual run:  pwsh -NoProfile -File scripts/derive-facts-local.ps1
  See docs/products-local-sqlite-ingest.md.
#>
[CmdletBinding()]
param(
    # Dedicated worktree the derivation runs in (shared with the scrape feeders).
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-ingest'),
    # The durable local product store, OUTSIDE the worktree so a hard-reset can never touch it.
    [string]$DbPath = (Join-Path $HOME 'GmaS-data\products.db'),
    # A lock older than this (minutes) is treated as stale and overridden.
    [int]$StaleLockMinutes = 30
)

$ErrorActionPreference = 'Stop'

$WorktreePath = $WorktreePath.TrimEnd('\', '/')
$serverDir    = Join-Path $WorktreePath 'server'
# Commit EVERY derived artifact deriveFactsRun.ts writes, listed EXPLICITLY (never a glob) so a
# transient atomicWrite *.tmp.json is never captured, and never `git add -A`. This list must stay in
# lock-step with the writes in deriveFactsRun.ts -- it originally held only the two ROUTED facts
# (disparities, deal-scope), which silently stranded the six facts stories 1.2.5-1.7 added: the
# runner wrote them, this step didn't commit them, and the next run's `git reset --hard` wiped them,
# so they never republished (disparity-rollups is even route-served). Any NEW derived artifact a
# future story adds MUST be appended here too.
$derivedFiles = @(
    'server/data/derived/disparities.json',
    'server/data/derived/deal-scope.json',
    'server/data/derived/extraction-health.json',
    'server/data/derived/special-events.json',
    'server/data/derived/disparity-rollups.json',
    'server/data/derived/brand-personas.json',
    'server/data/derived/brand-store-matrix.json',
    'server/data/derived/new-arrival-dormancy.json',
    'server/data/derived/price-vs-own-median.json',
    'server/data/derived/cheapest-delivered.json'
)
$logDir       = Join-Path $WorktreePath '.derive-ingest'
$lockFile     = Join-Path $logDir 'run.lock'
$logFile      = Join-Path $logDir ('derive-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
$heartbeat    = Join-Path $logDir 'last-success.txt'

function Write-Log([string]$msg) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    if (Test-Path $logDir) { Add-Content -Path $logFile -Value $line -Encoding utf8 }
}

# --- preconditions ---
if (-not (Test-Path $serverDir)) {
    Write-Error "Worktree not found at '$WorktreePath'. Create it first (see docs/products-local-sqlite-ingest.md)."
    exit 1
}
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
if (-not (Test-Path $DbPath)) {
    Write-Log "ERROR: products DB not found at '$DbPath' -- run the scrape feeders / importer first. Aborting."
    exit 1
}

foreach ($cmd in 'git', 'node', 'npx') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Log "ERROR: '$cmd' is not on PATH for this run -- aborting (check the Scheduled Task's PATH)"
        exit 1
    }
}

# --- single-instance lock ---
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
    Write-Log "=== derive-facts local run start (worktree: $WorktreePath, db: $DbPath) ==="

    # 1. Reconcile the worktree to a GUARANTEED-CLEAN origin/master base (see weedmaps runner note:
    #    a conflict-markered file read as empty would corrupt the derived output).
    git -C $WorktreePath fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR: git fetch failed -- aborting run'; exit 1 }
    git -C $WorktreePath rebase --abort  # no-op if no rebase in progress
    git -C $WorktreePath reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: reset to origin/master failed (exit $LASTEXITCODE) -- aborting run"; exit 1 }

    # 2. Derive. Reads the EXTERNAL DbPath (never a file inside the worktree), writes the derived
    #    JSON into the worktree's server/data/derived/.
    Push-Location $serverDir
    try {
        $env:PRODUCTS_DB_PATH = $DbPath
        npx tsx scripts/deriveFactsRun.ts
        $deriveExit = $LASTEXITCODE
    } finally { Pop-Location }
    Write-Log "derive exit code: $deriveExit"
    if ($deriveExit -ne 0) { Write-Log 'ERROR: derivation failed -- not committing' ; exit 1 }

    # 3. Commit ONLY the derived files, and ONLY if they changed.
    $changed = git -C $WorktreePath status --porcelain -- $derivedFiles
    if ([string]::IsNullOrWhiteSpace($changed)) {
        Write-Log 'derived facts unchanged -- nothing to commit'
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
        exit 0
    }
    git -C $WorktreePath add -- $derivedFiles
    git -C $WorktreePath commit -m 'chore(data): refresh derived value facts [skip ci]'
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: commit failed (exit $LASTEXITCODE)"; exit 1 }
    Write-Log 'committed refreshed derived facts'

    # 4. Push, with one retry on a freshly-rebased base (mirrors the weedmaps runner).
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
            Write-Log 'WARN: rebase conflict -- skipping this run; it will re-derive next run'
        } else {
            git -C $WorktreePath push origin HEAD:master
            if ($LASTEXITCODE -eq 0) { $pushed = $true }
        }
    }

    if ($pushed) {
        Write-Log 'pushed to master -- derived facts refreshed (Render will redeploy)'
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
    } else {
        Write-Log 'WARN: push not completed this run -- no data lost; next run reconciles and re-derives'
    }
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== derive-facts local run end ==='
}
