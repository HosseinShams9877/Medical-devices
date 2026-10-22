# Offline full backup: stop both tasks first. Never copy a live SQLite database.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
foreach ($name in @('MES-App','MES-HTTPS')) {
 $task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
 if ($task -and $task.State -eq 'Running') { throw "Stop-ScheduledTask $name first. Backup refused while task is running." }
}
& node --import ./scripts/load-env.mjs scripts/backup-offline.mjs $Destination
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not use an incomplete backup.' }
