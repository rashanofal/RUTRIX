param(
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [string]$Space = "Rashanofal8/rutrix"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path $env:TEMP "rutrix-hf-push"
$spaceUrl = "https://huggingface.co/spaces/$Space"

Write-Host "==> Logging in to Hugging Face" -ForegroundColor Cyan
$env:HF_TOKEN = $Token
huggingface-cli login --token $Token --add-to-git-credential | Out-Null

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Path $tmp | Out-Null

Write-Host "==> Cloning Space: $Space" -ForegroundColor Cyan
git clone "https://huggingface.co/spaces/$Space" $tmp 2>&1 | Out-Null

Write-Host "==> Copying project files" -ForegroundColor Cyan
Get-ChildItem $tmp -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

$exclude = @(
    ".git", "node_modules", ".venv", "venv", "__pycache__",
    "data\uploads", "data\training", "backend\certs",
    "backend\pothole.db", ".cursor", "agent-transcripts",
    "mobile\application-Android.apk", ".expo"
)

robocopy $root $tmp /E /XD $exclude /XF "*.db" "*.apk" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

Copy-Item (Join-Path $root "HF_README.md") (Join-Path $tmp "README.md") -Force

Push-Location $tmp
git config user.email "rashanofal82@gmail.com"
git config user.name "Rashanofal8"
git add -A
git status --short
git commit -m "Deploy RUTRIX Docker app (FastAPI + dashboard + ML)" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "No new changes or commit skipped" -ForegroundColor Yellow }

Write-Host "==> Pushing to Hugging Face (build starts automatically)" -ForegroundColor Cyan
git push origin main 2>&1
if ($LASTEXITCODE -ne 0) { git push origin master 2>&1 }

Pop-Location
Write-Host ""
Write-Host "Done! Open:" -ForegroundColor Green
Write-Host "  $spaceUrl"
Write-Host "  https://rashanofal8-rutrix.hf.space"
Write-Host ""
Write-Host "Build takes 15-20 minutes. Check Logs tab on the Space page." -ForegroundColor Yellow
