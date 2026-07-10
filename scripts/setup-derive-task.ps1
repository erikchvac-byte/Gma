#Requires -Version 5.1
<#
.SYNOPSIS
  One-time setup for the nightly LOCAL derivation runner (ADR-077 Phase 1).

.DESCRIPTION
  Idempotent. Run once from your main Happy checkout. It:
    1. Creates a DEDICATED git worktree pinned to master (default ~\Dev\Happy-ingest) so the nightly
       derive never touches your working checkout / current branch.
    2. Installs server deps in that worktree (once) so `npx tsx` resolves locally.
    3. Registers a daily Windows Scheduled Task that runs derive-facts-local.ps1 against the worktree.
       -StartWhenAvailable means a missed night (PC off) simply runs at next wake.

  This is the third of the "schedule the three" tasks the runbook (docs/products-local-sqlite-ingest.md)
  left as a manual TODO. It is staggered AFTER both feeders (Dutchie 03:00, Weedmaps 03:30) so it
  reads a freshly-accrued products.db, then commits + pushes the small derived facts to master.

  The task runs as the current user when logged on (no stored credentials / prompts). Re-running this
  script is safe: an existing worktree / node_modules is left as-is and the task is replaced.

.NOTES
  Verify after setup:  pwsh -NoProfile -File scripts/derive-facts-local.ps1
  Remove the task:     Unregister-ScheduledTask -TaskName 'GmaS Derive Facts' -Confirm:$false
  Remove the worktree: git worktree remove ..\Happy-ingest
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$WorktreePath = (Join-Path $HOME 'Dev\Happy-ingest'),
    [string]$RepoPath,
    [string]$TaskName     = 'GmaS Derive Facts',
    [string]$TaskTime     = '04:00'
)

$ErrorActionPreference = 'Stop'

# Resolve the repo root from the script's own location -- done HERE, not in the param default,
# because $PSScriptRoot is not reliably populated during param binding in Windows PowerShell 5.1.
if (-not $RepoPath) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $RepoPath  = (Resolve-Path (Join-Path $scriptDir '..')).Path
}

$WorktreePath = $WorktreePath.TrimEnd('\', '/')

Write-Host "Repo:     $RepoPath"
Write-Host "Worktree: $WorktreePath"

# --- 1. dedicated worktree, DETACHED at origin/master (idempotent) ---
# Detached so the main Happy checkout can still `git checkout master`. The runner hard-resets to
# origin/master each run, so a detached worktree is all it needs. `worktree prune` first clears stale
# metadata for a hand-deleted worktree so the existence check below doesn't skip a missing tree.
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
$runner = Join-Path $WorktreePath 'scripts\derive-facts-local.ps1'
if ($PSCmdlet.ShouldProcess($TaskName, "register daily scheduled task at $TaskTime")) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -WorktreePath "{1}"' -f $runner, $WorktreePath)
    $trigger  = New-ScheduledTaskTrigger -Daily -At $TaskTime
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'ADR-077 Phase 1: nightly local derivation of server/data/derived/*.json from products.db, committed + pushed to master (Render redeploys).' `
        -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskName' (daily $TaskTime, StartWhenAvailable)"
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host ("Verify now:  pwsh -NoProfile -File `"{0}`" -WorktreePath `"{1}`"" -f $runner, $WorktreePath)
