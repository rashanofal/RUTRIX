"""Row-level access: platform owner sees org-wide data; everyone else sees only their uploads."""

from __future__ import annotations

from sqlalchemy.orm import Query, Session

from app.config import settings
from app.models import DetectionStatus, MemberRole, PotholeDetection, User
from app.services.auth_service import effective_organization_id


def is_platform_owner(user: User, role: str | MemberRole | None) -> bool:
    role_val = role.value if isinstance(role, MemberRole) else role
    if role_val != MemberRole.owner.value:
        return False
    owner_email = settings.owner_email.strip().lower()
    return user.email.strip().lower() == owner_email


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
