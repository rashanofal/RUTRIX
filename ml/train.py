"""
Train YOLOv8 pothole detection model on unified dataset.
Usage: python train.py [--epochs 50] [--model yolov8n.pt]
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
CONFIG = ROOT / "configs" / "data.yaml"


def train(epochs: int = 50, model_name: str = "yolov8n.pt", imgsz: int = 640):
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    data_yaml = CONFIG
    if not (ROOT.parent / "data" / "datasets" / "unified" / "images" / "train").exists():
        print("Warning: No unified dataset found. Run dataset_aggregator.py first.")
        print("Training on yolov8n pretrained weights for demo purposes.")

    model = YOLO(model_name)
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=16,
        project=str(MODELS_DIR),
        name="pothole_train",
        exist_ok=True,
        patience=10,
        augment=True,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=10.0,
        translate=0.1,
        scale=0.5,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.1,
    )

    best = MODELS_DIR / "pothole_train" / "weights" / "best.pt"
    dest = MODELS_DIR / "pothole_yolov8n.pt"
    if best.exists():
        import shutil
        shutil.copy2(best, dest)
        print(f"Best model saved to {dest}")

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--model", type=str, default="yolov8n.pt")
    parser.add_argument("--imgsz", type=int, default=640)
    args = parser.parse_args()
    train(args.epochs, args.model, args.imgsz)
