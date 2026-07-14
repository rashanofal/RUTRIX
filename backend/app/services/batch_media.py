"""Extract processable stills from batch image uploads and video files."""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

MAX_BATCH_IMAGES = 40
MAX_VIDEO_FRAMES = 30
DEFAULT_FRAME_INTERVAL_SEC = 1.0
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif"}


@dataclass
class MediaFrame:
    content: bytes
    filename: str
    frame_index: int
    timestamp_sec: float | None = None
    latitude: float | None = None
    longitude: float | None = None


def is_video_filename(name: str | None) -> bool:
    if not name:
        return False
    return Path(name).suffix.lower() in VIDEO_EXTENSIONS


def is_image_filename(name: str | None) -> bool:
    if not name:
        return False
    return Path(name).suffix.lower() in IMAGE_EXTENSIONS


def interpolate_gps(
    index: int,
    total: int,
    start_lat: float | None,
    start_lon: float | None,
    end_lat: float | None,
    end_lon: float | None,
) -> tuple[float | None, float | None]:
    """Spread GPS along a path when start+end are provided (simple MMS/drone track)."""
    if start_lat is None or start_lon is None:
        return None, None
    if end_lat is None or end_lon is None or total <= 1:
        return start_lat, start_lon
    t = index / max(total - 1, 1)
    return (
        start_lat + (end_lat - start_lat) * t,
        start_lon + (end_lon - start_lon) * t,
    )


def extract_video_frames(
    video_bytes: bytes,
    *,
    original_name: str = "mission.mp4",
    interval_sec: float = DEFAULT_FRAME_INTERVAL_SEC,
    max_frames: int = MAX_VIDEO_FRAMES,
) -> list[MediaFrame]:
    """Sample JPEG frames from a video at approximately interval_sec spacing."""
    # Lazy import — keep API startup light for Hugging Face health probes.
    import cv2

    if not video_bytes:
        return []

    interval = max(0.2, float(interval_sec or DEFAULT_FRAME_INTERVAL_SEC))
    stem = Path(original_name).stem or "mission"
    frames: list[MediaFrame] = []
    suffix = Path(original_name).suffix.lower() or ".mp4"

    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(video_bytes)
            tmp.flush()
            tmp_path = Path(tmp.name)

        cap = cv2.VideoCapture(str(tmp_path))
        if not cap.isOpened():
            raise ValueError("تعذر فتح ملف الفيديو — جرّب MP4 أو MOV")

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        step = max(1, int(round(fps * interval)))
        idx = 0
        grabbed = 0

        while len(frames) < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            if grabbed % step == 0:
                ok_jpg, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
                if ok_jpg:
                    ts = grabbed / fps if fps else None
                    frames.append(
                        MediaFrame(
                            content=buf.tobytes(),
                            filename=f"{stem}_f{idx:04d}.jpg",
                            frame_index=idx,
                            timestamp_sec=ts,
                        )
                    )
                    idx += 1
            grabbed += 1
            if total_frames and grabbed >= total_frames:
                break

        cap.release()
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass

    if not frames:
        raise ValueError("لم يُستخرج أي إطار من الفيديو")
    logger.info(
        "extracted %s frames from video %s (interval=%.2fs)",
        len(frames),
        original_name,
        interval,
    )
    return frames


def jpeg_bytes_from_ndarray(arr: np.ndarray, quality: int = 88) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".jpg", arr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("failed to encode frame")
    return buf.tobytes()
