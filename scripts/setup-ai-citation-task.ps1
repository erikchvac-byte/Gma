#Requires -Version 5.1
<#
.SYNOPSIS
  One-time setup for the daily AI-citation monitor (Phase-0 reach instrumentation, ADR-106).

.DESCRIPTION
  Idempotent. Run once from your main Happy checkout. It registers a WEEKLY Windows Scheduled Task
  that runs scripts/ai-citation-local.ps1 against THIS checkout (no worktree -- the monitor
  commits nothing and should pick up your edits to citation-questions.json).
  -StartWhenAvailable means a missed run (PC off) simply runs at next wake.

  Cadence is WEEKLY by design (ADR-106): AI-engine citations for a near-zero-traffic site move on
  a weeks-to-months timescale, and LLM answers vary run-to-run, so daily sampling logs noise, not
  signal. Bump to more frequent once you actually start getting cited and want to estimate a rate.

  The task runs as the current user when logged on (no stored credentials / prompts). Re-running
  this script is safe: the task is replaced (-Force).

  PREREQUISITE for live (non-dry) runs: put your key in server/.env  ->  ANTHROPIC_API_KEY=sk-ant-...
  (server/.env is gitignored). Without a key the monitor runs in dry-run mode (zero cost).

  Default run time is 05:00 -- after the 04:00 derive task -- so a fresh day's facts are live when
  the monitor probes. It does not depend on the pipeline, but staggering keeps the machine calm.

.NOTES
  Verify now (dry, no cost):  pwsh -NoProfile -File scripts/ai-citation-local.ps1 -Dry
  Verify live (uses API key): pwsh -NoProfile -File scripts/ai-citation-local.ps1
  Remove the task:            Unregister-ScheduledTask -TaskName 'GmaS AI Citation Monitor' -Confirm:$false
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RepoPath,
    [string]$TaskName = 'GmaS AI Citation Monitor',
    [string]$TaskTime = '05:00',
    [string]$TaskDay  = 'Monday'
)

$ErrorActionPreference = 'Stop'

# Resolve the repo root from the script's own location -- done HERE, not in the param default,
# because $PSScriptRoot is not reliably populated during param binding in Windows PowerShell 5.1.
if (-not $RepoPath) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $RepoPath  = (Resolve-Path (Join-Path $scriptDir '..')).Path
}

$runner = Join-Path $RepoPath 'scripts\ai-citation-local.ps1'
if (-not (Test-Path $runner)) { throw "Runner not found at '$runner'" }

Write-Host "Repo:   $RepoPath"
Write-Host "Runner: $runner"

if ($PSCmdlet.ShouldProcess($TaskName, "register weekly scheduled task ($TaskDay $TaskTime)")) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $runner)
    $trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $TaskDay -At $TaskTime
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'ADR-106: weekly AI-citation monitor -- asks AI engines the WA-deal target questions and logs whether gmaslist.com is cited. Local-only; commits nothing.' `
        -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskName' (weekly $TaskDay $TaskTime, StartWhenAvailable)"
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host ("Verify now (dry):  pwsh -NoProfile -File `"{0}`" -Dry" -f $runner)
