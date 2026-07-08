# ── Stage 1: Dashboard (React) ──
FROM node:20-alpine AS dashboard
WORKDIR /dash
COPY web-dashboard/package.json web-dashboard/package-lock.json* ./
RUN npm install --omit=dev=false
COPY web-dashboard/ .
ENV VITE_API_URL=
RUN npm run build

# ── Stage 2: API + ML + static mobile ──
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 curl fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
RUN mkdir -p ml/models \
    && curl -fsSL -o ml/models/pothole_yolov8n.pt \
      "https://github.com/rashanofal/RUTRIX/raw/main/ml/models/pothole_yolov8n.pt"
COPY --from=dashboard /dash/dist ./app/static/dashboard

RUN mkdir -p /app/data/uploads /app/data/training /tmp/uploads /tmp/training /tmp/hf_cache

ENV PYTHONPATH=/app
ENV PORT=7860
ENV HF_HOME=/tmp/hf_cache
ENV TORCH_HOME=/tmp/hf_cache/torch
ENV DATABASE_URL=sqlite:////tmp/pothole.db
ENV MODEL_PATH=/app/ml/models/pothole_yolov8n.pt
ENV UPLOAD_DIR=/tmp/uploads
ENV TRAINING_DIR=/tmp/training
ENV CORS_ORIGINS=*
ENV SEED_DEMO_ACCOUNT=true

EXPOSE 7860

CMD ["sh", "-c", "echo 'Starting RUTRIX on port' ${PORT:-7860} && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860} --log-level info"]
