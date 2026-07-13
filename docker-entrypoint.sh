#!/bin/sh
set -e

# Runtime-only paths on Hugging Face (requires Storage Bucket mounted at /data).
mkdir -p /data/uploads /data/training
chmod -R 777 /data 2>/dev/null || true

echo "RUTRIX storage: DATABASE_URL=${DATABASE_URL:-unset}"
echo "RUTRIX storage: UPLOAD_DIR=${UPLOAD_DIR:-unset}"

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}" --log-level info
