"""Central notification fan-out: DB inbox + WebSocket + Expo push."""

from __future__ import annotations

import logging

import httpx
from sqlalchemy.orm import Session

from app.models import MemberRole, Notification, OrganizationMember, PushToken, User
from app.websocket import manager

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def create_notification(
    db: Session,
    *,
    organization_id: int,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    work_order_id: int | None = None,
    detection_id: int | None = None,
) -> Notification:
    note = Notification(
        organization_id=organization_id,
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        work_order_id=work_order_id,
        detection_id=detection_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_org_admin_ids(db: Session, organization_id: int) -> list[int]:
    rows = (
        db.query(OrganizationMember.user_id)
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.role.in_([MemberRole.owner, MemberRole.admin]),
        )
        .all()
    )
    return [r[0] for r in rows]


def _expo_tokens(db: Session, user_id: int) -> list[str]:
    rows = (
        db.query(PushToken.expo_token)
        .filter(PushToken.user_id == user_id, PushToken.enabled.is_(True))
        .all()
    )
    return [r[0] for r in rows if r[0]]


async def _send_expo_push(
    tokens: list[str], title: str, body: str | None, data: dict | None = None
) -> None:
    messages = [
        {
            "to": token,
            "title": title,
            "body": body or "",
            "sound": "default",
            "priority": "high",
            "data": data or {},
        }
        for token in tokens
        if str(token).startswith("ExponentPushToken")
    ]
    if not messages:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
    except Exception as exc:  # push failures must never break the request
        logger.warning("Expo push failed: %s", exc)


async def notify_user(
    db: Session,
    *,
    organization_id: int,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    work_order_id: int | None = None,
    detection_id: int | None = None,
) -> Notification:
    """Persist a notification, push it over WebSocket, and send Expo push."""
    note = create_notification(
        db,
        organization_id=organization_id,
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        work_order_id=work_order_id,
        detection_id=detection_id,
    )

    ws_payload = {
        "type": "notification",
        "user_id": user_id,
        "data": {
            "id": note.id,
            "type": type,
            "title": title,
            "body": body,
            "work_order_id": work_order_id,
            "detection_id": detection_id,
            "created_at": str(note.created_at),
        },
    }
    try:
        await manager.broadcast(organization_id, ws_payload)
    except Exception as exc:
        logger.warning("WebSocket notification broadcast failed: %s", exc)

    tokens = _expo_tokens(db, user_id)
    if tokens:
        await _send_expo_push(
            tokens,
            title,
            body,
            data={"work_order_id": work_order_id, "detection_id": detection_id, "type": type},
        )
    return note
