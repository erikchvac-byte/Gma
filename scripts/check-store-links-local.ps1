#Requires -Version 5.1
<#
.SYNOPSIS
  Nightly residential-IP store-card link-liveness check (ADR-068 guard, ADR-069 scheduling).

.DESCRIPTION
  Runs the unchanged server/scripts/checkStoreLinks.ts from a RESIDENTIAL IP and alerts on a
  DEFINITELY-dead store-card link (HTTP 404/410). Dutchie -- like Weedmaps -- 403-walls datacenter
  IPs, so this guard cannot run on GitHub Actions (CI cannot tell a real 404 from the bot-wall);
  from a home IP the status codes are truthful. This is the residential counterpart to the
  ADR-064 Weedmaps runner, but READ-ONLY: it never commits or pushes anything.

  By default it checks the LIVE production feed (DATA_URL=https://gmaslist.com/api/data) -- the
  actual links users click -- not the committed seed, so a link that dies after deploy is caught.

  Isolation mirrors the Weedmaps runner: it operates ONLY inside a dedicated git worktree
  (default ~\Dev\Happy-linkcheck) hard-reset to origin/master each run, so it always runs the
  known-good committed guard regardless of whatever branch/edits are in your main checkout, and
  never collides with active development.

  ALERTING (the point of a nightly check): the guard exits non-zero only on a definite dead link.
  On a non-zero exit this runner writes a persistent LINK-ALERT.txt marker (deleted again on the
  next clean run), raises a best-effort Windows toast/balloon, and logs the verdict lines. On a
  clean run it touches a last-success.txt heartbeat so a silent stall (PATH lost, site
  unreachable for days) is detectable by a stale timestamp.

.NOTES
  Set up once with scripts/setup-check-store-links-task.ps1 (creates the worktree + nightly task).
  Manual run:  pwsh -NoProfile -File scripts/check-store-links-local.ps1
#>
[CmdletBinding()]
param(
    # The dedicated worktree the check runs in. Default matches setup's default.
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-linkcheck'),
    # The feed to probe. Live production by default; pass '' to check the worktree's committed seed.
    [string]$DataUrl = 'https://gmaslist.com/api/data',
    # A lock older than this (minutes) is treated as stale and overridden. Must exceed the task's
    # ExecutionTimeLimit (15m in setup) so a still-running instance is never wrongly overridden.
    [int]$StaleLockMinutes = 25
)

$ErrorActionPreference = 'Stop'

$WorktreePath = $WorktreePath.TrimEnd('\', '/')
$serverDir    = Join-Path $WorktreePath 'server'
$logDir       = Join-Path $WorktreePath '.linkcheck'
$lockFile     = Join-Path $logDir 'run.lock'
$logFile      = Join-Path $logDir ('linkcheck-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
$heartbeat    = Join-Path $logDir 'last-success.txt'
$alertFile    = Join-Path $logDir 'LINK-ALERT.txt'

function Write-Log([string]$msg) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    if (Test-Path $logDir) { Add-Content -Path $logFile -Value $line -Encoding utf8 }
}

# Best-effort desktop notification (only shows while logged on). BurntToast if installed, else a
# tray balloon; any failure is swallowed -- the durable signal is LINK-ALERT.txt + the log.
function Notify-Alert([string]$title, [string]$body) {
    try {
        if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {
            New-BurntToastNotification -Text $title, $body
            return
        }
        Add-Type -AssemblyName System.Windows.Forms
        $ni = New-Object System.Windows.Forms.NotifyIcon
        $ni.Icon = [System.Drawing.SystemIcons]::Warning
        $ni.Visible = $true
        $ni.ShowBalloonTip(15000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Warning)
        Start-Sleep -Seconds 1
        $ni.Dispose()
    } catch {
        Write-Log "WARN: desktop notification failed ($($_.Exception.Message)) -- see LINK-ALERT.txt"
    }
}

# --- preconditions ---
if (-not (Test-Path $serverDir)) {
    Write-Error "Worktree not found at '$WorktreePath'. Run scripts/setup-check-store-links-task.ps1 first."
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
    Write-Log "=== store-link liveness check start (worktree: $WorktreePath; feed: $(if ($DataUrl) { $DataUrl } else { 'committed seed' })) ==="

    # 1. Reconcile the worktree to a GUARANTEED-CLEAN origin/master base so we always run the
    #    committed, known-good guard -- never a stray local edit or a half-finished branch.
    git -C $WorktreePath fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR: git fetch failed -- aborting run'; exit 1 }
    git -C $WorktreePath rebase --abort  # no-op (non-zero, prints to stderr) if no rebase in progress
    git -C $WorktreePath reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Log "ERROR: reset to origin/master failed (exit $LASTEXITCODE) -- aborting run"; exit 1 }

    # 2. Run the guard. It GETs every store url from this residential IP and exits non-zero ONLY on
    #    a definite 404/410 (a 403/429 bot-wall or 5xx is "unknown", never an alert). $LASTEXITCODE
    #    is the truth even though 2>&1 wraps native stderr in PS 5.1 (we never rely on $?).
    if ($DataUrl) { $env:DATA_URL = $DataUrl } else { Remove-Item Env:\DATA_URL -ErrorAction SilentlyContinue }
    Push-Location $serverDir
    try {
        $output = & npx tsx scripts/checkStoreLinks.ts 2>&1 | ForEach-Object { $_.ToString() }
        $checkExit = $LASTEXITCODE
    } finally {
        Pop-Location
        Remove-Item Env:\DATA_URL -ErrorAction SilentlyContinue
    }
    foreach ($line in $output) { Write-Log $line }
    Write-Log "guard exit code: $checkExit"

    if ($checkExit -eq 0) {
        # Clean: clear any prior alert and stamp the heartbeat.
        Remove-Item -Path $alertFile -ErrorAction SilentlyContinue
        Set-Content -Path $heartbeat -Value (Get-Date -Format 's') -Encoding utf8
        Write-Log 'OK -- no dead links'
        exit 0
    }

    # Non-zero: distinguish a real dead link (the guard's ALERT line) from a run that could not
    # complete (live feed unreachable, etc.) so a transient site blip is not mistaken for a 404.
    $deadLine = $output | Where-Object { $_ -match 'ALERT:.*dead link' } | Select-Object -First 1
    if ($deadLine) {
        $title = 'GmaS: dead store-card link detected'
        $detail = $output | Where-Object { $_ -match 'broken|ALERT' }
    } else {
        $title = 'GmaS: link check could not complete'
        $detail = $output | Select-Object -Last 8
    }

    $alertText = @(
        "$title", "",
        "Detected: $(Get-Date -Format 's')",
        "Feed: $(if ($DataUrl) { $DataUrl } else { 'committed seed' })",
        "Log:  $logFile",
        "",
        "Fix: see ADR-068 / feedback_store-link-method -- repoint the store's `url` to its live",
        "own-site page (verify with: pwsh -NoProfile -File scripts/check-store-links-local.ps1).",
        "",
        "----- guard output -----"
    ) + $detail
    Set-Content -Path $alertFile -Value $alertText -Encoding utf8

    Notify-Alert $title ("$($detail -join '; ')`nSee $alertFile")
    Write-Log "ALERT written: $alertFile"
    # Do not exit non-zero -- a failed Scheduled Task result is invisible to Erik; the durable
    # signal is LINK-ALERT.txt + the toast. (We still surface it in the log.)
    exit 0
}
finally {
    Remove-Item -Path $lockFile -ErrorAction SilentlyContinue
    Write-Log '=== store-link liveness check end ==='
}
