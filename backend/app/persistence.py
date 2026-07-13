"""Ensure upload/DB directories exist and report persistence status."""

from __future__ import annotations

import os
from pathlib import Path

from app.config import settings


def _sqlite_path(database_url: str) -> Path | None:
    if not database_url.startswith("sqlite"):
        return None
    raw = database_url.split("///", 1)[-1] if "///" in database_url else database_url.split(":///", 1)[-1]
    return Path(raw)


def ensure_storage_dirs() -> None:
    upload = Path(settings.upload_dir)
    upload.mkdir(parents=True, exist_ok=True)
    training = Path(settings.training_dir)
    training.mkdir(parents=True, exist_ok=True)
    db_path = _sqlite_path(settings.database_url)
    if db_path:
        db_path.parent.mkdir(parents=True, exist_ok=True)


def storage_status() -> dict:
    upload = Path(settings.upload_dir)
    db_path = _sqlite_path(settings.database_url)
    on_hf_space = bool(
        os.environ.get("SPACE_ID")
        or os.environ.get("SPACE_REPO_NAME")
        or os.environ.get("SPACE_AUTHOR_NAME")
        or ".hf.space" in os.environ.get("SPACE_HOST", "")
    )
    uses_data_mount = str(upload).startswith("/data") or (
        db_path is not None and str(db_path).startswith("/data")
    )

    writable = False
    try:
        upload.mkdir(parents=True, exist_ok=True)
        probe = upload / ".rutrix_write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        writable = True
    except OSError:
        writable = False

    detection_count_hint = None
    if db_path and db_path.is_file():
        detection_count_hint = db_path.stat().st_size

    ephemeral_warning = on_hf_space and uses_data_mount
    return {
        "upload_dir": str(upload),
        "database_path": str(db_path) if db_path else None,
        "upload_writable": writable,
        "on_huggingface_space": on_hf_space,
        "uses_data_volume": uses_data_mount,
        "ephemeral_warning": ephemeral_warning,
        "database_bytes": detection_count_hint,
    }
