#Requires -Version 5.1
<#
.SYNOPSIS
  Local Reddit mention-monitor runner (Phase-2 reach, v1 notifier-only).

.DESCRIPTION
  Runs server/scripts/redditMonitorRun.ts, which polls the North-Sound subreddits in
  server/scripts/reddit-subreddits.json (public /new.json, no auth), precision-filters + fact-gates
  each post against the committed derived facts, and appends freshness-stamped alert rows to a LOCAL
  JSONL (default ~\GmaS-data\reddit-mentions.jsonl) recording each North-Sound thread a gmaslist fact
  can answer. NOTIFIER ONLY -- a human replies by hand; nothing here posts to Reddit.

  UNLIKE the ingest/derive runners this needs NO git worktree and commits NOTHING -- it only calls a
  public JSON endpoint + the Haiku classifier and writes a local log. It runs against your MAIN
  checkout, so edits to reddit-subreddits.json take effect immediately.

  The Anthropic key is read from the repo-root .env (ANTHROPIC_API_KEY) via dotenv. With no key the
  survivors are counted but not classified (no alerts, zero cost) -- the pipeline still proves out.

.NOTES
  Set up the daily task once with scripts/setup-reddit-monitor-task.ps1 (needs your go-ahead).
  Manual run:  pwsh -NoProfile -File scripts/reddit-monitor-local.ps1
  Dry run:     pwsh -NoProfile -File scripts/reddit-monitor-local.ps1 -Dry   (no network/API; isolated log)
#>
[CmdletBinding()]
param(
    # Force dry mode: no network/API call, writes to an ISOLATED log so real state is untouched.
    [switch]$Dry,
    # A lock older than this (minutes) is treated as stale and overridden.
    [int]$StaleLockMinutes = 20
)

$ErrorActionPreference = 'Stop'

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoPath  = (Resolve-Path (Join-Path $scriptDir '..')).Path
$serverDir = Join-Path $repoPath 'server'
$logDir    = Join-Path $HOME 'GmaS-data\reddit-runs'
$lockFile  = Join-Path $logDir 'run.lock'
$logFile   = Join-Path $logDir ('reddit-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
$heartbeat = Join-Path $logDir 'last-success.txt'

function Write-Log([string]$msg) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    if (Test-Path $logDir) { Add-Content -Path $logFile -Value $line -Encoding utf8 }
}

# Fire a Windows toast (Action Center) so the daily result is seen without opening a file. Uses the
# native WinRT toast API with the Start-Menu PowerShell AppUserModelID (a registered AUMID). NON-
# FATAL: a toast can never fail the run -- any error is logged and swallowed.
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

# --- preconditions ---
if (-not (Test-Path $serverDir)) { Write-Error "server dir not found at '$serverDir'"; exit 1 }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

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
    Write-Log "=== Reddit mention-monitor start (server: $serverDir; dry=$Dry) ==="
    Push-Location $serverDir
    try {
        # PS 5.1 + $ErrorActionPreference='Stop' turns redirected native STDERR into a TERMINATING
        # error (verified) -- and the monitor legitimately warns on stderr (per-sub fetch skips).
        # Relax EAP around the native call only; the stderr lines still land in $output via 2>&1.
        $tsxArgs = @('tsx', 'scripts/redditMonitorRun.ts')
        if ($Dry) { $tsxArgs += '--dry' }
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $output = & npx @tsxArgs 2>&1 | ForEach-Object { $_.ToString() }
            $runExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevEap
        }
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

    # --- end-of-run toast (Action Center) ---
    # Body is the run's SUMMARY marker line (alerts / survivors / fetched). Falls back to a generic
    # status line if the run printed none.
    $summaryLine = ($output | Where-Object { $_ -match '^SUMMARY:' } | Select-Object -Last 1) -replace '^SUMMARY:\s*', ''
    if (-not $summaryLine) { $summaryLine = "run complete (monitor exit $runExit)" }
    $toastTitle = if ($runExit -eq 0) { 'GmaS Reddit monitor' } else { 'GmaS Reddit monitor (errored)' }
    Show-Toast $toastTitle $summaryLine

    # Propagate failure so Task Scheduler's RestartCount retry (setup script) can actually fire --
    # an unconditional exit 0 here would defeat the retry hardening and mark broken runs green.
    if ($runExit -ne 0) { exit 1 }
    exit 0
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== Reddit mention-monitor end ==='
}
