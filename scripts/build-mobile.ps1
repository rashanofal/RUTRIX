param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $root "mobile"

if (-not (Test-Path $mobileDir)) {
  Write-Error "mobile folder not found"
}

$apiUrl = $Url.TrimEnd("/")
$appJsonPath = Join-Path $mobileDir "app.json"
$easJsonPath = Join-Path $mobileDir "eas.json"

$appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
$appJson.expo.extra.apiUrl = $apiUrl
$appJson | ConvertTo-Json -Depth 20 | Set-Content $appJsonPath -Encoding UTF8

$easJson = Get-Content $easJsonPath -Raw | ConvertFrom-Json
foreach ($profile in @("preview", "preview-ios", "production")) {
  if ($easJson.build.PSObject.Properties.Name -contains $profile) {
    if (-not $easJson.build.$profile.env) {
      $easJson.build.$profile | Add-Member -NotePropertyName env -NotePropertyValue @{}
    }
    $easJson.build.$profile.env.EXPO_PUBLIC_API_URL = $apiUrl
  }
}
$easJson | ConvertTo-Json -Depth 20 | Set-Content $easJsonPath -Encoding UTF8

$envPath = Join-Path $mobileDir ".env"
"EXPO_PUBLIC_API_URL=$apiUrl" | Set-Content $envPath -Encoding UTF8

Write-Host "RUTRIX mobile API URL set to: $apiUrl"
Write-Host "Run: cd mobile && npx eas-cli build -p android --profile preview"
