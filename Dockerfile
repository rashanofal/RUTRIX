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
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY ml/models ./ml/models
COPY --from=dashboard /dash/dist ./app/static/dashboard

RUN mkdir -p /app/data/uploads /app/data/training

ENV PYTHONPATH=/app
ENV PORT=8000
ENV DATABASE_URL=sqlite:////app/data/pothole.db
ENV MODEL_PATH=/app/ml/models/pothole_yolov8n.pt
ENV UPLOAD_DIR=/app/data/uploads
ENV TRAINING_DIR=/app/data/training
ENV CORS_ORIGINS=*
ENV SEED_DEMO_ACCOUNT=true

EXPOSE 8000

    CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
