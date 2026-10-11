[CmdletBinding()]
param(
    [ValidateSet('Prerequisites', 'Setup', 'Doctor', 'Build', 'Run', 'Auth', 'SDK', 'Devices', 'Install', 'Launch')]
    [string]$Step = 'Doctor',
    [string]$Distribution = 'Ubuntu-24.04',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ToolArguments = @()
)
$ErrorActionPreference = 'Stop'

if ($Step -eq 'Prerequisites') {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'WSL installation requires an Administrator PowerShell. Run this script there with -Step Prerequisites.'
    }
    # The Windows WSL stub may wait for keyboard input when WSL is absent.
    $wslInstalled = (Test-Path "$env:ProgramFiles/WSL/wsl.exe") -or
        [bool](Get-AppxPackage -Name MicrosoftCorporationII.WindowsSubsystemForLinux)
    if (-not $wslInstalled) {
        & winget install --id Microsoft.WSL --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
        if ($LASTEXITCODE -ne 0) { throw "WSL package installation failed ($LASTEXITCODE)." }
    }
    & wsl --install --distribution $Distribution --no-launch
    if ($LASTEXITCODE -ne 0) { throw 'WSL distribution installation failed. Restart Windows if requested, then retry.' }
    # Interactive installation avoids an automatic driver-install restart.
    $usbipdInstalled = & { $ErrorActionPreference = 'Continue'; & winget list --id dorssel.usbipd-win --exact --accept-source-agreements *> $null; $LASTEXITCODE -eq 0 }
    if (-not $usbipdInstalled) {
        & winget install --id dorssel.usbipd-win --exact --interactive --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw "USBIPD installation failed ($LASTEXITCODE)." }
    }
    Write-Host "Restart Windows if WSL requests it, then launch: wsl --distribution $Distribution"
    Write-Host 'Create your Linux user, then run this script from a normal PowerShell with -Step Setup.'
    exit 0
}

& wsl --distribution $Distribution --exec true
if ($LASTEXITCODE -ne 0) {
    throw "WSL/$Distribution is unavailable. Run -Step Prerequisites in Administrator PowerShell and finish Linux first-run setup."
}
$linuxScript = (& wsl --distribution $Distribution --exec wslpath -a -u (Join-Path $PSScriptRoot 'xtool-wsl.sh'))
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the script path inside WSL.' }
if ($Step -in @('Build', 'Run')) {
    & node (Join-Path $PSScriptRoot 'prepare.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Apple resource preparation failed.' }
}
# Arguments stay separate: repository paths with spaces never become shell code.
& wsl --distribution $Distribution --exec bash $linuxScript.Trim() $Step.ToLowerInvariant() @ToolArguments
if ($LASTEXITCODE -ne 0) { throw "xtool $Step failed ($LASTEXITCODE)." }
