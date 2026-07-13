"""Work orders and municipal maintenance operations."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import and_, exists, func
from sqlalchemy.orm import Session

from app.models import (
    DetectionStatus,
    PotholeDetection,
    User,
    WorkOrder,
    WorkOrderEvent,
    WorkOrderPriority,
    WorkOrderStatus,
)


def _proof_url(image_path: str | None, organization_id: int | None = None) -> str | None:
    if not image_path:
        return None
    p = Path(image_path)
    name = p.name
    if organization_id is not None and str(organization_id) in p.parts:
        return f"/api/uploads/{organization_id}/{name}"
    return f"/api/uploads/{name}"


def log_event(
    db: Session,
    wo: WorkOrder,
    *,
    actor_user_id: int | None,
    event_type: str,
    from_status: str | None = None,
    to_status: str | None = None,
    commit: bool = True,
) -> WorkOrderEvent:
    ev = WorkOrderEvent(
        work_order_id=wo.id,
        organization_id=wo.organization_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
    )
    db.add(ev)
    if commit:
        db.commit()
    return ev


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
        det = db.query(PotholeDetection).filter(PotholeDetection.id == detection_id).first()
        if not det:
            raise ValueError("Detection not found")
        if det.organization_id is None:
            det.organization_id = organization_id
            db.flush()
        elif det.organization_id != organization_id:
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
    log_event(
        db,
        wo,
        actor_user_id=created_by_user_id,
        event_type="assigned" if assigned_to_user_id else "created",
        to_status=wo.status.value,
    )
    return wo


def list_work_orders(
    db: Session,
    organization_id: int,
    *,
    status: WorkOrderStatus | None = None,
    assigned_to_user_id: int | None = None,
    limit: int = 100,
) -> list[WorkOrder]:
    purge_orphan_work_orders(db, organization_id)
    q = db.query(WorkOrder).filter(WorkOrder.organization_id == organization_id)
    if status:
        q = q.filter(WorkOrder.status == status)
    if assigned_to_user_id is not None:
        q = q.filter(WorkOrder.assigned_to_user_id == assigned_to_user_id)
    return q.order_by(WorkOrder.updated_at.desc()).limit(limit).all()


def get_work_order(db: Session, work_order_id: int, organization_id: int) -> WorkOrder | None:
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.id == work_order_id, WorkOrder.organization_id == organization_id)
        .first()
    )


def update_work_order(
    db: Session,
    work_order_id: int,
    organization_id: int,
    *,
    actor_user_id: int | None = None,
    **fields,
) -> WorkOrder | None:
    wo = (
        db.query(WorkOrder)
        .filter(WorkOrder.id == work_order_id, WorkOrder.organization_id == organization_id)
        .first()
    )
    if not wo:
        return None

    prev_status = wo.status
    prev_assignee = wo.assigned_to_user_id

    for key, value in fields.items():
        if value is not None and hasattr(wo, key):
            setattr(wo, key, value)

    new_status = fields.get("status")

    if new_status == WorkOrderStatus.completed and not wo.completed_at:
        wo.completed_at = datetime.now(timezone.utc)
        if wo.detection_id:
            det = db.query(PotholeDetection).filter(PotholeDetection.id == wo.detection_id).first()
            if det:
                det.evolution_stage = "resolved"

    if new_status == WorkOrderStatus.verified:
        wo.verified_at = datetime.now(timezone.utc)
        if actor_user_id:
            wo.verified_by_user_id = actor_user_id
        if wo.detection_id:
            det = db.query(PotholeDetection).filter(PotholeDetection.id == wo.detection_id).first()
            if det:
                det.detection_status = DetectionStatus.verified
                det.evolution_stage = "resolved"

    if new_status and new_status != prev_status:
        log_event(
            db,
            wo,
            actor_user_id=actor_user_id,
            event_type="status_change",
            from_status=prev_status.value,
            to_status=new_status.value,
            commit=False,
        )
    if "assigned_to_user_id" in fields and fields["assigned_to_user_id"] != prev_assignee:
        if wo.status == WorkOrderStatus.open:
            wo.status = WorkOrderStatus.assigned
        log_event(
            db,
            wo,
            actor_user_id=actor_user_id,
            event_type="assigned",
            to_status=wo.status.value,
            commit=False,
        )

    db.commit()
    db.refresh(wo)
    return wo


def transition_work_order(
    db: Session,
    wo: WorkOrder,
    *,
    to_status: WorkOrderStatus,
    actor_user_id: int,
    notes: str | None = None,
    reason: str | None = None,
    proof_image_path: str | None = None,
) -> WorkOrder:
    """Apply a field-lifecycle transition and log it."""
    prev = wo.status
    now = datetime.now(timezone.utc)

    wo.status = to_status
    if to_status == WorkOrderStatus.accepted:
        wo.accepted_at = now
    elif to_status == WorkOrderStatus.in_progress:
        wo.started_at = now
    elif to_status == WorkOrderStatus.completed:
        wo.completed_at = now
        if proof_image_path:
            wo.proof_image_path = proof_image_path
        if notes:
            wo.notes = notes
        if wo.detection_id:
            det = db.query(PotholeDetection).filter(PotholeDetection.id == wo.detection_id).first()
            if det:
                det.evolution_stage = "resolved"
    elif to_status == WorkOrderStatus.declined:
        wo.declined_reason = reason
        wo.assigned_to_user_id = None

    log_event(
        db,
        wo,
        actor_user_id=actor_user_id,
        event_type=to_status.value,
        from_status=prev.value,
        to_status=to_status.value,
        commit=False,
    )
    db.commit()
    db.refresh(wo)
    return wo


def work_order_to_dict(db: Session, wo: WorkOrder) -> dict:
    assignee = None
    if wo.assigned_to_user_id:
        u = db.query(User).filter(User.id == wo.assigned_to_user_id).first()
        assignee = u.full_name if u else None
    verified_by_name = None
    if wo.verified_by_user_id:
        vu = db.query(User).filter(User.id == wo.verified_by_user_id).first()
        verified_by_name = vu.full_name if vu else None
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
    events = (
        db.query(WorkOrderEvent)
        .filter(WorkOrderEvent.work_order_id == wo.id)
        .order_by(WorkOrderEvent.created_at.asc())
        .all()
    )
    actor_names: dict[int, str] = {}
    actor_ids = {e.actor_user_id for e in events if e.actor_user_id}
    if actor_ids:
        for u in db.query(User).filter(User.id.in_(actor_ids)).all():
            actor_names[u.id] = u.full_name
    event_dicts = [
        {
            "id": e.id,
            "event_type": e.event_type,
            "from_status": e.from_status,
            "to_status": e.to_status,
            "actor_user_id": e.actor_user_id,
            "actor_name": actor_names.get(e.actor_user_id),
            "created_at": e.created_at,
        }
        for e in events
    ]
    return {
        "id": wo.id,
        "detection_id": wo.detection_id,
        "title": wo.title,
        "description": wo.description,
        "status": wo.status.value,
        "priority": wo.priority.value,
        "assigned_to_user_id": wo.assigned_to_user_id,
        "assignee_name": assignee,
        "verified_by_user_id": wo.verified_by_user_id,
        "verified_by_name": verified_by_name,
        "scheduled_date": wo.scheduled_date,
        "accepted_at": wo.accepted_at,
        "started_at": wo.started_at,
        "completed_at": wo.completed_at,
        "verified_at": wo.verified_at,
        "repair_cost_estimate": wo.repair_cost_estimate,
        "repair_cost_actual": wo.repair_cost_actual,
        "notes": wo.notes,
        "proof_image_path": wo.proof_image_path,
        "proof_image_url": _proof_url(wo.proof_image_path, wo.organization_id),
        "declined_reason": wo.declined_reason,
        "created_at": wo.created_at,
        "updated_at": wo.updated_at,
        "detection": det,
        "events": event_dicts,
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
