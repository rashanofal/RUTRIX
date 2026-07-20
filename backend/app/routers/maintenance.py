"""Maintenance work orders and municipal operations dashboard."""

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_role, get_current_user
from app.models import (
    NotificationType,
    Organization,
    User,
    WorkOrder,
    WorkOrderPriority,
    WorkOrderStatus,
)
from app.schemas import (
    MaintenanceDashboardResponse,
    WorkOrderActionRequest,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from app.services.audit_service import log_audit
from app.services.geo_service import save_upload_file
from app.services.maintenance_service import (
    create_work_order,
    delete_work_order,
    get_maintenance_dashboard,
    get_work_order,
    list_work_orders,
    reject_work_completion,
    transition_work_order,
    update_work_order,
    work_order_to_dict,
)
from app.services.notification_service import get_org_admin_ids, notify_user

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])

_ADMIN_ROLES = {"owner", "admin"}


def _audit_wo(
    db: Session,
    *,
    org_id: int,
    user_id: int | None,
    action: str,
    wo: WorkOrder,
    detail: dict | None = None,
) -> None:
    payload = {"title": wo.title, "status": wo.status.value if wo.status else None}
    if detail:
        payload.update(detail)
    log_audit(
        db,
        organization_id=org_id,
        user_id=user_id,
        action=action,
        entity_type="work_order",
        entity_id=wo.id,
        detail=payload,
    )


def _require_admin(role: str) -> None:
    if role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح للمشرفين فقط")


async def _notify_admins(
    db: Session,
    org_id: int,
    *,
    exclude_user_id: int | None,
    ntype: str,
    title: str,
    body: str,
    work_order_id: int,
) -> None:
    for admin_id in get_org_admin_ids(db, org_id):
        if admin_id == exclude_user_id:
            continue
        await notify_user(
            db,
            organization_id=org_id,
            user_id=admin_id,
            type=ntype,
            title=title,
            body=body,
            work_order_id=work_order_id,
        )


