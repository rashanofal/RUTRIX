#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing Python dependencies"
pip install -r backend/requirements.txt

echo "==> Building dashboard"
cd web-dashboard
npm ci
VITE_API_URL= npm run build
cd ..

echo "==> Copying dashboard assets"
mkdir -p backend/app/static/dashboard
cp -r web-dashboard/dist/* backend/app/static/dashboard/

mkdir -p data/uploads data/training
echo "==> Build complete"
