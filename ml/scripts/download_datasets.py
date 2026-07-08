"""
Download scripts for public pothole datasets.
Place extracted data under data/datasets/raw/{source}/
"""

import argparse
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent.parent / "data" / "datasets" / "raw"

INSTRUCTIONS = """
# Public Dataset Download Guide

## 1. RDD2022 (Road Damage Detection 2022)
- URL: https://rdd2022.segautti.com/ or https://github.com/seigyr/RDD2022
- Download country folders and extract to: data/datasets/raw/rdd2022/

## 2. Roboflow (Pothole Detection)
- URL: https://universe.roboflow.com/search?q=pothole
- Export as YOLOv8 format
- Extract to: data/datasets/raw/roboflow/

## 3. Kaggle Pothole Datasets
- URL: https://www.kaggle.com/datasets?search=pothole
- Recommended: "Pothole Detection Dataset", "Road Damage Detection"
- Extract to: data/datasets/raw/kaggle/

## 4. CDNet / ChinaSet (MMS simulation)
- URL: https://github.com/tudelft-cda-lab/CDNet
- Extract to: data/datasets/raw/cdnet/

After downloading, run:
  python ml/dataset_aggregator.py
  python ml/train.py --epochs 50
  python ml/export_onnx.py
"""


def print_instructions():
    print(INSTRUCTIONS)
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "README.txt").write_text(INSTRUCTIONS, encoding="utf-8")
    print(f"Instructions saved to {RAW / 'README.txt'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["all", "rdd2022", "roboflow", "kaggle", "cdnet"], default="all")
    args = parser.parse_args()
    print_instructions()
