"""
Periodic retraining using active learning samples from uploads.
Usage: python scripts-passive_retrain.py
"""

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TRAINING_DIR = ROOT.parent / "data" / "training"
UNIFIED = ROOT.parent / "data" / "datasets" / "unified" / "images" / "train"


def collect_active_learning_samples(min_samples: int = 10) -> int:
    """Copy unlabeled upload samples into unified training set for next retrain."""
    UNIFIED.mkdir(parents=True, exist_ok=True)
    count = 0
    for device_dir in TRAINING_DIR.iterdir():
        if not device_dir.is_dir():
            continue
        for img in device_dir.glob("*.jpg"):
            dest = UNIFIED / f"active_{device_dir.name}_{img.name}"
            if not dest.exists():
                shutil.copy2(img, dest)
                count += 1
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-samples", type=int, default=10)
    parser.add_argument("--epochs", type=int, default=20)
    args = parser.parse_args()

    count = collect_active_learning_samples(args.min_samples)
    print(f"Collected {count} active learning samples")

    if count >= args.min_samples:
        from train import train

        train(epochs=args.epochs)
        from export_onnx import export

        export()
    else:
        print(f"Need at least {args.min_samples} samples for retraining")


if __name__ == "__main__":
    main()
