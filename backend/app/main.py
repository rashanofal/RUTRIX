from contextlib import asynccontextmanager
from pathlib import Path
import threading

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.bootstrap import bootstrap_background, bootstrap_fast
from app.persistence import storage_status
from app.config import settings
from app.routers import audit, auth, detections, intelligence, maintenance, notifications, team
from app.models import User
from app.services.access_control import has_org_wide_detection_access, is_platform_owner
from app.services.auth_service import get_user_org_membership
from app.database import SessionLocal
from app.websocket import manager, org_id_from_ws_token, user_id_from_ws_token

STATIC_DIR = Path(__file__).resolve().parent / "static"
DASHBOARD_DIR = STATIC_DIR / "dashboard"
UPLOAD_ROOT = Path(settings.upload_dir)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Keep startup short so Hugging Face can open port 7860 (APP_STARTING → RUNNING).
    bootstrap_fast()
    threading.Thread(
        target=bootstrap_background,
        name="rutrix-bootstrap-bg",
        daemon=True,
    ).start()
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
app.include_router(audit.router)


@app.get("/api/health")
def health():
    # Keep health cheap — never load YOLO here (HF readiness probes time out otherwise).
    model_path = Path(settings.model_path)
    if not model_path.is_absolute():
        model_path = (Path(__file__).resolve().parents[1] / model_path).resolve()
        if not model_path.exists():
            model_path = Path(settings.model_path).resolve()
    store = storage_status()
    return {
        "status": "ok",
        "service": "rutrix-api",
        "version": "2.1.0",
        "upload_ready": store["upload_writable"],
        "storage": store,
        "features": {
            "unique_inspection_stats": True,
            "reports_v2": True,
            "batch_upload": True,
            "audit_log": True,
            "map_filters": True,
        },
        "platform": {
            "name": "RUTRIX",
            "edition": "municipal",
            "mobile_package": "com.rutrix.app",
        },
        "model_path": str(model_path),
        "model_loaded": model_path.exists(),
        "confidence_threshold": settings.confidence_threshold,
    }


@app.get("/api/network")
def network_info(request: Request):
    """Public mobile URL + optional LAN URLs for local WiFi testing."""
    import socket

    public_base = str(request.base_url).rstrip("/")
    public_mobile = f"{public_base}/mobile"

    host = (request.url.hostname or "").lower()
    is_local = host in {"localhost", "127.0.0.1"} or host.startswith(
        ("192.168.", "10.", "172.")
    )

    lan_ip = None
    if is_local:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
            s.close()
        except OSError:
            lan_ip = None
        if not lan_ip or lan_ip.startswith("127."):
            lan_ip = None

    payload = {
        "public_mobile": public_mobile,
        "is_local": is_local,
        "lan_ip": lan_ip,
        "mobile_http": f"http://{lan_ip}:8000/mobile" if lan_ip else None,
        "mobile_https": f"https://{lan_ip}:8443/mobile" if lan_ip else None,
        "dashboard_pc": "http://localhost:5173" if is_local else public_base,
    }
    return payload


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


def _upload_media_type(path: Path) -> str | None:
    suffix = path.suffix.lower()
    if suffix in {".mp4", ".m4v"}:
        return "video/mp4"
    if suffix == ".webm":
        return "video/webm"
    if suffix == ".mov":
        return "video/quicktime"
    if suffix == ".avi":
        return "video/x-msvideo"
    if suffix == ".mkv":
        return "video/x-matroska"
    return None


@app.get("/api/uploads/{filename}")
def serve_upload_image(filename: str):
    path = _resolve_upload_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="Image not found")
    media = _upload_media_type(path)
    return FileResponse(path, media_type=media) if media else FileResponse(path)


@app.get("/api/uploads/{org_id}/{filename}")
def serve_org_upload_image(org_id: str, filename: str):
    path = _resolve_upload_path(filename, org_id)
    if not path:
        raise HTTPException(status_code=404, detail="Image not found")
    media = _upload_media_type(path)
    return FileResponse(path, media_type=media) if media else FileResponse(path)


def _static_page(name: str) -> FileResponse:
    resp = FileResponse(STATIC_DIR / name)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    if name == "mobile.html":
        resp.headers["X-RUTRIX-Mobile-Version"] = "2.0.5"
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


@app.get("/brand/{filename}")
def dashboard_brand_asset(filename: str):
    allowed = {"logo.png", "logo-mark.png", "hero-ar.png", "hero-en.png"}
    if filename not in allowed:
        raise HTTPException(status_code=404, detail="Not found")
    for base in (DASHBOARD_DIR / "brand", STATIC_DIR):
        path = base / filename
        if path.is_file():
            resp = FileResponse(path, media_type="image/png")
            resp.headers["Cache-Control"] = "public, max-age=86400"
            return resp
    if filename in ("logo.png", "logo-mark.png"):
        return _brand_file(filename)
    raise HTTPException(status_code=404, detail="Not found")


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
    user_id = user_id_from_ws_token(token)
    if not org_id or not user_id:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
        if not user:
            await websocket.close(code=4401)
            return
        membership = get_user_org_membership(db, user_id, org_id)
        role = membership.role if membership else None
        org_wide = has_org_wide_detection_access(user, role)
    finally:
        db.close()

    await manager.connect(
        websocket,
        org_id,
        user_id=user_id,
        org_wide_access=org_wide,
    )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, org_id)
