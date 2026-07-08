"""
Edge inference using ONNX Runtime (for MMS, drone, mobile).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

CLASS_NAMES = {0: "pothole", 1: "crack", 2: "patch"}


class ONNXPotholeDetector:
    def __init__(self, model_path: str, conf_threshold: float = 0.25):
        import onnxruntime as ort

        self.session = ort.InferenceSession(
            model_path, providers=["CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name
        self.conf_threshold = conf_threshold
        self.imgsz = 640

    def preprocess(self, image: np.ndarray) -> tuple[np.ndarray, float, tuple]:
        h, w = image.shape[:2]
        scale = min(self.imgsz / h, self.imgsz / w)
        nh, nw = int(h * scale), int(w * scale)
        resized = np.zeros((self.imgsz, self.imgsz, 3), dtype=np.uint8)
        import cv2

        img = cv2.resize(image, (nw, nh))
        resized[:nh, :nw] = img
        blob = resized.transpose(2, 0, 1).astype(np.float32) / 255.0
        blob = np.expand_dims(blob, axis=0)
        return blob, scale, (w, h)

    def detect(self, image: np.ndarray) -> list[dict]:
        blob, scale, (orig_w, orig_h) = self.preprocess(image)
        outputs = self.session.run(None, {self.input_name: blob})
        return self._parse_output(outputs[0], scale, orig_w, orig_h)

    def _parse_output(
        self, output: np.ndarray, scale: float, orig_w: int, orig_h: int
    ) -> list[dict]:
        detections = []
        preds = output[0] if output.ndim == 3 else output
        if preds.ndim == 2 and preds.shape[0] < preds.shape[1]:
            preds = preds.T

        for row in preds:
            if len(row) < 6:
                continue
            conf = float(row[4])
            if conf < self.conf_threshold:
                continue
            cls_id = int(row[5])
            cx, cy, bw, bh = row[0], row[1], row[2], row[3]
            x = (cx - bw / 2) / scale
            y = (cy - bh / 2) / scale
            w = bw / scale
            h = bh / scale
            detections.append(
                {
                    "x": float(x),
                    "y": float(y),
                    "w": float(w),
                    "h": float(h),
                    "confidence": conf,
                    "class_name": CLASS_NAMES.get(cls_id, "pothole"),
                }
            )
        return detections


def detect_file(model_path: str, image_path: str, conf: float = 0.25) -> list[dict]:
    import cv2

    detector = ONNXPotholeDetector(model_path, conf)
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(image_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return detector.detect(img)
