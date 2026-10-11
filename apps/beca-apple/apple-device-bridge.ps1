[CmdletBinding()]
param([string]$Distribution = 'Ubuntu-24.04')
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this bridge setup from Administrator PowerShell.'
}
$appleService = Get-Service -Name 'AppleMobileDeviceService', 'Apple Mobile Device Service' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($appleService) { Start-Service -InputObject $appleService }
$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 27015 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
    $applePackage = Get-AppxPackage AppleInc.AppleDevices
    if ($applePackage) {
        # This agent is an application entry in Apple's installed package manifest.
        Start-Process explorer.exe -WindowStyle Hidden -ArgumentList ('shell:AppsFolder\' + $applePackage.PackageFamilyName + '!AMPDevicesAgent')
        for ($attempt = 0; $attempt -lt 5 -and -not $listener; $attempt++) {
            Start-Sleep -Seconds 1
            $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 27015 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        }
    }
}
if (-not $listener) { throw 'Open Apple Devices and finish first-run setup. Its device service must listen on port 27015.' }
$listenerProcess = Get-Process -Id $listener.OwningProcess
if ($listenerProcess.ProcessName -notmatch '^AppleMobileDevice(Process|Service)$') {
    throw 'Port 27015 is owned by an unexpected program.'
}
$routes = & wsl --distribution $Distribution --exec ip -j -4 route show default
if ($LASTEXITCODE -ne 0) { throw 'Could not read the WSL network route.' }
$bridgeAddress = ($routes | ConvertFrom-Json | Select-Object -First 1).gateway
$addresses = & wsl --distribution $Distribution --exec ip -j -4 address show dev eth0
if ($LASTEXITCODE -ne 0) { throw 'Could not read the WSL network address.' }
$linuxAddress = (($addresses | ConvertFrom-Json | Select-Object -First 1).addr_info | Select-Object -First 1).local
if (-not $bridgeAddress -or -not $linuxAddress) { throw 'This helper requires WSL NAT networking.' }
foreach ($value in @($bridgeAddress, $linuxAddress)) {
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($value, [ref]$parsed)) { throw 'Invalid WSL network address.' }
}
$hostInterface = Get-NetIPAddress -IPAddress $bridgeAddress -ErrorAction SilentlyContinue
if (-not $hostInterface -or $hostInterface.InterfaceAlias -notlike 'vEthernet (WSL*') {
    throw 'The Linux gateway is not the Windows WSL NAT interface.'
}
# Forward only the WSL host interface, with access limited to this Linux VM.
$proxyLines = & netsh interface portproxy show v4tov4
$existingProxy = $proxyLines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($bridgeAddress) + '\s+27015\s+') }
if ($existingProxy -and $existingProxy -notmatch '\s+127\.0\.0\.1\s+27015\s*$') {
    throw 'An unrelated port forwarding rule already uses this address/port.'
}
& netsh interface portproxy add v4tov4 listenaddress=$bridgeAddress listenport=27015 connectaddress=127.0.0.1 connectport=27015
if ($LASTEXITCODE -ne 0) { throw 'Apple device port forwarding failed.' }
$ruleName = 'BECA-xtool-Apple-WSL'
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) { $existing | Remove-NetFirewallRule }
New-NetFirewallRule -Name $ruleName -DisplayName 'BECA xtool Apple device bridge' -Direction Inbound -Protocol TCP -LocalAddress $bridgeAddress -LocalPort 27015 -RemoteAddress $linuxAddress -Profile Any -Action Allow | Out-Null
# xtool and libimobiledevice support the Apple Windows service's TCP socket.
& wsl --distribution $Distribution --exec sh -c 'mkdir -p "$HOME/.local/share/beca-apple"; touch "$HOME/.local/share/beca-apple/use-windows-usbmux"'
if ($LASTEXITCODE -ne 0) { throw 'Could not save the device bridge preference.' }
Write-Host 'Apple device bridge enabled. Keep the iPad attached to Windows, rather than USBIPD.'
Write-Host 'Rerun this helper if WSL network addresses change after restarting Windows.'
