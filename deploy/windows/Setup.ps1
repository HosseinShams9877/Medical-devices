[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Origin,
 [string]$DataDirectory='C:\MES-data',
 [switch]$InitializeFromBundle
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$uri=[Uri]$Origin
if ($uri.Scheme -ne 'https' -or $uri.GetLeftPart([UriPartial]::Authority) -cne $Origin -or $uri.UserInfo) { throw 'Origin must be an exact HTTPS origin without trailing slash.' }
if ($DataDirectory -notmatch '^[A-Za-z]:[\\/]') { throw 'Use an absolute path on a local drive.' }
if ((& node --version) -notmatch '^v24\.') { throw 'Install Node.js 24 first.' }
$envFile=Join-Path $root '.env'
if (Test-Path $envFile) { throw '.env already exists. Keep it; use WINDOWS-SETUP.md for upgrades. No data was changed.' }
foreach ($name in @('.env.local','.env.production','.env.production.local')) {
 if (Test-Path (Join-Path $root $name)) { throw "Remove conflicting configuration after review: $name" }
}
foreach ($name in @('DATABASE_URL','APP_ORIGIN','SESSION_COOKIE_SECURE','MES_UPLOAD_DIR','MES_BACKUP_DIR','PORT')) {
 if ([Environment]::GetEnvironmentVariable($name)) { throw "Existing environment override: $name. Review it before setup." }
}
$db=Join-Path $DataDirectory 'custom.db'
if (!(Test-Path $db) -and !$InitializeFromBundle) { throw 'No existing database. For a NEW installation only, pass -InitializeFromBundle, or restore your existing database and upload folder first.' }
New-Item -ItemType Directory -Force -Path $DataDirectory,(Join-Path $DataDirectory 'upload'),(Join-Path $DataDirectory 'backups') | Out-Null
if (!(Test-Path $db)) { Copy-Item -LiteralPath (Join-Path $root 'db\custom.db') -Destination $db -ErrorAction Stop }
$base=$DataDirectory.Replace('\','/').TrimEnd('/')
if ($base.Contains('"') -or $base.Contains('$') -or $base.Contains("`n")) { throw 'Unsupported characters in data path.' }
$content=@"
DATABASE_URL="file:$base/custom.db"
APP_ORIGIN="$Origin"
SESSION_COOKIE_SECURE="true"
MES_UPLOAD_DIR="$base/upload"
MES_BACKUP_DIR="$base/backups"
PORT=3000
"@
[IO.File]::WriteAllText($envFile,$content,(New-Object Text.UTF8Encoding($false)))
foreach ($argsList in @(@('ci'),@('run','db:generate'),@('run','typecheck'),@('run','build','--','--webpack'))) {
 & npm.cmd @argsList
 if ($LASTEXITCODE -ne 0) { throw 'Install/build failed. Fix the reported error before starting.' }
}
Write-Host 'Build complete. Run Secure-Admin.ps1, then npm.cmd run preflight. Configure HTTPS before opening access.'
