$api = "http://localhost:8000/api/detections/clear"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Clear map - delete all pins and images" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

try {
    $res = Invoke-RestMethod -Uri $api -Method Delete -TimeoutSec 30
    Write-Host "[OK] $($res.message)" -ForegroundColor Green
    Write-Host "  detections: $($res.detections_deleted)" -ForegroundColor Gray
    Write-Host "  uploads:    $($res.uploads_deleted)" -ForegroundColor Gray
    Write-Host "  files:      $($res.files_deleted)" -ForegroundColor Gray
} catch {
    Write-Host "[!] Failed - run START.bat first" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
