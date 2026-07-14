param(
    [string]$Token,
    [string]$Space = "Rashanofal8/rutrix"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path $env:TEMP "rutrix-hf-push"
$spaceUrl = "https://huggingface.co/spaces/$Space"

if ($Token) {
    Write-Host "==> Logging in to Hugging Face" -ForegroundColor Cyan
    $env:HF_TOKEN = $Token
    huggingface-cli login --token $Token --add-to-git-credential | Out-Null
} else {
    $who = huggingface-cli whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Not logged in to Hugging Face. Pass -Token or run: huggingface-cli login"
    }
    Write-Host "==> Using existing Hugging Face login ($who)" -ForegroundColor Cyan
}

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Path $tmp | Out-Null

Write-Host "==> Cloning Space: $Space" -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git clone "https://huggingface.co/spaces/$Space" $tmp 2>&1 | ForEach-Object {
    if ($_ -match '^(Cloning|remote:|Receiving|Resolving)') { Write-Host $_ }
}
$ErrorActionPreference = $prevEap
if (-not (Test-Path (Join-Path $tmp ".git"))) {
    throw "Failed to clone Hugging Face Space: $Space"
}

Write-Host "==> Copying project files" -ForegroundColor Cyan
Get-ChildItem $tmp -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

robocopy $root $tmp /E /XD ".git" "node_modules" ".venv" "venv" "__pycache__" "data\uploads" "data\training" "backend\certs" ".cursor" "agent-transcripts" ".expo" "scripts\node_modules" /XF "*.db" "*.apk" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

$strip = @(
    "backend\app\assets\fonts",
    "backend\app\static\dashboard",
    "ml\models\pothole_yolov8n.pt",
    "mobile\assets\icon.png",
    "mobile\assets\adaptive-icon.png",
    "mobile\assets\splash-icon.png",
    "mobile\assets\logo.png",
    "mobile\assets\logo-mark.png",
    "backend\app\static\apple-touch-icon.png",
    "backend\app\static\favicon.png",
    "backend\app\static\icon-192.png",
    "backend\app\static\icon-512.png",
    "backend\app\static\logo.png",
    "backend\app\static\logo-mark.png",
    "web-dashboard\public\apple-touch-icon.png",
    "web-dashboard\public\favicon.png",
    "web-dashboard\public\icon-192.png",
    "web-dashboard\public\icon-512.png",
    "web-dashboard\public\brand\hero-ar.png",
    "web-dashboard\public\brand\hero-en.png",
    "web-dashboard\public\brand\logo.png",
    "web-dashboard\public\brand\logo-mark.png",
    "نشر_HuggingFace.txt"
)
foreach ($rel in $strip) {
    $path = Join-Path $tmp $rel
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}

Copy-Item (Join-Path $root "HF_README.md") (Join-Path $tmp "README.md") -Force

Push-Location $tmp
git config user.email "rashanofal82@gmail.com"
git config user.name "Rashanofal8"
git add -A
git status --short
git commit -m "Deploy RUTRIX Docker app (FastAPI + dashboard + ML)" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "No new changes or commit skipped" -ForegroundColor Yellow }

Write-Host "==> Pushing to Hugging Face (build starts automatically)" -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
git push origin main 2>&1
if ($LASTEXITCODE -ne 0) { git push origin master 2>&1 }
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) { throw "Hugging Face git push failed" }

Pop-Location
Write-Host ""
Write-Host "Done! Open:" -ForegroundColor Green
Write-Host "  $spaceUrl"
Write-Host "  https://rashanofal8-rutrix.hf.space"
Write-Host ""
Write-Host "Build takes 15-20 minutes. Check Logs tab on the Space page." -ForegroundColor Yellow
