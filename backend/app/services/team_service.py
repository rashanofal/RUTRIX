"""Team member activity stats for supervisor dashboard."""

from sqlalchemy.orm import Session

from app.models import DeviceType, DetectionStatus, PotholeDetection


def member_activity_stats(db: Session, organization_id: int, user_id: int) -> dict:
    base = db.query(PotholeDetection).filter(
        PotholeDetection.organization_id == organization_id,
        PotholeDetection.reporter_user_id == user_id,
        PotholeDetection.detection_status != DetectionStatus.rejected,
    )
    total = base.count()
    phone_uploads = base.filter(PotholeDetection.device_type == DeviceType.phone).count()
    dashboard_uploads = base.filter(PotholeDetection.device_type == DeviceType.mms).count()
    map_pins = base.filter(
        PotholeDetection.latitude.isnot(None),
        PotholeDetection.longitude.isnot(None),
    ).count()
    return {
        "total_detections": total,
        "phone_uploads": phone_uploads,
        "dashboard_uploads": dashboard_uploads,
        "map_pins": map_pins,
    }
