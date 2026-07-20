param(
  [string]$Url = "https://rashanofal8-rutrix.hf.space"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $root "mobile"

if (-not (Test-Path $mobileDir)) {
  Write-Error "mobile folder not found"
}

$apiUrl = $Url.TrimEnd("/")
& (Join-Path $PSScriptRoot "build-mobile.ps1") -Url $apiUrl

Write-Host ""
Write-Host "=== RUTRIX Google Play production build ==="
Write-Host "Profile: production (Android App Bundle)"
Write-Host "API URL: $apiUrl"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. cd mobile"
Write-Host "  2. npx eas-cli build -p android --profile production"
Write-Host "  3. Place google-service-account.json in mobile/ (see mobile/PLAY_STORE.md)"
Write-Host "  4. npx eas-cli submit -p android --profile production"
Write-Host ""

Push-Location $mobileDir
try {
  npx eas-cli build -p android --profile production --non-interactive
} finally {
  Pop-Location
}
