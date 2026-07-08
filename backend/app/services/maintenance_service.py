"""Work orders and municipal maintenance operations."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, exists, func
from sqlalchemy.orm import Session

from app.models import (
    PotholeDetection,
    User,
    WorkOrder,
    WorkOrderPriority,
    WorkOrderStatus,
)


def _severity_to_priority(severity: str) -> WorkOrderPriority:
    return {
        "critical": WorkOrderPriority.critical,
        "high": WorkOrderPriority.high,
        "medium": WorkOrderPriority.medium,
    }.get(severity or "low", WorkOrderPriority.low)


def create_work_order(
    db: Session,
    organization_id: int,
    created_by_user_id: int,
    *,
    detection_id: int | None = None,
    title: str | None = None,
    description: str | None = None,
    priority: WorkOrderPriority | None = None,
    assigned_to_user_id: int | None = None,
    scheduled_date: datetime | None = None,
) -> WorkOrder:
    det = None
    if detection_id:
        det = (
            db.query(PotholeDetection)
            .filter(
                PotholeDetection.id == detection_id,
                PotholeDetection.organization_id == organization_id,
            )
            .first()
        )
        if not det:
            raise ValueError("Detection not found")

    if not title:
        if det:
            title = f"صيانة #{det.id} — {det.anomaly_type or det.class_name}"
        else:
            title = "أمر صيانة جديد"

    wo = WorkOrder(
        organization_id=organization_id,
        detection_id=detection_id,
        title=title,
        description=description
        or (f"RUT {det.rut_score} · خطورة {det.severity}" if det else None),
        priority=priority or (_severity_to_priority(det.severity) if det else WorkOrderPriority.medium),
        assigned_to_user_id=assigned_to_user_id,
        created_by_user_id=created_by_user_id,
        scheduled_date=scheduled_date,
        repair_cost_estimate=det.repair_cost_min if det else None,
        status=WorkOrderStatus.assigned if assigned_to_user_id else WorkOrderStatus.open,
    )
    db.add(wo)
    if det and det.evolution_stage != "resolved":
        det.evolution_stage = "stable"
    db.commit()
    db.refresh(wo)
    return wo


def list_work_orders(
    db: Session,
    organization_id: int,
    *,
    status: WorkOrderStatus | None = None,
    limit: int = 100,
) -> list[WorkOrder]:
    purge_orphan_work_orders(db, organization_id)
    q = db.query(WorkOrder).filter(WorkOrder.organization_id == organization_id)
    if status:
        q = q.filter(WorkOrder.status == status)
    return q.order_by(WorkOrder.updated_at.desc()).limit(limit).all()


def update_work_order(
    db: Session,
    work_order_id: int,
    organization_id: int,
    **fields,
) -> WorkOrder | None:
    wo = (
        db.query(WorkOrder)
        .filter(WorkOrder.id == work_order_id, WorkOrder.organization_id == organization_id)
        .first()
    )
    if not wo:
        return None

    for key, value in fields.items():
        if value is not None and hasattr(wo, key):
            setattr(wo, key, value)

    if fields.get("status") == WorkOrderStatus.completed and not wo.completed_at:
        wo.completed_at = datetime.now(timezone.utc)
        if wo.detection_id:
            det = db.query(PotholeDetection).filter(PotholeDetection.id == wo.detection_id).first()
            if det:
                det.evolution_stage = "resolved"

    if fields.get("status") == WorkOrderStatus.verified and wo.detection_id:
        det = db.query(PotholeDetection).filter(PotholeDetection.id == wo.detection_id).first()
        if det:
            from app.models import DetectionStatus

            det.detection_status = DetectionStatus.verified
            det.evolution_stage = "resolved"

    db.commit()
    db.refresh(wo)
    return wo


def work_order_to_dict(db: Session, wo: WorkOrder) -> dict:
    assignee = None
    if wo.assigned_to_user_id:
        u = db.query(User).filter(User.id == wo.assigned_to_user_id).first()
        assignee = u.full_name if u else None
    det = None
    if wo.detection_id:
        d = db.query(PotholeDetection).filter(PotholeDetection.id == wo.detection_id).first()
        if d:
            det = {
                "id": d.id,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "severity": d.severity,
                "rut_score": d.rut_score,
                "anomaly_type": d.anomaly_type,
            }
    return {
        "id": wo.id,
        "detection_id": wo.detection_id,
        "title": wo.title,
        "description": wo.description,
        "status": wo.status.value,
        "priority": wo.priority.value,
        "assigned_to_user_id": wo.assigned_to_user_id,
        "assignee_name": assignee,
        "scheduled_date": wo.scheduled_date,
        "completed_at": wo.completed_at,
        "repair_cost_estimate": wo.repair_cost_estimate,
        "repair_cost_actual": wo.repair_cost_actual,
        "notes": wo.notes,
        "created_at": wo.created_at,
        "updated_at": wo.updated_at,
        "detection": det,
    }


def purge_orphan_work_orders(db: Session, organization_id: int) -> int:
    """Remove work orders whose linked detection was deleted."""
    deleted = (
        db.query(WorkOrder)
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.detection_id.isnot(None),
            ~exists().where(
                and_(
                    PotholeDetection.id == WorkOrder.detection_id,
                    PotholeDetection.organization_id == organization_id,
                )
            ),
        )
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return deleted


def get_maintenance_dashboard(db: Session, organization_id: int) -> dict:
    purge_orphan_work_orders(db, organization_id)
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    open_count = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.status.in_(
                [WorkOrderStatus.open, WorkOrderStatus.assigned, WorkOrderStatus.in_progress]
            ),
        )
        .scalar()
        or 0
    )
    completed_week = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.status.in_([WorkOrderStatus.completed, WorkOrderStatus.verified]),
            WorkOrder.completed_at >= week_ago,
        )
        .scalar()
        or 0
    )
    critical_open = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.priority == WorkOrderPriority.critical,
            WorkOrder.status.notin_(
                [WorkOrderStatus.completed, WorkOrderStatus.verified, WorkOrderStatus.cancelled]
            ),
        )
        .scalar()
        or 0
    )
    pending_verify = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.status == WorkOrderStatus.completed,
        )
        .scalar()
        or 0
    )
    budget_est = (
        db.query(func.sum(WorkOrder.repair_cost_estimate))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.status.notin_(
                [WorkOrderStatus.completed, WorkOrderStatus.verified, WorkOrderStatus.cancelled]
            ),
        )
        .scalar()
        or 0
    )
    budget_spent = (
        db.query(func.sum(WorkOrder.repair_cost_actual))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.status.in_([WorkOrderStatus.completed, WorkOrderStatus.verified]),
        )
        .scalar()
        or 0
    )
    unassigned = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.organization_id == organization_id,
            WorkOrder.assigned_to_user_id.is_(None),
            WorkOrder.status == WorkOrderStatus.open,
        )
        .scalar()
        or 0
    )

    return {
        "open_work_orders": open_count,
        "completed_this_week": completed_week,
        "critical_open": critical_open,
        "pending_verification": pending_verify,
        "unassigned_orders": unassigned,
        "budget_estimate_open": round(float(budget_est), 2),
        "budget_spent": round(float(budget_spent), 2),
        "completion_rate": round(
            100 * completed_week / max(open_count + completed_week, 1), 1
        ),
    }
