import json
import os
import uuid
from pathlib import Path

from geoalchemy2 import WKTElement
from geoalchemy2.functions import ST_DWithin, ST_MakePoint, ST_SetSRID
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import math

from app.config import is_sqlite, settings
from app.models import (
    DetectionConfirmation,
    DetectionStatus,
    DeviceType,
    LocationStatus,
    PotholeDetection,
    UploadRecord,
    WorkOrder,
)
from app.schemas import DetectionCreate
from app.services.cluster_evolution import record_cluster_snapshot
from app.services.rut_intelligence import analyze_detection, cluster_growth_rate


def _point_wkt(lat: float, lon: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def resolve_location_status(
    latitude: float | None, longitude: float | None
) -> LocationStatus:
    if latitude is not None and longitude is not None:
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return LocationStatus.confirmed
    return LocationStatus.uncertain


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def assign_cluster_id(db: Session, lat: float, lon: float, organization_id: int | None = None) -> str:
    """Merge nearby detections within cluster_radius_meters."""
    if is_sqlite():
        q = (
            db.query(PotholeDetection.cluster_id, PotholeDetection.latitude, PotholeDetection.longitude)
            .filter(PotholeDetection.cluster_id.isnot(None))
            .filter(PotholeDetection.latitude.isnot(None))
            .filter(PotholeDetection.longitude.isnot(None))
        )
        if organization_id is not None:
            q = q.filter(PotholeDetection.organization_id == organization_id)
        rows = q.all()
        for cluster_id, rlat, rlon in rows:
            if _haversine_m(lat, lon, rlat, rlon) <= settings.cluster_radius_meters:
                return cluster_id
        return str(uuid.uuid4())[:12]

    point = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
    radius_deg = settings.cluster_radius_meters / 111_000.0

    existing = db.execute(
        select(PotholeDetection.cluster_id)
        .where(PotholeDetection.location.isnot(None))
        .where(PotholeDetection.cluster_id.isnot(None))
        .where(ST_DWithin(PotholeDetection.location, point, radius_deg))
        .limit(1)
    ).scalar_one_or_none()

    return existing or str(uuid.uuid4())[:12]


def create_detection(
    db: Session,
    payload: DetectionCreate,
    image_path: str | None = None,
    cloud_verified: bool = False,
    detection_status: DetectionStatus = DetectionStatus.detected,
    organization_id: int | None = None,
    reporter_user_id: int | None = None,
) -> PotholeDetection:
    loc_status = payload.location_status
    if loc_status == LocationStatus.pending:
        loc_status = resolve_location_status(payload.latitude, payload.longitude)

    cluster_id = None
    location = None
    if payload.latitude is not None and payload.longitude is not None:
        if is_sqlite():
            location = f"POINT({payload.longitude} {payload.latitude})"
        else:
            location = _point_wkt(payload.latitude, payload.longitude)
        cluster_id = assign_cluster_id(db, payload.latitude, payload.longitude, organization_id)

    class_name = payload.bbox.class_name if payload.bbox else payload.class_name
    bbox_w = payload.bbox.w if payload.bbox else None
    bbox_h = payload.bbox.h if payload.bbox else None
    conf_count = 1
    if cluster_id and organization_id:
        conf_count = (
            db.query(PotholeDetection)
            .filter(
                PotholeDetection.cluster_id == cluster_id,
                PotholeDetection.organization_id == organization_id,
            )
            .count()
            + 1
        )
    evolution_stage, growth_rate = (
        cluster_growth_rate(db, cluster_id, organization_id)
        if cluster_id and organization_id
        else ("new", 0.0)
    )
    intel = analyze_detection(
        class_name=class_name or "pothole",
        confidence=payload.confidence,
        bbox_w=bbox_w,
        bbox_h=bbox_h,
        confirmation_count=conf_count,
        evolution_stage=evolution_stage,
        growth_rate=growth_rate,
    )

    detection = PotholeDetection(
        organization_id=organization_id,
        reporter_user_id=reporter_user_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location=location,
        confidence=payload.confidence,
        device_type=DeviceType(payload.device_type),
        location_status=loc_status,
        detection_status=detection_status,
        bbox_x=payload.bbox.x if payload.bbox else None,
        bbox_y=payload.bbox.y if payload.bbox else None,
        bbox_w=bbox_w,
        bbox_h=bbox_h,
        class_name=class_name,
        image_path=image_path,
        source_id=payload.source_id,
        bearing=payload.bearing,
        edge_confidence=payload.edge_confidence,
        cloud_verified=cloud_verified,
        cluster_id=cluster_id,
        metadata_json=json.dumps(payload.metadata) if payload.metadata else None,
        severity=intel["severity"],
        rut_score=intel["rut_score"],
        estimated_depth_cm=intel["estimated_depth_cm"],
        estimated_width_cm=intel["estimated_width_cm"],
        vehicle_risk_score=intel["vehicle_risk_score"],
        repair_cost_min=intel["repair_cost_min"],
        repair_cost_max=intel["repair_cost_max"],
        tire_damage_risk=intel["tire_damage_risk"],
        anomaly_type=intel["anomaly_type"],
        confirmation_count=conf_count,
        evolution_stage=evolution_stage,
        predicted_days_to_critical=intel["predicted_days_to_critical"],
        bicycle_safe=intel["bicycle_safe"],
        priority_rank=intel["priority_rank"],
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)
    if cluster_id and organization_id:
        record_cluster_snapshot(db, cluster_id, organization_id)
    return detection


def save_upload_record(
    db: Session,
    device_type: DeviceType,
    file_path: str,
    latitude: float | None,
    longitude: float | None,
    detections_count: int,
    organization_id: int | None = None,
) -> UploadRecord:
    record = UploadRecord(
        organization_id=organization_id,
        device_type=device_type,
        file_path=file_path,
        latitude=latitude,
        longitude=longitude,
        detections_count=detections_count,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def save_upload_file(content: bytes, filename: str, organization_id: int | None = None) -> str:
    base = Path(settings.upload_dir)
    if organization_id is not None:
        base = base / str(organization_id)
    base.mkdir(parents=True, exist_ok=True)
    safe_filename = Path(filename).name or "upload.jpg"
    safe_name = f"{uuid.uuid4().hex}_{safe_filename}"
    path = base / safe_name
    path.write_bytes(content)
    return str(path)


def save_training_sample(
    image_bytes: bytes,
    device_type: str,
    latitude: float | None,
    longitude: float | None,
    metadata: dict | None = None,
) -> str:
    """Active learning: store uploads for future retraining."""
    training_dir = Path(settings.training_dir) / device_type
    training_dir.mkdir(parents=True, exist_ok=True)
    sample_id = uuid.uuid4().hex
    image_path = training_dir / f"{sample_id}.jpg"
    image_path.write_bytes(image_bytes)

    meta = {
        "latitude": latitude,
        "longitude": longitude,
        "device_type": device_type,
        **(metadata or {}),
    }
    meta_path = training_dir / f"{sample_id}.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return str(image_path)


def get_detections_in_bounds(
    db: Session,
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    organization_id: int,
    limit: int = 500,
) -> list[PotholeDetection]:
    return (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.latitude >= min_lat)
        .filter(PotholeDetection.latitude <= max_lat)
        .filter(PotholeDetection.longitude >= min_lon)
        .filter(PotholeDetection.longitude <= max_lon)
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
        .order_by(PotholeDetection.created_at.desc())
        .limit(limit)
        .all()
    )


def delete_detection(
    db: Session, detection_id: int, organization_id: int, delete_file: bool = True
) -> dict | None:
    """Remove detection(s) sharing the same image — one photo = one delete action."""
    det = (
        db.query(PotholeDetection)
        .filter(
            PotholeDetection.id == detection_id,
            PotholeDetection.organization_id == organization_id,
        )
        .first()
    )
    if not det:
        return None

    image_path = det.image_path
    if image_path:
        siblings = (
            db.query(PotholeDetection.id)
            .filter(
                PotholeDetection.organization_id == organization_id,
                PotholeDetection.image_path == image_path,
            )
            .all()
        )
        ids_to_delete = [row[0] for row in siblings]
    else:
        ids_to_delete = [detection_id]

    for did in ids_to_delete:
        db.query(DetectionConfirmation).filter(
            DetectionConfirmation.detection_id == did
        ).delete(synchronize_session=False)
        db.query(WorkOrder).filter(
            WorkOrder.detection_id == did,
            WorkOrder.organization_id == organization_id,
        ).delete(synchronize_session=False)
        row = (
            db.query(PotholeDetection)
            .filter(
                PotholeDetection.id == did,
                PotholeDetection.organization_id == organization_id,
            )
            .first()
        )
        if row:
            db.delete(row)
    db.commit()

    files_deleted = 0
    if delete_file and image_path:
        remaining = (
            db.query(PotholeDetection)
            .filter(
                PotholeDetection.organization_id == organization_id,
                PotholeDetection.image_path == image_path,
            )
            .count()
        )
        if remaining == 0:
            p = Path(image_path)
            if p.is_file():
                p.unlink(missing_ok=True)
                files_deleted = 1

    return {
        "id": detection_id,
        "deleted_ids": ids_to_delete,
        "deleted_count": len(ids_to_delete),
        "files_deleted": files_deleted,
    }


def clear_all_map_data(
    db: Session, organization_id: int, delete_files: bool = True
) -> dict:
    """Remove detections, uploads, and linked work orders for one organization."""
    db.query(DetectionConfirmation).filter(
        DetectionConfirmation.organization_id == organization_id
    ).delete(synchronize_session=False)
    work_orders_deleted = (
        db.query(WorkOrder)
        .filter(WorkOrder.organization_id == organization_id)
        .delete(synchronize_session=False)
    )
    detections_deleted = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == organization_id)
        .delete()
    )
    uploads_deleted = (
        db.query(UploadRecord)
        .filter(UploadRecord.organization_id == organization_id)
        .delete()
    )
    db.commit()

    files_deleted = 0
    if delete_files:
        org_upload = Path(settings.upload_dir) / str(organization_id)
        if org_upload.exists():
            for path in org_upload.rglob("*"):
                if path.is_file():
                    path.unlink(missing_ok=True)
                    files_deleted += 1
        # Legacy flat uploads (pre-tenant)
        flat = Path(settings.upload_dir)
        if flat.exists():
            for path in flat.glob("*"):
                if path.is_file():
                    path.unlink(missing_ok=True)
                    files_deleted += 1

    return {
        "detections_deleted": detections_deleted,
        "uploads_deleted": uploads_deleted,
        "work_orders_deleted": work_orders_deleted,
        "files_deleted": files_deleted,
    }


