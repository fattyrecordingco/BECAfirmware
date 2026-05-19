param(
  [string]$Repo = "fattyrecordingco/BECAfirmware",
  [string]$TagPrefix = "setup-v",
  [string]$Tag = "",
  [string]$OutputRoot = "installers",
  [switch]$Clean,
  [switch]$RequireAllPlatforms
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot $OutputRoot

function Get-InstallerPlatform([string]$Name) {
  $lower = $Name.ToLowerInvariant()
  if ($lower -like "*.dmg") { return "macos" }
  if ($lower -like "*.appimage" -or $lower -like "*.deb") { return "linux" }
  if ($lower -like "*.exe" -or $lower -like "*.msi" -or $lower -like "*.zip" -or $lower -eq "webview2loader.dll") {
    return "windows"
  }
  return $null
}

$platformDirs = @{
  windows = Join-Path $outputDir "windows"
  macos   = Join-Path $outputDir "macos"
  linux   = Join-Path $outputDir "linux"
}

foreach ($dir in $platformDirs.Values) {
  New-Item -ItemType Directory -Force $dir | Out-Null
}

if ($Clean) {
  foreach ($dir in $platformDirs.Values) {
    Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -ne ".gitkeep" -and $_.Name -ne "README.md" } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }
}

$releasesUri = "https://api.github.com/repos/$Repo/releases?per_page=100"
$releases = Invoke-RestMethod -Uri $releasesUri

if ($Tag) {
  $release = $releases |
    Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name -eq $Tag } |
    Select-Object -First 1
}
else {
  $release = $releases |
    Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name -like "$TagPrefix*" } |
    Sort-Object { [datetime]$_.published_at } -Descending |
    Select-Object -First 1
}

if (-not $release) {
  if ($Tag) {
    throw "No published release found in $Repo for tag '$Tag'."
  }
  throw "No published release found in $Repo with tag prefix '$TagPrefix'. Publish setup release first."
}

$downloads = @()
$platformCounts = @{
  windows = 0
  macos   = 0
  linux   = 0
}

foreach ($asset in $release.assets) {
  $platform = Get-InstallerPlatform -Name $asset.name
  if (-not $platform) { continue }

  $destination = Join-Path $platformDirs[$platform] $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $destination

  $platformCounts[$platform]++
  $downloads += [PSCustomObject]@{
    Platform = $platform
    File     = $destination
    SizeMB   = [math]::Round(($asset.size / 1MB), 2)
  }
}

foreach ($platform in $platformDirs.Keys) {
  $dir = $platformDirs[$platform]
  $files = Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne ".gitkeep" -and $_.Name -ne "README.md" -and $_.Name -ne "SHA256SUMS" } |
    Sort-Object Name
  $sumPath = Join-Path $dir "SHA256SUMS"
  if ($files.Count -gt 0) {
    $lines = foreach ($file in $files) {
      $hash = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash.ToLowerInvariant()
      "$hash  $($file.Name)"
    }
    Set-Content -Path $sumPath -Value $lines -Encoding ascii
  }
}

if ($downloads.Count -eq 0) {
  throw "Release '$($release.tag_name)' does not contain installer files for Windows/macOS/Linux."
}

if ($RequireAllPlatforms) {
  $missing = @()
  foreach ($platform in $platformCounts.Keys) {
    if ($platformCounts[$platform] -eq 0) {
      $missing += $platform
    }
  }

  if ($missing.Count -gt 0) {
    throw "Release '$($release.tag_name)' is missing installer assets for: $($missing -join ', ')."
  }
}

Write-Host "Synced installer assets from release '$($release.tag_name)' into '$OutputRoot':"
$downloads |
  Sort-Object Platform, File |
  Format-Table -AutoSize
