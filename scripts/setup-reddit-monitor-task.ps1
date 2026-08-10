#Requires -Version 5.1
<#
.SYNOPSIS
  One-time setup for the DAILY Reddit mention-monitor (Phase-2 reach, v1 notifier-only).

.DESCRIPTION
  Idempotent. Run once from your main Happy checkout. It registers a DAILY Windows Scheduled Task
  that runs scripts/reddit-monitor-local.ps1 against THIS checkout (no worktree -- the monitor
  commits nothing and should pick up your edits to reddit-subreddits.json).
  -StartWhenAvailable means a missed run (PC off) simply runs at next wake.

  Cadence is DAILY by design (brainstorm Technique 2): Reddit threads die in 24-48h, so a weekly
  cadence would miss most live opportunities. Retry-on-failure and battery settings are enabled so a
  transient network blip or a run started on battery is not silently skipped (mirrors the citation
  task's hardening, PR #133).

  Default run time is 06:00 -- after the 04:00 derive + 05:00 citation tasks -- so a fresh day's
  facts are live when the monitor fact-gates.

  PREREQUISITE for classification: put your key in the repo-root .env -> ANTHROPIC_API_KEY=sk-ant-...
  (already there for the citation monitor). Without a key survivors are counted but not classified
  (no alerts, zero cost).

  !! NOT REGISTERED AUTOMATICALLY. Per the project ask/act boundary, registering a Scheduled Task
  needs Erik's explicit go-ahead. Review a dry run first, then run this script yourself to register.

.NOTES
  Verify now (dry, no cost):  pwsh -NoProfile -File scripts/reddit-monitor-local.ps1 -Dry
  Register the task:          pwsh -NoProfile -File scripts/setup-reddit-monitor-task.ps1
  Remove the task:            Unregister-ScheduledTask -TaskName 'GmaS Reddit Monitor' -Confirm:$false
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RepoPath,
    [string]$TaskName = 'GmaS Reddit Monitor',
    [string]$TaskTime = '06:00'
)

$ErrorActionPreference = 'Stop'

# Resolve the repo root from the script's own location -- done HERE, not in the param default,
# because $PSScriptRoot is not reliably populated during param binding in Windows PowerShell 5.1.
if (-not $RepoPath) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $RepoPath  = (Resolve-Path (Join-Path $scriptDir '..')).Path
}

$runner = Join-Path $RepoPath 'scripts\reddit-monitor-local.ps1'
if (-not (Test-Path $runner)) { throw "Runner not found at '$runner'" }

Write-Host "Repo:   $RepoPath"
Write-Host "Runner: $runner"

if ($PSCmdlet.ShouldProcess($TaskName, "register daily scheduled task ($TaskTime)")) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $runner)
    $trigger  = New-ScheduledTaskTrigger -Daily -At $TaskTime
    # Retry-on-failure + run-on-battery hardening (mirrors the citation task, PR #133).
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
        -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'Phase-2 reach: daily Reddit mention-monitor -- polls North-Sound subreddits, precision-filters + fact-gates each post, logs alertable threads. Local-only, notifier-only; commits nothing and never posts.' `
        -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskName' (daily $TaskTime, StartWhenAvailable)"
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host ("Verify now (dry):  pwsh -NoProfile -File `"{0}`" -Dry" -f $runner)