def _group_inspections(
    db: Session, organization_id: int, reporter_user_id: int | None = None
) -> dict[str, list[PotholeDetection]]:
    """One uploaded image = one inspection (may contain multiple pothole rows)."""
    q = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
    )
    if reporter_user_id is not None:
        q = q.filter(PotholeDetection.reporter_user_id == reporter_user_id)
    rows = q.all()
    groups: dict[str, list[PotholeDetection]] = {}
    for row in rows:
        key = row.image_path or f"id:{row.id}"
        groups.setdefault(key, []).append(row)
    return groups


def _primary_detection(items: list[PotholeDetection]) -> PotholeDetection:
    potholes = [d for d in items if d.class_name != "photo"]
    if potholes:
        return max(potholes, key=lambda d: d.confidence or 0)
    return items[0]


def get_stats(db: Session, organization_id: int, reporter_user_id: int | None = None) -> dict:
    groups = _group_inspections(db, organization_id, reporter_user_id)
    total = len(groups)
    verified = 0
    by_device = {device.value: 0 for device in DeviceType}
    by_status = {status.value: 0 for status in DetectionStatus}

    for items in groups.values():
        primary = _primary_detection(items)
        if primary.detection_status == DetectionStatus.verified:
            verified += 1
        by_device[primary.device_type.value] = by_device.get(primary.device_type.value, 0) + 1
        by_status[primary.detection_status.value] = (
            by_status.get(primary.detection_status.value, 0) + 1
        )

    critical_count = sum(
        1
        for items in groups.values()
        if any(
            d.class_name != "photo" and d.severity == "critical"
            for d in items
        )
    )

    total_potholes_q = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.class_name != "photo")
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
    )
    if reporter_user_id is not None:
        total_potholes_q = total_potholes_q.filter(
            PotholeDetection.reporter_user_id == reporter_user_id
        )
    total_potholes = total_potholes_q.count() or 0

    return {
        "total_detections": total,
        "total_potholes": total_potholes,
        "verified_detections": verified,
        "by_device": by_device,
        "by_status": by_status,
        "by_severity": _count_field(db, organization_id, "severity", reporter_user_id),
        "avg_rut_score": _avg_rut(db, organization_id, reporter_user_id),
        "total_repair_min": _sum_field(db, organization_id, "repair_cost_min", reporter_user_id),
        "total_repair_max": _sum_field(db, organization_id, "repair_cost_max", reporter_user_id),
        "critical_count": critical_count,
        "growing_clusters": _count_evolution(db, organization_id, "growing", reporter_user_id),
    }


