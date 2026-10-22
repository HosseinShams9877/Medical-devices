[CmdletBinding()]
param([string]$Username='admin')
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$first=Read-Host 'New administrator password (12+ characters)' -AsSecureString
$second=Read-Host 'Repeat password' -AsSecureString
$a=[IntPtr]::Zero; $b=[IntPtr]::Zero
try {
 $a=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
 $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($a)
 if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)) { throw 'Passwords do not match.' }
 $env:MES_ADMIN_USERNAME=$Username
 $env:MES_ADMIN_PASSWORD=$plain
 & npm.cmd run admin:secure
 if ($LASTEXITCODE -ne 0) { throw 'Administrator setup failed.' }
} finally {
 Remove-Item Env:MES_ADMIN_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:MES_ADMIN_USERNAME -ErrorAction SilentlyContinue
 $plain=$null
 if ($a -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($a) }
 if ($b -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
