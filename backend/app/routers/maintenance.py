"""Maintenance work orders and municipal operations dashboard."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import Organization, User, WorkOrderPriority, WorkOrderStatus
from app.schemas import (
    MaintenanceDashboardResponse,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from app.services.maintenance_service import (
    create_work_order,
    get_maintenance_dashboard,
    list_work_orders,
    update_work_order,
    work_order_to_dict,
)

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.get("/dashboard", response_model=MaintenanceDashboardResponse)
def maintenance_dashboard(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    return MaintenanceDashboardResponse(**get_maintenance_dashboard(db, org.id))


@router.get("/work-orders", response_model=list[WorkOrderResponse])
def get_work_orders(
    status: str | None = None,
    limit: int = Query(100, le=200),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    status_enum = WorkOrderStatus(status) if status else None
    items = list_work_orders(db, org.id, status=status_enum, limit=limit)
    return [WorkOrderResponse(**work_order_to_dict(db, wo)) for wo in items]


@router.post("/work-orders", response_model=WorkOrderResponse)
def post_work_order(
    payload: WorkOrderCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
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
    return WorkOrderResponse(**work_order_to_dict(db, wo))


@router.patch("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
def patch_work_order(
    work_order_id: int,
    payload: WorkOrderUpdate,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    fields = payload.model_dump(exclude_unset=True)
    if "scheduled_date" in fields and fields["scheduled_date"]:
        fields["scheduled_date"] = datetime.fromisoformat(
            fields["scheduled_date"].replace("Z", "+00:00")
        )
    if "status" in fields and fields["status"]:
        fields["status"] = WorkOrderStatus(fields["status"])
    if "priority" in fields and fields["priority"]:
        fields["priority"] = WorkOrderPriority(fields["priority"])
    wo = update_work_order(db, work_order_id, org.id, **fields)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return WorkOrderResponse(**work_order_to_dict(db, wo))
