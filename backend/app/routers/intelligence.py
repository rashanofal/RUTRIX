"""RUTRIX intelligence API — priorities, reports, leaderboard, route quality."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import DetectionConfirmation, Organization, PotholeDetection, User
from app.schemas import (
    LeaderboardEntry,
    PriorityItem,
    RoadBearingBatchRequest,
    RoadBearingBatchResponse,
    RoadQualityCluster,
    RouteQualityResponse,
)
from app.services.cluster_evolution import get_cluster_stats, get_survey_zones
from app.services.gamification import award_confirmation_points, leaderboard
from app.services.report_service import build_report_data, generate_html_report, generate_pdf_report
from app.services.road_geometry import fetch_road_bearing, fetch_road_bearings_batch
from app.services.rut_intelligence import analyze_detection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


@router.get("/priorities", response_model=list[PriorityItem])
def maintenance_priorities(
    limit: int = 50,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    from app.models import DetectionStatus

    items = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == org.id)
        .filter(PotholeDetection.class_name != "photo")
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
        .order_by(PotholeDetection.priority_rank.desc(), PotholeDetection.rut_score.desc())
        .all()
    )
    seen_images: set[str] = set()
    out: list[PriorityItem] = []
    for d in items:
        key = d.image_path or f"id:{d.id}"
        if key in seen_images:
            continue
        seen_images.add(key)
        out.append(
            PriorityItem(
                id=d.id,
                severity=d.severity or "low",
                rut_score=d.rut_score or 0,
                class_name=d.class_name,
                anomaly_type=d.anomaly_type or d.class_name,
                latitude=d.latitude,
                longitude=d.longitude,
                estimated_depth_cm=d.estimated_depth_cm,
                estimated_width_cm=d.estimated_width_cm,
                repair_cost_min=d.repair_cost_min,
                repair_cost_max=d.repair_cost_max,
                vehicle_risk_score=d.vehicle_risk_score or 0,
                confirmation_count=d.confirmation_count or 1,
                evolution_stage=d.evolution_stage or "new",
                predicted_days_to_critical=d.predicted_days_to_critical,
                priority_rank=d.priority_rank or 0,
            )
        )
        if len(out) >= limit:
            break
    return out


@router.get("/road-quality", response_model=list[RoadQualityCluster])
def road_quality_map(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    clusters = get_cluster_stats(db, org.id)
    clusters.extend(get_survey_zones(db, org.id))
    out: list[RoadQualityCluster] = []
    for c in clusters:
        rb = c.get("road_bearing")
        if rb is None:
            for pt in c.get("points") or []:
                if pt.get("bearing") is not None:
                    rb = pt["bearing"]
                    break
        c["road_bearing"] = rb
        out.append(RoadQualityCluster(**c))
    return out


@router.post("/road-bearings", response_model=RoadBearingBatchResponse)
async def road_bearings_batch(
    payload: RoadBearingBatchRequest,
    org: Organization = Depends(get_current_organization),
):
    _ = org
    bearings = await fetch_road_bearings_batch(
        [p.model_dump() for p in payload.points]
    )
    return RoadBearingBatchResponse(bearings=bearings)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def contributors_leaderboard(
    limit: int = 20,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    return [LeaderboardEntry(**e) for e in leaderboard(db, org.id, limit)]


@router.get("/report/html", response_class=HTMLResponse)
def report_html(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    try:
        data = build_report_data(db, org)
        return HTMLResponse(generate_html_report(data))
    except Exception as exc:
        logger.exception("HTML report failed for org %s", org.id)
        raise HTTPException(
            status_code=500,
            detail=f"فشل إنشاء تقرير HTML ({type(exc).__name__})",
        ) from exc


@router.get("/report/pdf")
def report_pdf(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    data = build_report_data(db, org)
    try:
        content = generate_pdf_report(data)
    except Exception as exc:
        logger.exception("PDF report failed for org %s", org.id)
        raise HTTPException(
            status_code=500,
            detail=f"فشل إنشاء PDF — جرّبي تقرير HTML ({type(exc).__name__})",
        ) from exc
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="rutrix-report-{org.slug}.pdf"',
            "Content-Length": str(len(content)),
        },
    )


@router.get("/route-quality", response_model=RouteQualityResponse)
def route_quality(
    from_lat: float = Query(...),
    from_lon: float = Query(...),
    to_lat: float = Query(...),
    to_lon: float = Query(...),
    samples: int = Query(12, ge=4, le=40),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    """Score direct path between two points by nearby hazards (road quality navigation)."""
    hazards: list[PotholeDetection] = []
    rut_scores: list[float] = []
    bike_safe = 0
    for i in range(samples + 1):
        t = i / samples
        lat = from_lat + (to_lat - from_lat) * t
        lon = from_lon + (to_lon - from_lon) * t
        # ~150m corridor
        delta = 0.00135
        nearby = (
            db.query(PotholeDetection)
            .filter(PotholeDetection.organization_id == org.id)
            .filter(PotholeDetection.latitude.between(lat - delta, lat + delta))
            .filter(PotholeDetection.longitude.between(lon - delta, lon + delta))
            .filter(PotholeDetection.class_name != "photo")
            .all()
        )
        for d in nearby:
            hazards.append(d)
            rut_scores.append(d.rut_score or 0)
            if d.bicycle_safe:
                bike_safe += 1

    unique = len({h.id for h in hazards})
    avg_rut = sum(rut_scores) / len(rut_scores) if rut_scores else 0.0
    if avg_rut < 25:
        grade, rec = "A", "مسار ممتاز — مناسب للمركبات والدراجات"
    elif avg_rut < 45:
        grade, rec = "B", "مسار جيد — قلّلي السرعة عند المطبات"
    elif avg_rut < 65:
        grade, rec = "C", "مسار متوسط — يُفضّل مسار بديل إن وُجد"
    else:
        grade, rec = "D", "مسار سيء — تجنّبي أو استخدموا طريقاً أطول وأكثر أماناً"

    total_h = len(hazards) or 1
    return RouteQualityResponse(
        sample_points=samples + 1,
        hazard_count=unique,
        avg_rut_score=round(avg_rut, 1),
        quality_grade=grade,
        recommendation=rec,
        bicycle_safe_pct=round(100 * bike_safe / total_h, 0),
    )


@router.post("/confirm/{detection_id}")
def confirm_detection(
    detection_id: int,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    """Multi-user digital proof — additional reporters confirm same hazard."""
    det = (
        db.query(PotholeDetection)
        .filter(
            PotholeDetection.id == detection_id,
            PotholeDetection.organization_id == org.id,
        )
        .first()
    )
    if not det:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")

    existing = (
        db.query(DetectionConfirmation)
        .filter(
            DetectionConfirmation.detection_id == detection_id,
            DetectionConfirmation.user_id == user.id,
        )
        .first()
    )
    if not existing:
        db.add(
            DetectionConfirmation(
                detection_id=detection_id,
                user_id=user.id,
                organization_id=org.id,
            )
        )
        det.confirmation_count = (det.confirmation_count or 1) + 1

    intel = analyze_detection(
        class_name=det.class_name,
        confidence=det.confidence,
        bbox_w=det.bbox_w,
        bbox_h=det.bbox_h,
        confirmation_count=det.confirmation_count,
        evolution_stage=det.evolution_stage or "new",
    )
    for k, v in intel.items():
        if k != "vehicle_risk_label":
            setattr(det, k, v)

    db.commit()
    contrib = award_confirmation_points(db, user.id, org.id, points=8)

    return {
        "message": "تم تأكيد البلاغ — إثبات رقمي",
        "confirmation_count": det.confirmation_count,
        "rut_score": det.rut_score,
        "severity": det.severity,
        "points_awarded": 8,
        "your_points": contrib.points,
    }
