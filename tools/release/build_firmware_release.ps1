param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Tag = "",
  [string]$Channel = "stable",
  [string]$Repo = "fattyrecordingco/BECAfirmware",
  [string]$Environment = "esp32dev",
  [string]$Hardware = "ESP32-PICO-V3",
  [string]$OutputDir = "dist/firmware-release"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Tag)) {
  $Tag = "firmware-v$Version"
}

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

function Resolve-PythonCommand {
  foreach ($candidate in @("py", "python3", "python")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if (-not $cmd) {
      continue
    }

    & $candidate --version *> $null
    if ($LASTEXITCODE -eq 0) {
      return $candidate
    }
  }
  throw "Python 3 was not found. Install Python or enable the Windows 'py' launcher."
}

$python = Resolve-PythonCommand

Write-Host "Building firmware for env '$Environment'..."
& (Join-Path $root 'tools/build_firmware.ps1')

$buildDir = Join-Path $root ".pio/build/$Environment"
$bootloader = Join-Path $buildDir "bootloader.bin"
$partitions = Join-Path $buildDir "partitions.bin"
$firmware = Join-Path $buildDir "firmware.bin"
$configHash = (Get-FileHash -LiteralPath (Join-Path $root 'platformio.ini') -Algorithm SHA256).Hash.Substring(0, 8)
$bootApp = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "BECA-build/pio62-$configHash/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"

foreach ($file in @($bootloader, $partitions, $bootApp, $firmware)) {
  if (-not (Test-Path $file)) {
    throw "Missing expected firmware artifact: $file"
  }
}

& $python -m esptool version | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing esptool for merged image generation..."
  & $python -m pip install --disable-pip-version-check esptool
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$assetName = "beca-$Version-merged.bin"
$mergedPath = Join-Path $OutputDir $assetName

Write-Host "Merging firmware image..."
& $python -m esptool --chip esp32 merge_bin `
  -o $mergedPath `
  --flash_mode dio `
  --flash_freq 40m `
  --flash_size 4MB `
  0x1000 $bootloader `
  0x8000 $partitions `
  0xe000 $bootApp `
  0x10000 $firmware
if ($LASTEXITCODE -ne 0) { throw 'Firmware merge failed.' }

$sha256 = (Get-FileHash -Algorithm SHA256 -Path $mergedPath).Hash.ToLowerInvariant()
$manifestPath = Join-Path $OutputDir "firmware-manifest.json"

Write-Host "Generating manifest..."
& $python tools/release/generate_firmware_manifest.py `
  --repo $Repo `
  --version $Version `
  --tag $Tag `
  --channel $Channel `
  --hardware $Hardware `
  --asset-name $assetName `
  --sha256 $sha256 `
  --output $manifestPath

Write-Host "Release assets ready:"
Write-Host "  $mergedPath"
Write-Host "  $manifestPath"
Write-Host "  sha256=$sha256"
