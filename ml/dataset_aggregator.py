"""
Unified dataset aggregator for pothole detection.
Converts multiple public datasets into YOLO format with metadata tracking.
"""

from __future__ import annotations

import json
import random
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATASETS_DIR = ROOT.parent / "data" / "datasets"
RAW_DIR = DATASETS_DIR / "raw"
UNIFIED_DIR = DATASETS_DIR / "unified"

CLASS_MAP = {
    "pothole": 0,
    "Pothole": 0,
    "D00": 1,  # RDD2022 longitudinal crack
    "D10": 1,  # RDD2022 transverse crack
    "D20": 2,  # RDD2022 patch
    "crack": 1,
    "Crack": 1,
    "patch": 2,
    "Patch": 2,
    "alligator": 1,
}


@dataclass
class SourceStats:
    name: str
    images: int = 0
    labels: int = 0
    countries: list[str] = field(default_factory=list)
    device_type: str = "unknown"


def ensure_dirs():
    for split in ("train", "val", "test"):
        (UNIFIED_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (UNIFIED_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def yolo_line(class_id: int, cx: float, cy: float, w: float, h: float) -> str:
    return f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"


def convert_roboflow_yolo(source_dir: Path, stats: SourceStats):
    """Copy already-YOLO formatted Roboflow export."""
    for split in ("train", "valid", "test"):
        target_split = "val" if split == "valid" else split
        src_images = source_dir / split / "images"
        src_labels = source_dir / split / "labels"
        if not src_images.exists():
            continue
        for img in src_images.glob("*"):
            if img.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            label_file = src_labels / f"{img.stem}.txt"
            dest_img = UNIFIED_DIR / "images" / target_split / f"{stats.name}_{img.name}"
            shutil.copy2(img, dest_img)
            stats.images += 1
            if label_file.exists():
                dest_label = UNIFIED_DIR / "labels" / target_split / f"{stats.name}_{img.stem}.txt"
                shutil.copy2(label_file, dest_label)
                stats.labels += 1


def convert_rdd2022_coco(source_dir: Path, stats: SourceStats):
    """Convert RDD2022 JSON annotations to YOLO format."""
    for country_dir in source_dir.iterdir():
        if not country_dir.is_dir():
            continue
        stats.countries.append(country_dir.name)
        ann_file = country_dir / "annotations" / "instances.json"
        if not ann_file.exists():
            # Try flat structure
            for json_file in country_dir.rglob("*.json"):
                _convert_coco_json(json_file, country_dir, stats, target_split="train")
            continue
        _convert_coco_json(ann_file, country_dir / "images", stats, target_split="train")


def _convert_coco_json(json_path: Path, images_dir: Path, stats: SourceStats, target_split: str):
    with open(json_path, encoding="utf-8") as f:
        coco = json.load(f)

    id_to_file = {img["id"]: img["file_name"] for img in coco.get("images", [])}
    id_to_size = {
        img["id"]: (img["width"], img["height"]) for img in coco.get("images", [])
    }
    cat_map = {c["id"]: c["name"] for c in coco.get("categories", [])}

    anns_by_image: dict[int, list] = {}
    for ann in coco.get("annotations", []):
        anns_by_image.setdefault(ann["image_id"], []).append(ann)

    for img_id, anns in anns_by_image.items():
        fname = id_to_file.get(img_id)
        if not fname:
            continue
        img_path = images_dir / fname
        if not img_path.exists():
            for candidate in images_dir.rglob(Path(fname).name):
                img_path = candidate
                break
        if not img_path.exists():
            continue

        w_img, h_img = id_to_size.get(img_id, (1, 1))
        lines = []
        for ann in anns:
            cat_name = cat_map.get(ann["category_id"], "pothole")
            class_id = CLASS_MAP.get(cat_name, 0)
            if "bbox" in ann:
                x, y, bw, bh = ann["bbox"]
                cx = (x + bw / 2) / w_img
                cy = (y + bh / 2) / h_img
                nw = bw / w_img
                nh = bh / h_img
                lines.append(yolo_line(class_id, cx, cy, nw, nh))

        if not lines:
            continue

        dest_img = UNIFIED_DIR / "images" / target_split / f"rdd_{img_path.name}"
        dest_label = UNIFIED_DIR / "labels" / target_split / f"rdd_{img_path.stem}.txt"
        shutil.copy2(img_path, dest_img)
        dest_label.write_text("\n".join(lines) + "\n", encoding="utf-8")
        stats.images += 1
        stats.labels += 1


def convert_voc_xml(source_dir: Path, stats: SourceStats, target_split: str = "train"):
    """Convert Pascal VOC XML labels (common in Kaggle datasets)."""
    import xml.etree.ElementTree as ET

    for xml_file in source_dir.rglob("*.xml"):
        tree = ET.parse(xml_file)
        root = tree.getroot()
        fname = root.find("filename").text
        size = root.find("size")
        w_img = int(size.find("width").text)
        h_img = int(size.find("height").text)

        img_path = xml_file.parent / fname
        if not img_path.exists():
            img_path = xml_file.parent / "images" / fname
        if not img_path.exists():
            continue

        lines = []
        for obj in root.findall("object"):
            name = obj.find("name").text
            class_id = CLASS_MAP.get(name, 0)
            bbox = obj.find("bndbox")
            xmin = float(bbox.find("xmin").text)
            ymin = float(bbox.find("ymin").text)
            xmax = float(bbox.find("xmax").text)
            ymax = float(bbox.find("ymax").text)
            cx = ((xmin + xmax) / 2) / w_img
            cy = ((ymin + ymax) / 2) / h_img
            nw = (xmax - xmin) / w_img
            nh = (ymax - ymin) / h_img
            lines.append(yolo_line(class_id, cx, cy, nw, nh))

        if not lines:
            continue

        dest_img = UNIFIED_DIR / "images" / target_split / f"kaggle_{img_path.name}"
        dest_label = UNIFIED_DIR / "labels" / target_split / f"kaggle_{img_path.stem}.txt"
        shutil.copy2(img_path, dest_img)
        dest_label.write_text("\n".join(lines) + "\n", encoding="utf-8")
        stats.images += 1
        stats.labels += 1


def rebalance_splits(train_ratio=0.8, val_ratio=0.1):
    """Re-split unified train into train/val/test if only train exists."""
    train_imgs = list((UNIFIED_DIR / "images" / "train").glob("*"))
    val_imgs = list((UNIFIED_DIR / "images" / "val").glob("*"))
    if val_imgs or len(train_imgs) < 10:
        return

    random.shuffle(train_imgs)
    n = len(train_imgs)
    n_val = int(n * val_ratio)
    n_test = int(n * (1 - train_ratio - val_ratio))

    for i, img in enumerate(train_imgs):
        if i < n_test:
            split = "test"
        elif i < n_test + n_val:
            split = "val"
        else:
            continue
        label = UNIFIED_DIR / "labels" / "train" / f"{img.stem}.txt"
        shutil.move(str(img), str(UNIFIED_DIR / "images" / split / img.name))
        if label.exists():
            shutil.move(str(label), str(UNIFIED_DIR / "labels" / split / label.name))


def write_metadata(all_stats: list[SourceStats]):
    meta = {
        "sources": [
            {
                "name": s.name,
                "images": s.images,
                "labels": s.labels,
                "countries": s.countries,
                "device_type": s.device_type,
            }
            for s in all_stats
        ],
        "total_images": sum(s.images for s in all_stats),
        "total_labels": sum(s.labels for s in all_stats),
    }
    (UNIFIED_DIR / "metadata.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )
    print(f"Dataset metadata: {meta['total_images']} images, {meta['total_labels']} labels")


def aggregate_all():
    ensure_dirs()
    all_stats: list[SourceStats] = []

    roboflow_dir = RAW_DIR / "roboflow"
    if roboflow_dir.exists():
        s = SourceStats("roboflow", device_type="mixed")
        convert_roboflow_yolo(roboflow_dir, s)
        all_stats.append(s)

    rdd_dir = RAW_DIR / "rdd2022"
    if rdd_dir.exists():
        s = SourceStats("rdd2022", device_type="mms")
        convert_rdd2022_coco(rdd_dir, s)
        all_stats.append(s)

    kaggle_dir = RAW_DIR / "kaggle"
    if kaggle_dir.exists():
        s = SourceStats("kaggle", device_type="phone")
        convert_voc_xml(kaggle_dir, s)
        all_stats.append(s)

    cdnet_dir = RAW_DIR / "cdnet"
    if cdnet_dir.exists():
        s = SourceStats("cdnet", device_type="mms")
        convert_voc_xml(cdnet_dir, s)
        all_stats.append(s)

    rebalance_splits()
    write_metadata(all_stats)

    config_path = ROOT / "configs" / "data.yaml"
    with open(config_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    cfg["path"] = str(UNIFIED_DIR.resolve())
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(cfg, f, default_flow_style=False)

    print(f"Unified dataset ready at {UNIFIED_DIR}")


if __name__ == "__main__":
    aggregate_all()
