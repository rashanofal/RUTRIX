$root = Split-Path $PSScriptRoot -Parent
$dash = Join-Path $root "web-dashboard"
$out = Join-Path $root "backend\app\static\dashboard"

Write-Host "Building dashboard..." -ForegroundColor Cyan
Push-Location $dash
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
Copy-Item (Join-Path $dash "dist\*") $out -Recurse
Write-Host "[OK] Dashboard copied to backend/app/static/dashboard" -ForegroundColor Green
