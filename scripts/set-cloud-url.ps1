param(
    [Parameter(Mandatory = $true)]
    [string]$Url
)

$Url = $Url.TrimEnd("/")
$root = Split-Path $PSScriptRoot -Parent

Write-Host "Setting cloud URL: $Url" -ForegroundColor Cyan

# mobile app.json
$appJson = Join-Path $root "mobile\app.json"
$app = Get-Content $appJson -Raw | ConvertFrom-Json
$app.expo.extra.apiUrl = $Url
$app | ConvertTo-Json -Depth 20 | Set-Content $appJson -Encoding UTF8

# eas.json preview + production
$easPath = Join-Path $root "mobile\eas.json"
$eas = Get-Content $easPath -Raw | ConvertFrom-Json
$eas.build.preview.env.EXPO_PUBLIC_API_URL = $Url
$eas.build.production.env.EXPO_PUBLIC_API_URL = $Url
$eas | ConvertTo-Json -Depth 20 | Set-Content $easPath -Encoding UTF8

# mobile web secure link hint
$mobileHtml = Join-Path $root "backend\app\static\mobile.html"
$html = Get-Content $mobileHtml -Raw -Encoding UTF8
$html = $html -replace 'id="pcMapLink" href="#"', "id=`"pcMapLink`" href=`"$Url`""

Write-Host ""
Write-Host "Done! URLs updated:" -ForegroundColor Green
Write-Host "  Dashboard:  $Url"
Write-Host "  Mobile web: $Url/mobile"
Write-Host "  API health: $Url/api/health"
Write-Host ""
Write-Host "Next: run بناء_التطبيق.bat for APK/iOS" -ForegroundColor Yellow
