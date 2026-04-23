param(
  [string]$DriveLetter = "B"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "apps\beca-setup"
$shortPath = "$DriveLetter`:\"

$nodeDir = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe" -Directory | Select-Object -First 1 -ExpandProperty FullName
$mingwBin = Join-Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe" "mingw64\bin"

if (-not (Test-Path $nodeDir)) { throw "Node.js user install path not found." }
if (-not (Test-Path $mingwBin)) { throw "MinGW user install path not found." }

$env:PATH = "$nodeDir;$mingwBin;$env:USERPROFILE\.cargo\bin;$env:PATH"

try {
  subst "$DriveLetter`:" $repoRoot
  Set-Location "$shortPath\apps\beca-setup"
  $cfg = Get-Content "$shortPath\apps\beca-setup\src-tauri\tauri.conf.json" | ConvertFrom-Json
  $productName = [string]$cfg.productName
  $version = [string]$cfg.version

  npm install

  cargo build -p beca-bridge --release
  cargo build -p beca-flasher --release
  cargo install espflash --locked --version 4.2.0
  $esptoolVersion = "5.2.0"
  $esptoolZip = Join-Path $env:TEMP "esptool-v$esptoolVersion-windows-amd64.zip"
  $esptoolExtract = Join-Path $env:TEMP "esptool-v$esptoolVersion-windows-amd64"
  Invoke-WebRequest -Uri "https://github.com/espressif/esptool/releases/download/v$esptoolVersion/esptool-v$esptoolVersion-windows-amd64.zip" -OutFile $esptoolZip
  if (Test-Path $esptoolExtract) { Remove-Item $esptoolExtract -Recurse -Force }
  Expand-Archive -Path $esptoolZip -DestinationPath $esptoolExtract -Force
  $esptoolExe = Get-ChildItem $esptoolExtract -Recurse -Filter "esptool.exe" | Select-Object -First 1 -ExpandProperty FullName
  if (-not $esptoolExe) { throw "esptool.exe not found in downloaded archive." }

  Copy-Item "$shortPath\target\release\beca-bridge.exe" "$shortPath\apps\beca-setup\src-tauri\binaries\beca-bridge.exe" -Force
  Copy-Item "$shortPath\target\release\beca-flasher.exe" "$shortPath\apps\beca-setup\src-tauri\binaries\beca-flasher.exe" -Force
  Copy-Item "$env:USERPROFILE\.cargo\bin\espflash.exe" "$shortPath\apps\beca-setup\src-tauri\binaries\espflash.exe" -Force
  Copy-Item $esptoolExe "$shortPath\apps\beca-setup\src-tauri\binaries\esptool.exe" -Force
  Copy-Item "$shortPath\target\release\WebView2Loader.dll" "$shortPath\apps\beca-setup\src-tauri\WebView2Loader.dll" -Force

  npm run tauri build

  $dest = "$shortPath\apps\beca-setup\dist-installer\windows"
  New-Item -ItemType Directory -Force $dest | Out-Null
  $destBinaries = "$dest\binaries"
  New-Item -ItemType Directory -Force $destBinaries | Out-Null
  $nsis = Get-ChildItem "$shortPath\target\release\bundle\nsis" -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $msi = Get-ChildItem "$shortPath\target\release\bundle\msi" -Filter "*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $nsis) { throw "NSIS installer not found in target\\release\\bundle\\nsis" }
  if (-not $msi) { throw "MSI installer not found in target\\release\\bundle\\msi" }
  Copy-Item $nsis.FullName "$dest\$($nsis.Name)" -Force
  Copy-Item $msi.FullName "$dest\$($msi.Name)" -Force
  Copy-Item "$shortPath\target\release\beca-setup.exe" "$dest\BECA.exe" -Force
  Copy-Item "$shortPath\target\release\WebView2Loader.dll" "$dest\WebView2Loader.dll" -Force
  Copy-Item "$shortPath\target\release\binaries\*" "$destBinaries\" -Recurse -Force

  Write-Host "Build complete. Artifacts: $dest"
}
finally {
  Set-Location $repoRoot
  subst "$DriveLetter`:" /d | Out-Null
}
