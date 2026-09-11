param([string]$UploadPort = '')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cache = Join-Path $repo '.beca-cache'
$venv = Join-Path $cache 'pio-venv'
$python = Join-Path $venv 'Scripts/python.exe'
$configHash = (Get-FileHash -LiteralPath (Join-Path $repo 'platformio.ini') -Algorithm SHA256).Hash.Substring(0, 8)
# Xtensa tools cannot reliably resolve includes beyond Windows' legacy path limit.
$pioHome = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "BECA-build/pio62-$configHash"
if (-not (Test-Path -LiteralPath $python)) {
    & py -3 -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3 is required to create the build environment.' }
}
& $python -m pip install 'platformio==6.2.0' --disable-pip-version-check --quiet
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare pinned PlatformIO Core.' }

# Seed a private package cache once; another IDE cannot replace its build tools.
New-Item -ItemType Directory -Force $pioHome | Out-Null
foreach ($folder in @('platforms', 'packages')) {
    $source = Join-Path ([Environment]::GetFolderPath('UserProfile')) ".platformio/$folder"
    $target = Join-Path $pioHome $folder
    if (-not (Test-Path -LiteralPath $target)) {
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $target -Recurse }
    }
}
$oldCoreDir = $env:PLATFORMIO_CORE_DIR
$oldPackagesDir = $env:PLATFORMIO_PACKAGES_DIR
$oldPlatformsDir = $env:PLATFORMIO_PLATFORMS_DIR
try {
    $env:PLATFORMIO_CORE_DIR = $pioHome
    $env:PLATFORMIO_PACKAGES_DIR = Join-Path $pioHome 'packages'
    $env:PLATFORMIO_PLATFORMS_DIR = Join-Path $pioHome 'platforms'
    $pioArgs = @('-m', 'platformio', 'run', '--project-dir', $repo)
    if ($UploadPort) { $pioArgs += @('--target', 'upload', '--upload-port', $UploadPort) }
    & $python @pioArgs
    if ($LASTEXITCODE -ne 0) { throw 'Firmware build/upload failed; see output above.' }
} finally {
    $env:PLATFORMIO_CORE_DIR = $oldCoreDir
    $env:PLATFORMIO_PACKAGES_DIR = $oldPackagesDir
    $env:PLATFORMIO_PLATFORMS_DIR = $oldPlatformsDir
}
