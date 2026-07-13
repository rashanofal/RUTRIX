from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.bootstrap import bootstrap
from app.persistence import storage_status
from app.config import settings
from app.routers import auth, detections, intelligence, maintenance, notifications, team
from app.services.inference import get_model_info
from app.websocket import manager, org_id_from_ws_token

STATIC_DIR = Path(__file__).resolve().parent / "static"
DASHBOARD_DIR = STATIC_DIR / "dashboard"
UPLOAD_ROOT = Path(settings.upload_dir)


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap()
    yield


app = FastAPI(
    title="RUTRIX API",
    description="RUTRIX — Road Infrastructure Intelligence & Asset Management Platform",
    version="2.0.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(detections.router)
app.include_router(intelligence.router)
app.include_router(maintenance.router)
app.include_router(notifications.router)
app.include_router(notifications.push_router)
app.include_router(team.router)


@app.get("/api/health")
def health():
    model = get_model_info()
    store = storage_status()
    return {
        "status": "ok",
        "service": "rutrix-api",
        "version": "2.0.2",
        "upload_ready": store["upload_writable"],
        "storage": store,
        "features": {
            "unique_inspection_stats": True,
            "reports_v2": True,
            "persistent_storage_recommended": store["ephemeral_warning"],
        },
        "model": model.get("classes", {}),
        "confidence_threshold": model.get("confidence_threshold"),
        "model_loaded": model.get("exists", False),
    }


@app.get("/api/network")
def network_info():
    """LAN IP for iPhone QR codes (never use localhost on phone)."""
    import socket

    lan_ip = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except OSError:
        pass

    if not lan_ip or lan_ip.startswith("127."):
        lan_ip = "192.168.3.105"

    return {
        "lan_ip": lan_ip,
        "mobile_http": f"http://{lan_ip}:8000/mobile",
        "mobile_https": f"https://{lan_ip}:8443/mobile",
        "dashboard_pc": "http://localhost:5173",
    }


@app.get("/api/info")
def info():
    return {
        "mobile_url": "/mobile",
        "health": "/api/health",
        "auth": "/api/auth/login",
        "dashboard": "Configure VITE_API_URL for production",
    }


def _resolve_upload_path(filename: str, org_id: str | None = None) -> Path | None:
    safe = Path(filename).name
    candidates = []
    if org_id:
        candidates.append(UPLOAD_ROOT / org_id / safe)
    candidates.append(UPLOAD_ROOT / safe)
    if UPLOAD_ROOT.exists():
        for sub in UPLOAD_ROOT.iterdir():
            if sub.is_dir():
                candidates.append(sub / safe)
    for path in candidates:
        if path.is_file():
            return path
    return None


@app.get("/api/uploads/{filename}")
def serve_upload_image(filename: str):
    path = _resolve_upload_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@app.get("/api/uploads/{org_id}/{filename}")
def serve_org_upload_image(org_id: str, filename: str):
    path = _resolve_upload_path(filename, org_id)
    if not path:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


def _static_page(name: str) -> FileResponse:
    resp = FileResponse(STATIC_DIR / name)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp


@app.get("/mobile")
def mobile_page():
    return _static_page("mobile.html")


def _brand_file(name: str) -> FileResponse:
    path = STATIC_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Logo not found")
    resp = FileResponse(path, media_type="image/png")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.get("/logo.png")
def brand_logo():
    return _brand_file("logo.png")


@app.get("/logo-mark.png")
def brand_logo_mark():
    return _brand_file("logo-mark.png")


def _static_asset(name: str, media_type: str | None = None) -> FileResponse:
    path = STATIC_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    resp = FileResponse(path, media_type=media_type)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.get("/manifest.webmanifest")
def root_web_manifest():
    dash_manifest = DASHBOARD_DIR / "manifest.webmanifest"
    if dash_manifest.is_file():
        resp = FileResponse(dash_manifest, media_type="application/manifest+json")
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp
    return _static_asset("manifest.webmanifest", "application/manifest+json")


@app.get("/icon-192.png")
@app.get("/icon-512.png")
def root_pwa_icons(request: Request):
    name = Path(request.url.path).name
    dash_icon = DASHBOARD_DIR / name
    if dash_icon.is_file():
        resp = FileResponse(dash_icon, media_type="image/png")
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp
    return _static_asset(name, "image/png")


@app.get("/apple-touch-icon.png")
@app.get("/apple-touch-icon-precomposed.png")
def apple_touch_icon():
    return _static_asset("apple-touch-icon.png", "image/png")


@app.get("/favicon.png")
def favicon_png():
    return _static_asset("favicon.png", "image/png")


@app.get("/static/manifest.webmanifest")
def mobile_web_manifest():
    return _static_asset("manifest.webmanifest", "application/manifest+json")


@app.get("/static/{asset_name}")
def static_brand_assets(asset_name: str):
    allowed = {
        "logo.png",
        "logo-mark.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "favicon.png",
    }
    if asset_name not in allowed:
        raise HTTPException(status_code=404, detail="Not found")
    media = "application/manifest+json" if asset_name.endswith(".webmanifest") else None
    return _static_asset(asset_name, media)


def _is_mobile_client(request: Request) -> bool:
    ua = request.headers.get("user-agent", "").lower()
    return any(k in ua for k in ("iphone", "ipad", "ipod", "android", "mobile"))


def _dashboard_index() -> FileResponse:
    index = DASHBOARD_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Dashboard not built")
    resp = FileResponse(index)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp


if (DASHBOARD_DIR / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=DASHBOARD_DIR / "assets"),
        name="dashboard_assets",
    )


@app.get("/")
def root(request: Request):
    if _is_mobile_client(request) and (STATIC_DIR / "mobile.html").is_file():
        return _static_page("mobile.html")
    if (DASHBOARD_DIR / "index.html").is_file():
        return _dashboard_index()
    return {
        "message": "RUTRIX API",
        "health": "/api/health",
        "mobile": "/mobile",
        "auth": "/api/auth/login",
    }


@app.get("/{spa_path:path}")
def dashboard_spa_fallback(spa_path: str):
    """Serve dashboard SPA routes (production). API routes are registered above."""
    if spa_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    if spa_path in ("mobile", "ws", "ws/detections"):
        raise HTTPException(status_code=404, detail="Not found")
    if spa_path.startswith("api/uploads/") or spa_path.startswith("static/"):
        raise HTTPException(status_code=404, detail="Not found")

    brand_name = Path(spa_path).name
    if brand_name in ("logo.png", "logo-mark.png") and (STATIC_DIR / brand_name).is_file():
        return _brand_file(brand_name)

    if not (DASHBOARD_DIR / "index.html").is_file():
        raise HTTPException(status_code=404, detail="Not found")

    asset = DASHBOARD_DIR / spa_path
    if asset.is_file():
        return FileResponse(asset)
    return _dashboard_index()


@app.websocket("/ws/detections")
async def websocket_detections(
    websocket: WebSocket,
    token: str | None = Query(None),
):
    org_id = org_id_from_ws_token(token)
    if not org_id:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket, org_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, org_id)
