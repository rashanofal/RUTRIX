"""HTTP client for Pothole Detection API."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from pothole_sdk.queue import OfflineQueue


class PotholeClient:
    """SDK client for MMS, drone, and edge device integration."""

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        device_type: str = "mms",
        source_id: str | None = None,
        offline_queue: OfflineQueue | None = None,
        timeout: float = 60.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.device_type = device_type
        self.source_id = source_id or f"{device_type}-001"
        self.queue = offline_queue or OfflineQueue()
        self.client = httpx.Client(base_url=self.base_url, timeout=timeout)

    def health(self) -> dict:
        resp = self.client.get("/api/health")
        resp.raise_for_status()
        return resp.json()

    def submit_detection(self, payload: dict[str, Any]) -> dict:
        resp = self.client.post("/api/detections", json=payload)
        resp.raise_for_status()
        return resp.json()

    def upload_image(
        self,
        image_path: str,
        latitude: float | None = None,
        longitude: float | None = None,
        bearing: float | None = None,
        edge_detections: list | None = None,
    ) -> dict:
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(image_path)

        try:
            with open(path, "rb") as f:
                files = {"file": (path.name, f, "image/jpeg")}
                data = {
                    "device_type": self.device_type,
                    "source_id": self.source_id,
                }
                if latitude is not None:
                    data["latitude"] = str(latitude)
                if longitude is not None:
                    data["longitude"] = str(longitude)
                if bearing is not None:
                    data["bearing"] = str(bearing)
                if edge_detections:
                    data["edge_detections"] = json.dumps(edge_detections)

                resp = self.client.post("/api/detections/upload", files=files, data=data)
                resp.raise_for_status()
                return resp.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            self.queue.enqueue(
                str(path),
                self.device_type,
                latitude,
                longitude,
                bearing,
                self.source_id,
                edge_detections,
            )
            return {
                "queued": True,
                "message": "Saved offline, will sync when connected",
            }

    def sync_pending(self) -> list[dict]:
        results = []
        for item in self.queue.pending():
            try:
                edge_dets = json.loads(item["edge_detections"]) if item["edge_detections"] else None
                result = self.upload_image(
                    item["file_path"],
                    item["latitude"],
                    item["longitude"],
                    item["bearing"],
                    edge_dets,
                )
                if not result.get("queued"):
                    self.queue.mark_synced(item["id"])
                results.append(result)
            except Exception as e:
                results.append({"error": str(e), "id": item["id"]})
        return results

    def process_and_upload(
        self,
        image_path: str,
        detector,
        latitude: float | None = None,
        longitude: float | None = None,
        bearing: float | None = None,
    ) -> dict:
        """Hybrid flow: edge detect then upload to cloud."""
        edge_dets = detector.detect_image(image_path)
        for d in edge_dets:
            d["edge_confidence"] = d["confidence"]
        return self.upload_image(
            image_path, latitude, longitude, bearing, edge_dets
        )

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
