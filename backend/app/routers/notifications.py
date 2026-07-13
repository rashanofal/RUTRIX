"""User notification inbox and Expo push token registration."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import Notification, Organization, PushToken, User
from app.schemas import NotificationResponse, PushTokenRegister, PushTokenUnregister

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
push_router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(
        Notification.organization_id == org.id,
        Notification.user_id == user.id,
    )
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    items = q.order_by(Notification.created_at.desc()).limit(limit).all()
    return [NotificationResponse.model_validate(n) for n in items]


@router.get("/unread-count")
def unread_count(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    count = (
        db.query(Notification)
        .filter(
            Notification.organization_id == org.id,
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )
    return {"unread": count}


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    note = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user.id,
            Notification.organization_id == org.id,
        )
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Notification not found")
    note.is_read = True
    db.commit()
    db.refresh(note)
    return NotificationResponse.model_validate(note)


@router.post("/read-all")
def mark_all_read(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    updated = (
        db.query(Notification)
        .filter(
            Notification.organization_id == org.id,
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
        .update({Notification.is_read: True}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


@push_router.post("/register")
def register_push_token(
    payload: PushTokenRegister,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(PushToken).filter(PushToken.expo_token == payload.expo_token).first()
    )
    if existing:
        existing.user_id = user.id
        existing.organization_id = org.id
        existing.platform = payload.platform
        existing.enabled = True
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(
            PushToken(
                user_id=user.id,
                organization_id=org.id,
                expo_token=payload.expo_token,
                platform=payload.platform,
                enabled=True,
            )
        )
    db.commit()
    return {"status": "ok"}


@push_router.post("/unregister")
def unregister_push_token(
    payload: PushTokenUnregister,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    (
        db.query(PushToken)
        .filter(PushToken.expo_token == payload.expo_token, PushToken.user_id == user.id)
        .update({PushToken.enabled: False}, synchronize_session=False)
    )
    db.commit()
    return {"status": "ok"}
