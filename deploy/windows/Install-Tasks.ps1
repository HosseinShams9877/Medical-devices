# Run from an elevated PowerShell. Credentials are for a dedicated Windows account,
# not an application user. Existing tasks are never overwritten.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CaddyExe)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node=(Get-Command node.exe -ErrorAction Stop).Source
$caddy=(Resolve-Path $CaddyExe).Path
$config=Join-Path $PSScriptRoot 'Caddyfile'
if (!(Test-Path $config)) { throw 'Create deploy/windows/Caddyfile from the example first.' }
foreach ($name in @('MES-App','MES-HTTPS')) {
 if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { throw "Task already exists: $name. Stop and review the existing task instead of replacing it." }
}
& $caddy validate --config $config --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration failed validation.' }
Set-Location $root
& npm.cmd run preflight
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed.' }
$cred=Get-Credential -Message 'Dedicated Windows account with read/execute on code and modify access to MES-data'
$trigger=New-ScheduledTaskTrigger -AtStartup
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$app=New-ScheduledTaskAction -Execute $node -Argument ('"'+(Join-Path $root 'scripts\start-production.mjs')+'"') -WorkingDirectory $root
$proxy=New-ScheduledTaskAction -Execute $caddy -Argument ('run --config "'+$config+'" --adapter caddyfile') -WorkingDirectory $root
$created=@()
try {
 Register-ScheduledTask -TaskName 'MES-App' -Action $app -Trigger $trigger -Settings $settings -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited | Out-Null
 $created+='MES-App'
 Register-ScheduledTask -TaskName 'MES-HTTPS' -Action $proxy -Trigger $trigger -Settings $settings -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited | Out-Null
 $created+='MES-HTTPS'
} catch {
 foreach ($name in $created) { Unregister-ScheduledTask -TaskName $name -Confirm:$false }
 throw
}
Write-Host 'Tasks installed, not started. Verify account permissions and certificate trust, then Start-ScheduledTask MES-App and MES-HTTPS.'