def _count_field(
    db: Session, organization_id: int, field: str, reporter_user_id: int | None = None
) -> dict:
    from sqlalchemy import func

    q = (
        db.query(getattr(PotholeDetection, field), func.count(PotholeDetection.id))
        .filter(PotholeDetection.organization_id == organization_id)
    )
    if reporter_user_id is not None:
        q = q.filter(PotholeDetection.reporter_user_id == reporter_user_id)
    rows = q.group_by(getattr(PotholeDetection, field)).all()
    return {str(k or "unknown"): v for k, v in rows}


def _avg_rut(db: Session, organization_id: int, reporter_user_id: int | None = None) -> float:
    from sqlalchemy import func

    q = (
        db.query(func.avg(PotholeDetection.rut_score))
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.class_name != "photo")
    )
    if reporter_user_id is not None:
        q = q.filter(PotholeDetection.reporter_user_id == reporter_user_id)
    val = q.scalar()
    return round(float(val or 0), 1)


def _sum_field(
    db: Session, organization_id: int, field: str, reporter_user_id: int | None = None
) -> float:
    from sqlalchemy import func

    q = (
        db.query(func.sum(getattr(PotholeDetection, field)))
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.class_name != "photo")
    )
    if reporter_user_id is not None:
        q = q.filter(PotholeDetection.reporter_user_id == reporter_user_id)
    val = q.scalar()
    return round(float(val or 0), 0)


def _count_severity(db: Session, organization_id: int, severity: str) -> int:
    return (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.class_name != "photo")
        .filter(PotholeDetection.severity == severity)
        .count()
        or 0
    )


def _count_evolution(
    db: Session, organization_id: int, stage: str, reporter_user_id: int | None = None
) -> int:
    q = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == organization_id)
        .filter(PotholeDetection.evolution_stage == stage)
    )
    if reporter_user_id is not None:
        q = q.filter(PotholeDetection.reporter_user_id == reporter_user_id)
    return q.count() or 0
