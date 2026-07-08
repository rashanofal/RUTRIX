"""Track cluster evolution over time for crack/pothole growth prediction."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ClusterSnapshot, PotholeDetection


def record_cluster_snapshot(db: Session, cluster_id: str, organization_id: int) -> None:
    if not cluster_id:
        return
    items = (
        db.query(PotholeDetection)
        .filter(
            PotholeDetection.cluster_id == cluster_id,
            PotholeDetection.organization_id == organization_id,
        )
        .all()
    )
    if not items:
        return
    avg_rut = sum(d.rut_score or 0 for d in items) / len(items)
    worst = max(items, key=lambda d: d.rut_score or 0).severity or "low"
    snap = ClusterSnapshot(
        cluster_id=cluster_id,
        organization_id=organization_id,
        rut_score=round(avg_rut, 1),
        detection_count=len(items),
        avg_severity=worst,
    )
    db.add(snap)
    db.commit()


def get_cluster_stats(db: Session, organization_id: int) -> list[dict]:
    """Road quality clusters — potholes only (excludes photo-only pins)."""
    rows = (
        db.query(
            PotholeDetection.cluster_id,
            func.avg(PotholeDetection.rut_score).label("avg_rut"),
            func.count(PotholeDetection.id).label("cnt"),
            func.avg(PotholeDetection.latitude).label("lat"),
            func.avg(PotholeDetection.longitude).label("lon"),
            func.max(PotholeDetection.rut_score).label("max_rut"),
        )
        .filter(
            PotholeDetection.organization_id == organization_id,
            PotholeDetection.cluster_id.isnot(None),
            PotholeDetection.latitude.isnot(None),
            PotholeDetection.class_name != "photo",
        )
        .group_by(PotholeDetection.cluster_id)
        .having(func.max(PotholeDetection.rut_score) > 0)
        .all()
    )
    out = []
    for r in rows:
        if r.lat is None:
            continue
        worst_item = (
            db.query(PotholeDetection.severity)
            .filter(
                PotholeDetection.cluster_id == r.cluster_id,
                PotholeDetection.organization_id == organization_id,
                PotholeDetection.class_name != "photo",
            )
            .order_by(PotholeDetection.rut_score.desc())
            .first()
        )
        sev = worst_item[0] if worst_item else "low"
        members = (
            db.query(
                PotholeDetection.latitude,
                PotholeDetection.longitude,
                PotholeDetection.bearing,
            )
            .filter(
                PotholeDetection.cluster_id == r.cluster_id,
                PotholeDetection.organization_id == organization_id,
                PotholeDetection.latitude.isnot(None),
                PotholeDetection.longitude.isnot(None),
                PotholeDetection.class_name != "photo",
            )
            .all()
        )
        points = [
            {
                "latitude": float(m.latitude),
                "longitude": float(m.longitude),
                "bearing": float(m.bearing) if m.bearing is not None else None,
            }
            for m in members
        ]
        out.append(
            {
                "cluster_id": r.cluster_id,
                "rut_score": round(float(r.avg_rut or 0), 1),
                "detection_count": int(r.cnt or 0),
                "pothole_count": int(r.cnt or 0),
                "latitude": float(r.lat),
                "longitude": float(r.lon),
                "severity": sev,
                "points": points,
                "road_bearing": None,
            }
        )
    return sorted(out, key=lambda x: x["rut_score"], reverse=True)


def get_survey_zones(db: Session, organization_id: int) -> list[dict]:
    """Photo-only pins — green safe-road survey buffers on the map."""
    rows = (
        db.query(PotholeDetection)
        .filter(
            PotholeDetection.organization_id == organization_id,
            PotholeDetection.class_name == "photo",
            PotholeDetection.latitude.isnot(None),
            PotholeDetection.longitude.isnot(None),
        )
        .order_by(PotholeDetection.created_at.desc())
        .limit(200)
        .all()
    )
    out = []
    for d in rows:
        out.append(
            {
                "cluster_id": f"survey-{d.id}",
                "rut_score": 8.0,
                "detection_count": 1,
                "pothole_count": 0,
                "latitude": float(d.latitude),
                "longitude": float(d.longitude),
                "severity": "low",
                "is_survey": True,
                "points": [
                    {
                        "latitude": float(d.latitude),
                        "longitude": float(d.longitude),
                        "bearing": float(d.bearing) if d.bearing is not None else None,
                    }
                ],
                "road_bearing": float(d.bearing) if d.bearing is not None else None,
            }
        )
    return out
