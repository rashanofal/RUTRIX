#!/bin/sh
# Unbuffered logs so Hugging Face shows progress immediately.
export PYTHONUNBUFFERED=1

echo "===== RUTRIX entrypoint ====="
date -u +"%Y-%m-%dT%H:%M:%SZ"

# Prefer /data when a Storage Bucket is mounted; otherwise use /app/data.
DATA_ROOT="/app/data"
if [ -d /data ] || mkdir -p /data 2>/dev/null; then
  if mkdir -p /data/uploads /data/training 2>/dev/null \
    && touch /data/.rutrix_write_ok 2>/dev/null; then
    rm -f /data/.rutrix_write_ok 2>/dev/null || true
    DATA_ROOT="/data"
    echo "RUTRIX storage root: /data (writable)"
  else
    echo "RUTRIX warning: /data not writable — falling back to /app/data"
  fi
else
  echo "RUTRIX warning: cannot create /data — falling back to /app/data"
fi

mkdir -p "${DATA_ROOT}/uploads" "${DATA_ROOT}/training"
chmod -R 777 "${DATA_ROOT}" 2>/dev/null || true

export DATABASE_URL="${DATABASE_URL:-sqlite:////${DATA_ROOT#/}/pothole.db}"
# Normalize when DATA_ROOT is absolute:
case "${DATABASE_URL}" in
  sqlite:////data/*|sqlite:////app/data/*) ;;
  *)
    export DATABASE_URL="sqlite:///${DATA_ROOT}/pothole.db"
    ;;
esac
export UPLOAD_DIR="${DATA_ROOT}/uploads"
export TRAINING_DIR="${DATA_ROOT}/training"

# If Dockerfile baked /data paths but mount is broken, override to working root.
if [ "${DATA_ROOT}" = "/app/data" ]; then
  export DATABASE_URL="sqlite:////app/data/pothole.db"
  export UPLOAD_DIR="/app/data/uploads"
  export TRAINING_DIR="/app/data/training"
fi

echo "RUTRIX storage: DATABASE_URL=${DATABASE_URL}"
echo "RUTRIX storage: UPLOAD_DIR=${UPLOAD_DIR}"
echo "RUTRIX starting uvicorn on 0.0.0.0:${PORT:-7860}..."

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}" --log-level info
