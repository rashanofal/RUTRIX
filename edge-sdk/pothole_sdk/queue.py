"""Offline queue for syncing detections when network is unavailable."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path


class OfflineQueue:
    def __init__(self, db_path: str = "pothole_queue.db"):
        self.db_path = Path(db_path)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS pending_uploads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    device_type TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    bearing REAL,
                    source_id TEXT,
                    edge_detections TEXT,
                    created_at TEXT NOT NULL,
                    synced INTEGER DEFAULT 0
                )
                """
            )

    def enqueue(
        self,
        file_path: str,
        device_type: str,
        latitude: float | None = None,
        longitude: float | None = None,
        bearing: float | None = None,
        source_id: str | None = None,
        edge_detections: list | None = None,
    ) -> int:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute(
                """
                INSERT INTO pending_uploads
                (file_path, device_type, latitude, longitude, bearing, source_id, edge_detections, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    file_path,
                    device_type,
                    latitude,
                    longitude,
                    bearing,
                    source_id,
                    json.dumps(edge_detections) if edge_detections else None,
                    datetime.utcnow().isoformat(),
                ),
            )
            return cur.lastrowid

    def pending(self) -> list[dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM pending_uploads WHERE synced = 0 ORDER BY id"
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_synced(self, upload_id: int):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE pending_uploads SET synced = 1 WHERE id = ?", (upload_id,)
            )
