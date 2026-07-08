"""Local ONNX inference for edge devices."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

# Allow importing ml inference module
ML_ROOT = Path(__file__).resolve().parents[2] / "ml"
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))

from inference_onnx import ONNXPotholeDetector  # noqa: E402


class EdgeDetector:
    """Run pothole detection locally using ONNX model."""

    def __init__(
        self,
        model_path: str,
        conf_threshold: float = 0.25,
        frame_interval: int = 5,
    ):
        self.detector = ONNXPotholeDetector(model_path, conf_threshold)
        self.frame_interval = frame_interval
        self._frame_count = 0

    def detect_image(self, image_path: str) -> list[dict]:
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(image_path)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return self.detector.detect(rgb)

    def detect_frame(self, frame: np.ndarray) -> list[dict]:
        """Detect on video frame with interval skipping."""
        self._frame_count += 1
        if self._frame_count % self.frame_interval != 0:
            return []
        if frame.ndim == 3 and frame.shape[2] == 3:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        else:
            rgb = frame
        return self.detector.detect(rgb)

    def process_video(
        self,
        video_path: str,
        gps_callback=None,
    ) -> list[dict]:
        """
        Process video file frame by frame.
        gps_callback(frame_index) -> (lat, lon, bearing) optional.
        """
        cap = cv2.VideoCapture(video_path)
        all_detections = []
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            dets = self.detect_frame(frame)
            if dets:
                gps = (None, None, None)
                if gps_callback:
                    gps = gps_callback(frame_idx)

                for d in dets:
                    d["frame_index"] = frame_idx
                    d["latitude"] = gps[0]
                    d["longitude"] = gps[1]
                    d["bearing"] = gps[2]
                    d["edge_confidence"] = d["confidence"]
                all_detections.extend(dets)

            frame_idx += 1

        cap.release()
        return all_detections