@router.get("/dashboard", response_model=MaintenanceDashboardResponse)
def maintenance_dashboard(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    return MaintenanceDashboardResponse(**get_maintenance_dashboard(db, org.id))


@router.get("/work-orders", response_model=list[WorkOrderResponse])
def get_work_orders(
    status: str | None = None,
    assigned_to_me: bool = False,
    limit: int = Query(100, le=200),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    status_enum = WorkOrderStatus(status) if status else None
    items = list_work_orders(
        db,
        org.id,
        status=status_enum,
        assigned_to_user_id=user.id if assigned_to_me else None,
        limit=limit,
    )
    return [WorkOrderResponse(**work_order_to_dict(db, wo)) for wo in items]


@router.get("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
def get_single_work_order(
    work_order_id: int,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    wo = get_work_order(db, work_order_id, org.id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.post("/work-orders", response_model=WorkOrderResponse)
async def post_work_order(
    payload: WorkOrderCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_admin(role)
    try:
        scheduled = (
            datetime.fromisoformat(payload.scheduled_date.replace("Z", "+00:00"))
            if payload.scheduled_date
            else None
        )
        prio = WorkOrderPriority(payload.priority) if payload.priority else None
        wo = create_work_order(
            db,
            org.id,
            user.id,
            detection_id=payload.detection_id,
            title=payload.title,
            description=payload.description,
            priority=prio,
            assigned_to_user_id=payload.assigned_to_user_id,
            scheduled_date=scheduled,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    if wo.assigned_to_user_id:
        await notify_user(
            db,
            organization_id=org.id,
            user_id=wo.assigned_to_user_id,
            type=NotificationType.work_order_assigned.value,
            title="أمر صيانة جديد مُسند إليك",
            body=wo.title,
            work_order_id=wo.id,
            detection_id=wo.detection_id,
        )
    _audit_wo(
        db,
        org_id=org.id,
        user_id=user.id,
        action="work_order.created",
        wo=wo,
        detail={"detection_id": wo.detection_id},
    )
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.patch("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
async def patch_work_order(
    work_order_id: int,
    payload: WorkOrderUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_admin(role)
    existing = get_work_order(db, work_order_id, org.id)
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    prev_assignee = existing.assigned_to_user_id

    fields = payload.model_dump(exclude_unset=True)
    if "scheduled_date" in fields and fields["scheduled_date"]:
        fields["scheduled_date"] = datetime.fromisoformat(
            fields["scheduled_date"].replace("Z", "+00:00")
        )
    if "status" in fields and fields["status"]:
        fields["status"] = WorkOrderStatus(fields["status"])
        blocked = {
            WorkOrderStatus.accepted,
            WorkOrderStatus.in_progress,
            WorkOrderStatus.completed,
            WorkOrderStatus.verified,
        }
        if fields["status"] in blocked:
            raise HTTPException(
                status_code=400,
                detail="خطوات القبول والتنفيذ والإتمام تتم من تطبيق الميدان فقط",
            )
    if "priority" in fields and fields["priority"]:
        fields["priority"] = WorkOrderPriority(fields["priority"])
    wo = update_work_order(db, work_order_id, org.id, actor_user_id=user.id, **fields)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    if wo.assigned_to_user_id and wo.assigned_to_user_id != prev_assignee:
        await notify_user(
            db,
            organization_id=org.id,
            user_id=wo.assigned_to_user_id,
            type=NotificationType.work_order_assigned.value,
            title="أمر صيانة مُسند إليك",
            body=wo.title,
            work_order_id=wo.id,
            detection_id=wo.detection_id,
        )
    if fields.get("status") == WorkOrderStatus.verified and wo.assigned_to_user_id:
        try:
            await notify_user(
                db,
                organization_id=org.id,
                user_id=wo.assigned_to_user_id,
                type=NotificationType.work_order_verified.value,
                title="تم اعتماد إنجازك",
                body=wo.title,
                work_order_id=wo.id,
            )
        except Exception:
            pass
    _audit_wo(
        db,
        org_id=org.id,
        user_id=user.id,
        action="work_order.updated",
        wo=wo,
        detail={"fields": list(fields.keys())},
    )
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.post("/work-orders/{work_order_id}/verify", response_model=WorkOrderResponse)
async def verify_work_order(
    work_order_id: int,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_admin(role)
    existing = get_work_order(db, work_order_id, org.id)
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    if existing.status != WorkOrderStatus.completed:
        raise HTTPException(
            status_code=400,
            detail="يمكن اعتماد الأمر فقط بعد إتمام الصيانة",
        )
    wo = update_work_order(
        db,
        work_order_id,
        org.id,
        actor_user_id=user.id,
        status=WorkOrderStatus.verified,
    )
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.assigned_to_user_id:
        try:
            await notify_user(
                db,
                organization_id=org.id,
                user_id=wo.assigned_to_user_id,
                type=NotificationType.work_order_verified.value,
                title="تم اعتماد إنجازك",
                body=wo.title,
                work_order_id=wo.id,
            )
        except Exception:
            pass
    _audit_wo(db, org_id=org.id, user_id=user.id, action="work_order.verified", wo=wo)
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.delete("/work-orders/{work_order_id}", status_code=204)
def remove_work_order(
    work_order_id: int,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_admin(role)
    try:
        deleted = delete_work_order(
            db, work_order_id, org.id, actor_user_id=user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Work order not found")
    log_audit(
        db,
        organization_id=org.id,
        user_id=user.id,
        action="work_order.deleted",
        entity_type="work_order",
        entity_id=work_order_id,
    )


@router.post("/work-orders/{work_order_id}/reject", response_model=WorkOrderResponse)
async def reject_work_order(
    work_order_id: int,
    payload: WorkOrderActionRequest | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_admin(role)
    wo = get_work_order(db, work_order_id, org.id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    reason = payload.reason if payload else None
    try:
        wo = reject_work_completion(db, wo, actor_user_id=user.id, reason=reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if wo.assigned_to_user_id:
        await notify_user(
            db,
            organization_id=org.id,
            user_id=wo.assigned_to_user_id,
            type=NotificationType.work_order_declined.value,
            title="تم رفض إنجاز الصيانة",
            body=f"{wo.title}" + (f" — {reason}" if reason else ""),
            work_order_id=wo.id,
            detection_id=wo.detection_id,
        )
    _audit_wo(
        db,
        org_id=org.id,
        user_id=user.id,
        action="work_order.rejected",
        wo=wo,
        detail={"reason": reason},
    )
    return WorkOrderResponse(**work_order_to_dict(db, wo))


def _require_assignee(wo: WorkOrder, user: User) -> None:
    if wo.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403, detail="هذا الأمر غير مُسند إليك")


@router.post("/work-orders/{work_order_id}/accept", response_model=WorkOrderResponse)
async def accept_work_order(
    work_order_id: int,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    wo = get_work_order(db, work_order_id, org.id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    _require_assignee(wo, user)
    if wo.status not in (WorkOrderStatus.assigned,):
        raise HTTPException(status_code=400, detail="لا يمكن قبول الأمر في حالته الحالية")
    wo = transition_work_order(
        db, wo, to_status=WorkOrderStatus.accepted, actor_user_id=user.id
    )
    await _notify_admins(
        db,
        org.id,
        exclude_user_id=user.id,
        ntype=NotificationType.work_order_accepted.value,
        title="تم قبول أمر الصيانة",
        body=f"{user.full_name} قبِل: {wo.title}",
        work_order_id=wo.id,
    )
    _audit_wo(db, org_id=org.id, user_id=user.id, action="work_order.accepted", wo=wo)
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.post("/work-orders/{work_order_id}/decline", response_model=WorkOrderResponse)
async def decline_work_order(
    work_order_id: int,
    payload: WorkOrderActionRequest | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    wo = get_work_order(db, work_order_id, org.id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    _require_assignee(wo, user)
    reason = payload.reason if payload else None
    title = wo.title
    wo = transition_work_order(
        db, wo, to_status=WorkOrderStatus.declined, actor_user_id=user.id, reason=reason
    )
    await _notify_admins(
        db,
        org.id,
        exclude_user_id=user.id,
        ntype=NotificationType.work_order_declined.value,
        title="تم رفض أمر الصيانة",
        body=f"{user.full_name} رفض: {title}" + (f" — {reason}" if reason else ""),
        work_order_id=wo.id,
    )
    _audit_wo(
        db,
        org_id=org.id,
        user_id=user.id,
        action="work_order.declined",
        wo=wo,
        detail={"reason": reason},
    )
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.post("/work-orders/{work_order_id}/start", response_model=WorkOrderResponse)
async def start_work_order(
    work_order_id: int,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    wo = get_work_order(db, work_order_id, org.id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    _require_assignee(wo, user)
    if wo.status not in (WorkOrderStatus.assigned, WorkOrderStatus.accepted):
        raise HTTPException(status_code=400, detail="لا يمكن بدء الأمر في حالته الحالية")
    wo = transition_work_order(
        db, wo, to_status=WorkOrderStatus.in_progress, actor_user_id=user.id
    )
    await _notify_admins(
        db,
        org.id,
        exclude_user_id=user.id,
        ntype=NotificationType.work_order_started.value,
        title="بدأ العمل على أمر الصيانة",
        body=f"{user.full_name} بدأ: {wo.title}",
        work_order_id=wo.id,
    )
    _audit_wo(db, org_id=org.id, user_id=user.id, action="work_order.started", wo=wo)
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.post("/work-orders/{work_order_id}/complete", response_model=WorkOrderResponse)
async def complete_work_order(
    work_order_id: int,
    notes: str | None = Form(None),
    proof: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    wo = get_work_order(db, work_order_id, org.id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    _require_assignee(wo, user)
    if wo.status not in (WorkOrderStatus.in_progress,):
        raise HTTPException(
            status_code=400,
            detail="يجب بدء العمل على الأمر قبل تسجيل الإتمام",
        )

    proof_path = None
    if proof is not None:
        content = await proof.read()
        if content:
            proof_path = save_upload_file(content, proof.filename or "proof.jpg", org.id)
    if not proof_path:
        raise HTTPException(status_code=400, detail="صورة إثبات الإصلاح مطلوبة")

    wo = transition_work_order(
        db,
        wo,
        to_status=WorkOrderStatus.completed,
        actor_user_id=user.id,
        notes=notes,
        proof_image_path=proof_path,
    )
    await _notify_admins(
        db,
        org.id,
        exclude_user_id=user.id,
        ntype=NotificationType.work_order_completed.value,
        title="أمر صيانة بانتظار الاعتماد",
        body=f"{user.full_name} أنجز: {wo.title}",
        work_order_id=wo.id,
    )
    _audit_wo(
        db,
        org_id=org.id,
        user_id=user.id,
        action="work_order.completed",
        wo=wo,
        detail={"has_proof": bool(proof_path)},
    )
    return WorkOrderResponse(**work_order_to_dict(db, wo))
