#Requires -Version 5.1
<#
.SYNOPSIS
  Local AI-citation monitor runner (Phase-0 reach instrumentation, ADR-106).

.DESCRIPTION
  Runs server/scripts/aiCitationRun.ts, which asks each configured AI engine (Anthropic web
  search today; keyless dry-run if no key) the target questions in
  server/scripts/citation-questions.json and appends one JSONL observation per (engine, question)
  to a LOCAL log (default ~\GmaS-data\citation-log.jsonl) recording whether gmaslist.com was CITED.
  This is the dead-man's-switch for REACH: stand it up FIRST to capture a baseline, then every
  later gain is measurable, and a page that stops being cited is visible.

  UNLIKE the ingest/derive/link-check runners this needs NO git worktree and commits NOTHING --
  it only calls an external API and writes a local log. It runs against your MAIN checkout, so
  edits to citation-questions.json take effect immediately.

  The Anthropic key is read from the repo-root .env (ANTHROPIC_API_KEY) via dotenv. With no key the run
  still executes in dry-run mode (zero cost) and logs non-cited placeholders, proving the pipeline.

.NOTES
  Set up the weekly task once with scripts/setup-ai-citation-task.ps1 (needs your go-ahead).
  Manual run:  pwsh -NoProfile -File scripts/ai-citation-local.ps1
  Dry run:     pwsh -NoProfile -File scripts/ai-citation-local.ps1 -Dry
#>
[CmdletBinding()]
param(
    # Force the keyless dry-run engine (no API cost) regardless of whether a key is present.
    [switch]$Dry,
    # A lock older than this (minutes) is treated as stale and overridden. Must exceed the task's
    # ExecutionTimeLimit so a still-running instance is never wrongly overridden.
    [int]$StaleLockMinutes = 20
)

$ErrorActionPreference = 'Stop'

# Resolve repo root from this script's own location (scripts/ sits directly under the repo root).
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoPath  = (Resolve-Path (Join-Path $scriptDir '..')).Path
$serverDir = Join-Path $repoPath 'server'
$logDir    = Join-Path $HOME 'GmaS-data\citation-runs'
$lockFile  = Join-Path $logDir 'run.lock'
$logFile   = Join-Path $logDir ('citation-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
$heartbeat = Join-Path $logDir 'last-success.txt'

function Write-Log([string]$msg) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    if (Test-Path $logDir) { Add-Content -Path $logFile -Value $line -Encoding utf8 }
}

# --- preconditions ---
if (-not (Test-Path $serverDir)) { Write-Error "server dir not found at '$serverDir'"; exit 1 }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# A Scheduled-Task token may have a leaner PATH than an interactive shell -- fail loudly.
foreach ($cmd in 'node', 'npx') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Log "ERROR: '$cmd' is not on PATH for this run -- aborting (check the Scheduled Task's PATH)"
        exit 1
    }
}

# --- single-instance lock ---
if (Test-Path $lockFile) {
    $age     = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    $heldPid = (Get-Content $lockFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $alive   = $false
    if ($heldPid -match '^\d+$') { $alive = [bool](Get-Process -Id $heldPid -ErrorAction SilentlyContinue) }
    if ($alive -and $age.TotalMinutes -lt $StaleLockMinutes) {
        Write-Log ('another run is active (pid {0}, lock age {1}m) -- skipping' -f $heldPid, [int]$age.TotalMinutes)
        exit 0
    }
    Write-Log ('overriding lock (pid {0} alive={1}, age {2}m)' -f $heldPid, $alive, [int]$age.TotalMinutes)
}
Set-Content -Path $lockFile -Value $PID -Encoding utf8

try {
    Write-Log "=== AI-citation monitor start (server: $serverDir; dry=$Dry) ==="
    Push-Location $serverDir
    try {
        if ($Dry) {
            $output = & npx tsx scripts/aiCitationRun.ts --dry 2>&1 | ForEach-Object { $_.ToString() }
        } else {
            $output = & npx tsx scripts/aiCitationRun.ts 2>&1 | ForEach-Object { $_.ToString() }
        }
        $runExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    foreach ($line in $output) { Write-Log $line }
    Write-Log "run exit code: $runExit"

    if ($runExit -eq 0) {
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
        Write-Log 'OK'
    } else {
        Write-Log 'WARN: monitor exited non-zero -- see output above'
    }
    exit 0
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== AI-citation monitor end ==='
}
