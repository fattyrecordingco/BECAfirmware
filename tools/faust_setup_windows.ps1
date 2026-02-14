$ErrorActionPreference = 'Stop'

Write-Host "[faust-setup] Checking for Faust..."
if (Get-Command faust -ErrorAction SilentlyContinue) {
  Write-Host "[faust-setup] Faust already installed: $(faust -v 2>$null)"
  exit 0
}

function Try-Install($name, $scriptBlock) {
  Write-Host "[faust-setup] Trying $name..."
  try {
    & $scriptBlock
    if ($LASTEXITCODE -eq 0 -and (Get-Command faust -ErrorAction SilentlyContinue)) {
      Write-Host "[faust-setup] Installed with $name"
      exit 0
    }
  } catch {
    Write-Host "[faust-setup] $name failed: $($_.Exception.Message)"
  }
}

if (Get-Command winget -ErrorAction SilentlyContinue) {
  Try-Install "winget" { winget install --id Grame.Faust -e --accept-source-agreements --accept-package-agreements }
}

if (Get-Command choco -ErrorAction SilentlyContinue) {
  Try-Install "choco" { choco install faust -y }
}

Write-Host "[faust-setup] Automatic install failed."
Write-Host "[faust-setup] Manual options:"
Write-Host "  1) winget install --id Grame.Faust -e"
Write-Host "  2) choco install faust -y"
exit 1
