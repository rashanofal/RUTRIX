$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $ProjectRoot "backend"
$Dashboard = Join-Path $ProjectRoot "web-dashboard"
$VenvPython = Join-Path $Backend ".venv\Scripts\uvicorn.exe"
$ModelDst = Join-Path $ProjectRoot "ml\models\pothole_yolov8n.pt"
$ModelSources = @(
    "F:\F\تطبيقات AI\holes\hole_model.pt",
    "F:\F\holes\hole_model.pt"
)
$ModelSrc = $null
foreach ($src in $ModelSources) {
    if (Test-Path $src) { $ModelSrc = Get-Item $src; break }
}
if (-not $ModelSrc) {
    $ModelSrc = Get-ChildItem "F:\F" -Recurse -Filter "hole_model.pt" -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Stop-Port($port) {
    1..3 | ForEach-Object {
        Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
        netstat -ano | Select-String ":$port\s" | ForEach-Object {
            $procId = ($_ -split '\s+')[-1]
            if ($procId -match '^\d+$' -and $procId -ne '0') {
                taskkill /F /PID $procId 2>$null | Out-Null
            }
        }
        Start-Sleep -Milliseconds 500
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pothole Detection - Starting..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($ModelSrc) {
    $copy = $false
    if (-not (Test-Path $ModelDst)) { $copy = $true }
    elseif ($ModelSrc.LastWriteTime -gt (Get-Item $ModelDst).LastWriteTime) { $copy = $true }
    if ($copy) {
        Copy-Item $ModelSrc.FullName $ModelDst -Force
        Write-Host '[OK] Trained model updated' -ForegroundColor Green
    } else {
        Write-Host '[OK] Using trained model' -ForegroundColor Green
    }
} else {
    Write-Host '[!] hole_model.pt not found - using existing model' -ForegroundColor Yellow
}

$VenvPip = Join-Path $Backend ".venv\Scripts\pip.exe"
if (Test-Path $VenvPip) {
    & $VenvPip install python-jose[cryptography] passlib[bcrypt] "bcrypt==4.0.1" pillow-heif exifread arabic-reshaper python-bidi -q 2>$null
}

Write-Host "Stopping old servers..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "stop-all.ps1")
Start-Sleep -Seconds 2

$ip = (ipconfig | Select-String "IPv4" | ForEach-Object { ($_ -split ":")[-1].Trim() } | Where-Object { $_ -like "192.168.*" } | Select-Object -First 1)
if (-not $ip) { $ip = "192.168.3.105" }

$VenvPy = Join-Path $Backend ".venv\Scripts\python.exe"
& $VenvPy (Join-Path $PSScriptRoot "gen_ssl.py") $ip --force 2>$null

Write-Host '[1/3] API for PC (HTTP :8000)...' -ForegroundColor Yellow
Start-Process cmd -ArgumentList @(
    "/k", "title Backend-PC && cd /d `"$Backend`" && `"$VenvPython`" app.main:app --host 0.0.0.0 --port 8000"
) -WindowStyle Normal

Start-Sleep -Seconds 5

Write-Host '[2/3] API for iPhone (HTTPS :8443)...' -ForegroundColor Yellow
Start-Process cmd -ArgumentList @(
    "/k", "title Backend-iPhone && cd /d `"$Backend`" && `"$VenvPython`" app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem"
) -WindowStyle Normal

Start-Sleep -Seconds 5

Write-Host '[3/3] Dashboard...' -ForegroundColor Yellow
Start-Process cmd -ArgumentList @(
    "/k", "title Dashboard && cd /d `"$Dashboard`" && npm run dev -- --host"
) -WindowStyle Normal

Start-Sleep -Seconds 8

try {
    $health = Invoke-RestMethod "http://127.0.0.1:8000/api/health" -TimeoutSec 8
    $hasFeatures = $health.features.unique_inspection_stats -eq $true
    if ($health.version -ge '2.0.1' -and $hasFeatures) {
        Write-Host '[OK] HTTP :8000 ready (RUTRIX v2.0.1 + updated stats)' -ForegroundColor Green
    } elseif ($health.version -eq '2.0.0' -or -not $hasFeatures) {
        Write-Host '[!] HTTP :8000 is OLD code — close ALL Backend windows and run START.bat again' -ForegroundColor Red
    } else {
        Write-Host "[OK] HTTP :8000 ready (version $($health.version))" -ForegroundColor Green
    }
} catch {
    Write-Host '[!] HTTP :8000 not ready' -ForegroundColor Red
}

try {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $h8443 = Invoke-RestMethod "https://localhost:8443/api/health" -TimeoutSec 5
    if ($h8443.version -eq '2.0.0') {
        Write-Host '[OK] HTTPS :8443 ready (iPhone GPS)' -ForegroundColor Green
    }
} catch {
    Write-Host '[!] HTTPS :8443 NOT ready - run firewall bat as Admin' -ForegroundColor Red
}

Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  READY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  PC (no warning):  http://localhost:5173" -ForegroundColor Green
Write-Host "  Login: demo@pothole.app / demo1234"
Write-Host ""
Write-Host "  Phone (same WiFi): http://${ip}:8000/mobile" -ForegroundColor Green
Write-Host "  Android / browser mobile app" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
