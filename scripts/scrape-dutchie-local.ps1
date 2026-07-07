#Requires -Version 5.1
<#
.SYNOPSIS
  Local Dutchie product-price accrual -- boots the vendored Python scraper-svc and appends
  observations into the LOCAL products.db (ADR-077 Phase 1 AC7: Dutchie moved fully local).

.DESCRIPTION
  ADR-077 moved Dutchie product accrual off GitHub Actions and onto the home machine: the Actions
  scrape-products.yml commit-back of the raw products.json was retired (it was feeding the file-size
  wall). This runner mirrors the CI boot sequence locally -- start the stealth-browser scraper-svc
  (uvicorn on 127.0.0.1:8000), health-check it, then run the UNCHANGED scrapeProductsRun.ts with
  PRODUCTS_DB_PATH set so its main() appends straight into the DB. Nothing is committed; the small
  DERIVED facts are produced + pushed separately by derive-facts-local.ps1.

  PREREQ (one-time, in scraper-svc): pip install -r requirements.txt ; python -m playwright install chromium

  It operates ONLY inside the worktree (default ~\Dev\Happy-dutchie-ingest), never your main checkout.

.NOTES
  Manual run:  pwsh -NoProfile -File scripts/scrape-dutchie-local.ps1
  See docs/products-local-sqlite-ingest.md.
#>
[CmdletBinding()]
param(
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-dutchie-ingest'),
    [string]$DbPath = (Join-Path $HOME 'GmaS-data\products.db'),
    [int]$Port = 8000,
    [int]$StaleLockMinutes = 60
)

$ErrorActionPreference = 'Stop'

$WorktreePath = $WorktreePath.TrimEnd('\', '/')
$serverDir    = Join-Path $WorktreePath 'server'
$scraperDir   = Join-Path $WorktreePath 'scraper-svc'
$logDir       = Join-Path $WorktreePath '.dutchie-ingest'
$lockFile     = Join-Path $logDir 'run.lock'
$logFile      = Join-Path $logDir ('ingest-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
$uvicornLog   = Join-Path $logDir 'uvicorn.log'
$uvicornErr   = Join-Path $logDir 'uvicorn.err.log'
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
if (-not (Test-Path $scraperDir)) { Write-Error "scraper-svc not found at '$scraperDir'."; exit 1 }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$dbDir = Split-Path -Parent $DbPath
if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory -Path $dbDir | Out-Null }

foreach ($cmd in 'git', 'node', 'npx', 'python') {
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

$uvicorn = $null
try {
    Write-Log "=== dutchie local ingest start (worktree: $WorktreePath, db: $DbPath) ==="

    # 1. Clean origin/master base (fresh scraper code + store registry). External DbPath untouched.
    git -C $WorktreePath fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR: git fetch failed -- aborting run'; exit 1 }
    git -C $WorktreePath rebase --abort  # no-op if none in progress
    git -C $WorktreePath reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: reset to origin/master failed (exit $LASTEXITCODE)"; exit 1 }

    # 2. Boot the scraper service (background) and wait for /health.
    $uvicorn = Start-Process -FilePath 'python' `
        -ArgumentList @('-m', 'uvicorn', 'api.server:app', '--host', '127.0.0.1', '--port', "$Port") `
        -WorkingDirectory $scraperDir -PassThru -NoNewWindow -RedirectStandardError $uvicornErr -RedirectStandardOutput $uvicornLog
    $healthy = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
    }
    if (-not $healthy) {
        Write-Log 'ERROR: scraper-svc failed to become healthy -- aborting'
        Write-Log '--- uvicorn.log ---'
        if (Test-Path $uvicornLog) { Get-Content $uvicornLog | ForEach-Object { Write-Log $_ } }
        Write-Log '--- uvicorn.err.log ---'
        if (Test-Path $uvicornErr) { Get-Content $uvicornErr | ForEach-Object { Write-Log $_ } }
        exit 1
    }
    Write-Log 'scraper-svc healthy'

    # 3. Scrape straight into the local DB. Fail-soft: partial records are already persisted.
    Push-Location $serverDir
    try {
        $env:PRODUCTS_DB_PATH = $DbPath
        $env:SCRAPER_URL = "http://127.0.0.1:$Port/scrape"
        npx tsx scripts/scrapeProductsRun.ts
        $scrapeExit = $LASTEXITCODE
    } finally { Pop-Location }
    Write-Log "scrape exit code: $scrapeExit"
    if ($scrapeExit -eq 0) {
        Write-Log 'dutchie accrual appended to products.db'
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
    } else {
        Write-Log 'WARN: scrape reported errors (partial/total) -- whatever was captured is already in the DB'
    }
}
finally {
    if ($uvicorn -and -not $uvicorn.HasExited) {
        # Playwright launches headless Chromium as a child of uvicorn -- killing only the
        # parent PID can orphan it. /T kills the whole process tree.
        try { & taskkill /PID $uvicorn.Id /T /F 2>$null | Out-Null } catch { }
    }
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== dutchie local ingest end ==='
}
