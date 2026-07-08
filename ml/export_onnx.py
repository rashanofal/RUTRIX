"""
Export trained YOLO model to ONNX for edge deployment.
Usage: python export_onnx.py [--model ../ml/models/pothole_yolov8n.pt]
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "models" / "pothole_yolov8n.pt"


def export(model_path: str | Path = DEFAULT_MODEL, imgsz: int = 640):
    model_path = Path(model_path)
    if not model_path.exists():
        print(f"Model not found at {model_path}, using yolov8n.pt")
        model_path = Path("yolov8n.pt")

    model = YOLO(str(model_path))
    out = model.export(format="onnx", imgsz=imgsz, simplify=True, opset=12)
    print(f"ONNX model exported to {out}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default=str(DEFAULT_MODEL))
    parser.add_argument("--imgsz", type=int, default=640)
    args = parser.parse_args()
    export(args.model, args.imgsz)
