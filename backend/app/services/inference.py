from pathlib import Path

import numpy as np
from PIL import Image

from app.config import settings

_model = None
_model_path_loaded: str | None = None


def reload_model() -> None:
    global _model, _model_path_loaded
    _model = None
    _model_path_loaded = None


def get_model():
    global _model, _model_path_loaded
    from ultralytics import YOLO

    model_path = Path(settings.model_path)
    if not model_path.is_absolute():
        model_path = (Path(__file__).resolve().parents[2] / model_path).resolve()
        if not model_path.exists():
            model_path = Path(settings.model_path).resolve()

    path_str = str(model_path)
    if _model is None or _model_path_loaded != path_str:
        if not model_path.exists():
            _model = YOLO("yolov8n.pt")
        else:
            _model = YOLO(path_str)
        _model_path_loaded = path_str
    return _model


CLASS_NAMES = {0: "pothole", 1: "crack", 2: "patch"}


def filter_detections(detections: list[dict], min_conf: float | None = None) -> list[dict]:
    """Drop low-confidence / tiny boxes that cause false pothole alerts."""
    threshold = min_conf if min_conf is not None else settings.confidence_threshold
    filtered: list[dict] = []
    for det in detections:
        conf = float(det.get("confidence", 0))
        if conf < threshold:
            continue
        w = float(det.get("w", 0))
        h = float(det.get("h", 0))
        if w * h < 600:  # ignore tiny boxes — common false positives
            continue
        name = str(det.get("class_name", "pothole")).lower()
        if name not in ("pothole", "crack", "patch"):
            continue
        if name == "pothole" and conf < max(threshold, 0.62):
            continue
        filtered.append(det)
    return filtered


def get_model_info() -> dict:
    model_path = Path(settings.model_path)
    if not model_path.is_absolute():
        model_path = (Path(__file__).resolve().parents[2] / model_path).resolve()
    info = {
        "path": str(model_path),
        "exists": model_path.exists(),
        "confidence_threshold": settings.confidence_threshold,
    }
    if model_path.exists():
        info["size_mb"] = round(model_path.stat().st_size / 1_000_000, 2)
        info["modified"] = model_path.stat().st_mtime
    try:
        model = get_model()
        info["classes"] = dict(model.names) if hasattr(model, "names") else {}
    except Exception as exc:
        info["load_error"] = str(exc)
    return info


def run_inference(image_path: str, conf: float | None = None) -> list[dict]:
    """Run YOLO inference and return detections."""
    model = get_model()
    threshold = conf or settings.confidence_threshold
    results = model.predict(source=image_path, conf=threshold, verbose=False)

    detections = []
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            cls_id = int(box.cls[0])
            class_name = result.names.get(cls_id, CLASS_NAMES.get(cls_id, "pothole"))
            xywh = box.xywh[0].tolist()
            detections.append(
                {
                    "x": xywh[0] - xywh[2] / 2,
                    "y": xywh[1] - xywh[3] / 2,
                    "w": xywh[2],
                    "h": xywh[3],
                    "confidence": float(box.conf[0]),
                    "class_name": class_name,
                }
            )
    return filter_detections(detections, conf)


def run_inference_bytes(image_bytes: bytes, conf: float | None = None) -> list[dict]:
    import io

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    model = get_model()
    threshold = conf or settings.confidence_threshold
    results = model.predict(source=arr, conf=threshold, verbose=False)

    detections = []
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            cls_id = int(box.cls[0])
            class_name = result.names.get(cls_id, CLASS_NAMES.get(cls_id, "pothole"))
            xywh = box.xywh[0].tolist()
            detections.append(
                {
                    "x": xywh[0] - xywh[2] / 2,
                    "y": xywh[1] - xywh[3] / 2,
                    "w": xywh[2],
                    "h": xywh[3],
                    "confidence": float(box.conf[0]),
                    "class_name": class_name,
                }
            )
    return filter_detections(detections, conf)


def needs_cloud_reverify(confidence: float) -> bool:
    return settings.cloud_reverify_min <= confidence <= settings.cloud_reverify_max


def resolve_detection_status(confidence: float, edge_confidence: float | None = None):
    """Only >=70% confidence is auto-verified. Never verify low scores."""
    from app.models import DetectionStatus

    if confidence >= 0.7:
        return True, DetectionStatus.verified
    return False, DetectionStatus.detected
