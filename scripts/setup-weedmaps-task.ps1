#Requires -Version 5.1
<#
.SYNOPSIS
  One-time setup for residential-IP Weedmaps accrual (AI-search Phase 3).

.DESCRIPTION
  Idempotent. Run once from your main Happy checkout. It:
    1. Creates a DEDICATED git worktree pinned to master (default ~\Dev\Happy-weedmaps-ingest)
       so the nightly scrape never touches your working checkout / current branch.
    2. Installs server deps in that worktree (once) so `npx tsx` resolves locally.
    3. Registers a daily Windows Scheduled Task that runs scrape-weedmaps-local.ps1 against the
       worktree. -StartWhenAvailable means a missed night (PC off) simply runs at next wake.

  The task runs as the current user when logged on (no stored credentials / prompts). Re-running
  this script is safe: an existing worktree / node_modules is left as-is and the task is replaced.

.NOTES
  Verify after setup:  pwsh -NoProfile -File scripts/scrape-weedmaps-local.ps1
  Remove the task:     Unregister-ScheduledTask -TaskName 'GmaS Weedmaps Ingest' -Confirm:$false
  Remove the worktree: git worktree remove ..\Happy-weedmaps-ingest
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-weedmaps-ingest'),
    [string]$RepoPath     = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$TaskName     = 'GmaS Weedmaps Ingest',
    [string]$TaskTime     = '03:30'
)

$ErrorActionPreference = 'Stop'
$WorktreePath = $WorktreePath.TrimEnd('\', '/')

Write-Host "Repo:     $RepoPath"
Write-Host "Worktree: $WorktreePath"

# --- 1. dedicated worktree, DETACHED at origin/master (idempotent) ---
# Detached (not a `master` branch checkout) so the main Happy checkout can still `git checkout
# master` -- git forbids the same branch in two worktrees. The runner pushes via HEAD:master, so
# a detached worktree is all it needs. `worktree prune` first clears stale metadata for a worktree
# whose directory was deleted by hand, so the existence check below doesn't skip a missing tree.
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
$runner = Join-Path $WorktreePath 'scripts\scrape-weedmaps-local.ps1'
if ($PSCmdlet.ShouldProcess($TaskName, "register daily scheduled task at $TaskTime")) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -WorktreePath "{1}"' -f $runner, $WorktreePath)
    $trigger  = New-ScheduledTaskTrigger -Daily -At $TaskTime
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'AI-search Phase 3: nightly Weedmaps product-price accrual from this residential IP (commit-back to master).' `
        -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskName' (daily $TaskTime, StartWhenAvailable)"
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host ("Verify now:  pwsh -NoProfile -File `"{0}`" -WorktreePath `"{1}`"" -f $runner, $WorktreePath)
