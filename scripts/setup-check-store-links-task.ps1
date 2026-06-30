#Requires -Version 5.1
<#
.SYNOPSIS
  One-time setup for the nightly residential store-link liveness check (ADR-068 guard, ADR-069).

.DESCRIPTION
  Idempotent. Run once from your main Happy checkout (on a residential network). It:
    1. Creates a DEDICATED git worktree pinned to master (default ~\Dev\Happy-linkcheck) so the
       nightly check always runs the committed guard and never touches your working checkout.
    2. Installs server deps in that worktree (once) so `npx tsx` resolves locally.
    3. Registers a daily Windows Scheduled Task that runs check-store-links-local.ps1 against the
       worktree. -StartWhenAvailable means a missed night (PC off) simply runs at next wake.

  The check is READ-ONLY (it never commits/pushes), so unlike the Weedmaps runner there is no
  commit-back to reconcile. Default run time is 04:30 -- after the 03:30 Weedmaps task -- and it
  uses its own worktree, so the two never collide.

  The task runs as the current user when logged on (no stored credentials / prompts). Re-running
  this script is safe: an existing worktree / node_modules is left as-is and the task is replaced.

.NOTES
  Verify after setup:  pwsh -NoProfile -File scripts/check-store-links-local.ps1
  Remove the task:     Unregister-ScheduledTask -TaskName 'GmaS Store Link Check' -Confirm:$false
  Remove the worktree: git worktree remove ..\Happy-linkcheck
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-linkcheck'),
    [string]$RepoPath     = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$TaskName     = 'GmaS Store Link Check',
    [string]$TaskTime     = '04:30'
)

$ErrorActionPreference = 'Stop'
$WorktreePath = $WorktreePath.TrimEnd('\', '/')

Write-Host "Repo:     $RepoPath"
Write-Host "Worktree: $WorktreePath"

# --- 1. dedicated worktree, DETACHED at origin/master (idempotent) ---
# Detached (not a `master` branch checkout) so the main Happy checkout can still `git checkout
# master` -- git forbids the same branch in two worktrees. The guard only reads, so a detached
# worktree pinned to origin/master is all it needs. `worktree prune` first clears stale metadata
# for a worktree whose directory was deleted by hand, so the existence check below is accurate.
git -C $RepoPath worktree prune
$wtNorm   = ($WorktreePath -replace '\\', '/')
$wtList   = git -C $RepoPath worktree list --porcelain
$wtExists = $wtList | Where-Object { $_ -like 'worktree *' -and (($_ -replace '\\', '/') -ieq "worktree $wtNorm") }
if ($wtExists) {
    Write-Host 'Worktree already present -- skipping add'
} elseif ($PSCmdlet.ShouldProcess($WorktreePath, 'git worktree add --detach (origin/master)')) {
    if ((Test-Path $WorktreePath) -and (Get-ChildItem -Force $WorktreePath | Select-Object -First 1)) {
        throw "Path '$WorktreePath' exists and is non-empty but is not a registered worktree. Remove it (or run 'git -C `"$RepoPath`" worktree repair') and re-run."
    }
    git -C $RepoPath fetch origin
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed (exit $LASTEXITCODE)" }
    git -C $RepoPath worktree add --detach $WorktreePath origin/master
    if ($LASTEXITCODE -ne 0) { throw "git worktree add failed (exit $LASTEXITCODE)" }
}

# --- 2. server deps in the worktree (idempotent -- npm install only if missing) ---
$serverDir   = Join-Path $WorktreePath 'server'
$nodeModules = Join-Path $serverDir 'node_modules'
if (Test-Path $nodeModules) {
    Write-Host 'server/node_modules present -- skipping npm install'
} elseif ($PSCmdlet.ShouldProcess($serverDir, 'npm install')) {
    Push-Location $serverDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

# --- 3. nightly scheduled task (idempotent via -Force) ---
$runner = Join-Path $WorktreePath 'scripts\check-store-links-local.ps1'
if ($PSCmdlet.ShouldProcess($TaskName, "register daily scheduled task at $TaskTime")) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -WorktreePath "{1}"' -f $runner, $WorktreePath)
    $trigger  = New-ScheduledTaskTrigger -Daily -At $TaskTime
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'ADR-068/069: nightly store-card link-liveness check from this residential IP (read-only; alerts on dead links).' `
        -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskName' (daily $TaskTime, StartWhenAvailable)"
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host ("Verify now:  pwsh -NoProfile -File `"{0}`" -WorktreePath `"{1}`"" -f $runner, $WorktreePath)
