"""Row-level access: platform owner sees org-wide data; everyone else sees only their uploads."""

from __future__ import annotations

from sqlalchemy.orm import Query, Session

from app.config import settings
from app.models import DetectionStatus, MemberRole, PotholeDetection, User
from app.services.auth_service import effective_organization_id, is_platform_owner_user


def is_platform_owner(user: User, role: str | MemberRole | None = None) -> bool:
    """Owner is identified by configured email so phone/web both get org-wide map access."""
    return bool(user and is_platform_owner_user(user))


def scoped_detections_query(
    db: Session,
    organization_id: int,
    user: User,
    role: str | MemberRole | None,
) -> Query:
    org_id = effective_organization_id(db, organization_id, user, role)
    q = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == org_id)
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
    )
    if not is_platform_owner(user, role):
        q = q.filter(PotholeDetection.reporter_user_id == user.id)
    return q


def detection_visible_to_user(
    detection: PotholeDetection | dict,
    user: User,
    role: str | MemberRole | None,
) -> bool:
    if is_platform_owner(user, role):
        return True
    rep_id = (
        detection.get("reporter_user_id")
        if isinstance(detection, dict)
        else getattr(detection, "reporter_user_id", None)
    )
    return rep_id == user.id
