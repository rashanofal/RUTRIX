"""Organization audit trail for municipal compliance."""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import AuditEvent, User


def log_audit(
    db: Session,
    *,
    organization_id: int,
    user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    detail: dict | str | None = None,
    commit: bool = True,
) -> AuditEvent:
    detail_text = None
    if detail is not None:
        detail_text = detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)

    ev = AuditEvent(
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail_text,
    )
    db.add(ev)
    if commit:
        db.commit()
        db.refresh(ev)
    else:
        db.flush()
    return ev


def list_audit_events(
    db: Session,
    organization_id: int,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.organization_id == organization_id)
        .order_by(AuditEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    user_ids = {r.user_id for r in rows if r.user_id}
    names: dict[int, str] = {}
    if user_ids:
        for u in db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all():
            names[u.id] = u.full_name

    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_name": names.get(r.user_id) if r.user_id else None,
                "action": r.action,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "detail": r.detail,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out
