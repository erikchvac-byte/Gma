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

# Fire a Windows toast (Action Center) so the weekly result is seen without opening a file. Uses the
# native WinRT toast API with the Start-Menu PowerShell AppUserModelID (a registered AUMID, so no
# custom app registration is needed). NON-FATAL: a toast can never fail the run -- any error is
# logged and swallowed. Toasts display for the interactive user; if none is logged on at run time
# they queue in Action Center and appear at next sign-in.
function Show-Toast([string]$title, [string]$body) {
    try {
        [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        [void][Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
        [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]
        $tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
            [Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $texts = $tpl.GetElementsByTagName('text')
        [void]$texts.Item(0).AppendChild($tpl.CreateTextNode($title))
        [void]$texts.Item(1).AppendChild($tpl.CreateTextNode($body))
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
        $notifier.Show([Windows.UI.Notifications.ToastNotification]::new($tpl))
    } catch {
        Write-Log "WARN: toast notification failed -- $($_.Exception.Message)"
    }
}

# The rolling one-liner the citation-share tracker upserts (newest data line). '' if not written yet.
function Get-LatestSummaryLine {
    $summaryFile = Join-Path $HOME 'GmaS-data\citation-summary.md'
    if (-not (Test-Path $summaryFile)) { return '' }
    $dataLines = Get-Content $summaryFile -Encoding utf8 |
        Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}' }
    if ($dataLines) { return ($dataLines | Select-Object -Last 1) }
    return ''
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

    # --- citation-share tracker (Story 1.1 / ADR-113) ---
    # Folds the monitor's JSONL log (just appended above) into a dated citation-share time series +
    # markdown, under ~/GmaS-data/ (private, not committed). Makes NO engine calls. NON-FATAL: a
    # tracker failure must never fail this weekly run, so its exit code is logged but not propagated.
    Push-Location $serverDir
    try {
        $trackerOut = & npx tsx scripts/citationShareRun.ts 2>&1 | ForEach-Object { $_.ToString() }
        $trackerExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    foreach ($line in $trackerOut) { Write-Log $line }
    if ($trackerExit -ne 0) { Write-Log "WARN: citation-share tracker exited $trackerExit -- see output above" }

    # --- unlinked-mention finder (Story 1.4 / ADR-116) ---
    # Searches the web (shared search stack, no new monitor calls) for public "gmaslist"/"gma's list"
    # mentions that don't link to gmaslist.com, dedupes against a monotonic known-mention ledger, and
    # writes a chase list of NEW-since-last-run mentions under ~/GmaS-data/ (private, not committed).
    # NON-FATAL: a finder failure must never fail this weekly run, so its exit code is logged but not
    # propagated. (Erik granted the AR-4 go-ahead to wire this onto the weekly Mon 05:00 Task.)
    Push-Location $serverDir
    try {
        $mentionOut = & npx tsx scripts/unlinkedMentionFinderRun.ts 2>&1 | ForEach-Object { $_.ToString() }
        $mentionExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    foreach ($line in $mentionOut) { Write-Log $line }
    if ($mentionExit -ne 0) { Write-Log "WARN: unlinked-mention finder exited $mentionExit -- see output above" }

    # --- end-of-run toast (Action Center) ---
    # Body is the tracker's rolling one-liner (date / cited N/8 / delta / top rival). Falls back to a
    # generic status line if the tracker wrote nothing this run. A monitor non-zero is surfaced too.
    $summaryLine = Get-LatestSummaryLine
    if (-not $summaryLine) { $summaryLine = "run complete (monitor exit $runExit)" }
    $toastTitle = if ($runExit -eq 0) { 'GmaS AI-citation monitor' } else { 'GmaS AI-citation monitor (monitor errored)' }
    Show-Toast $toastTitle $summaryLine

    exit 0
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== AI-citation monitor end ==='
}
