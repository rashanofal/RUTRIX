# ── Stage 1: Dashboard (React) ──
FROM node:20-alpine AS dashboard
WORKDIR /dash
COPY web-dashboard/package.json web-dashboard/package-lock.json* ./
RUN npm install --omit=dev=false
COPY web-dashboard/ .
# Brand assets may be omitted from the HF Space repo (binary push limits).
# Prefer local copies when present; otherwise download from GitHub.
RUN apk add --no-cache curl \
    && mkdir -p public/brand \
    && for f in hero-ar.png hero-en.png logo.png logo-mark.png; do \
         if [ ! -s "public/brand/$f" ]; then \
           curl -fsSL -o "public/brand/$f" \
             "https://raw.githubusercontent.com/rashanofal/RUTRIX/main/web-dashboard/public/brand/$f"; \
         fi; \
       done \
    && test -s public/brand/logo.png \
    && test -s public/brand/logo-mark.png
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
RUN mkdir -p ml/models app/static \
    && curl -fsSL -o ml/models/pothole_yolov8n.pt \
      "https://raw.githubusercontent.com/rashanofal/RUTRIX/main/ml/models/pothole_yolov8n.pt" \
    && if [ ! -s app/static/logo.png ]; then \
         curl -fsSL -o app/static/logo.png \
           "https://raw.githubusercontent.com/rashanofal/RUTRIX/main/backend/app/static/logo.png"; \
       fi \
    && if [ ! -s app/static/logo-mark.png ]; then \
         curl -fsSL -o app/static/logo-mark.png \
           "https://raw.githubusercontent.com/rashanofal/RUTRIX/main/backend/app/static/logo-mark.png"; \
       fi \
    && test -s ml/models/pothole_yolov8n.pt \
    && test -s app/static/logo.png
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
