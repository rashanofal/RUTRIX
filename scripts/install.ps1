# Pothole Detection - Full Installation Script (Windows)
# Run: powershell -ExecutionPolicy Bypass -File scripts\install.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"

Write-Host "=== Pothole Detection - Installation ===" -ForegroundColor Cyan

# 1. Python PATH
if (Test-Path $Python312) {
    $pyDir = Split-Path $Python312
    $env:Path = "$pyDir;$pyDir\Scripts;" + $env:Path
    Write-Host "[OK] Python 3.12 found" -ForegroundColor Green
} else {
    Write-Host "[!] Python 3.12 not found. Install via: winget install Python.Python.3.12" -ForegroundColor Yellow
    exit 1
}

# 2. Backend venv + deps
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
Push-Location "$ProjectRoot\backend"
if (-not (Test-Path ".venv")) {
    & $Python312 -m venv .venv
}
& ".\.venv\Scripts\pip.exe" install -r requirements.txt -q
& ".\.venv\Scripts\pip.exe" install -r ..\ml\requirements.txt -q
& ".\.venv\Scripts\pip.exe" install -e ..\edge-sdk -q
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}
Pop-Location
Write-Host "[OK] Backend installed" -ForegroundColor Green

# 3. Download YOLO model
Write-Host "Downloading AI model..." -ForegroundColor Cyan
Push-Location "$ProjectRoot\backend"
& ".\.venv\Scripts\python.exe" -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
if (Test-Path "yolov8n.pt") {
    Copy-Item "yolov8n.pt" "..\ml\models\pothole_yolov8n.pt" -Force
}
Pop-Location
Write-Host "[OK] Model ready" -ForegroundColor Green

# 4. Web dashboard
Write-Host "Installing web dashboard..." -ForegroundColor Cyan
Push-Location "$ProjectRoot\web-dashboard"
npm install --silent
Pop-Location
Write-Host "[OK] Web dashboard installed" -ForegroundColor Green

# 5. Mobile app
Write-Host "Installing mobile app..." -ForegroundColor Cyan
Push-Location "$ProjectRoot\mobile"
npm install --silent
Pop-Location
Write-Host "[OK] Mobile app installed" -ForegroundColor Green

# 6. Docker PostGIS
$dockerBin = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path $dockerBin) {
    $env:Path = "$dockerBin;" + $env:Path
    Write-Host "Starting PostGIS (Docker)..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Docker Desktop not running. Start it manually, then run:" -ForegroundColor Yellow
        Write-Host "    docker compose up -d db" -ForegroundColor Yellow
    } else {
        docker compose up -d db
        Write-Host "[OK] PostGIS started on port 5432" -ForegroundColor Green
    }
    Pop-Location
} else {
    Write-Host "[!] Docker not installed. Install via: winget install Docker.DockerDesktop" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Green
Write-Host "Start API:      cd backend; .\.venv\Scripts\uvicorn app.main:app --reload --port 8000"
Write-Host "Start Dashboard: cd web-dashboard; npm run dev"
Write-Host "Start Mobile:    cd mobile; npx expo start"
Write-Host ""
Write-Host "Note: Use full Python path if 'python' command fails:"
Write-Host "  $Python312"
