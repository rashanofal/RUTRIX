"""Row-level access: org supervisors see org-wide data; field users see only their uploads."""

from __future__ import annotations

from sqlalchemy.orm import Query, Session

from app.config import settings
from app.models import DetectionStatus, MemberRole, PotholeDetection, User
from app.services.auth_service import effective_organization_id, is_platform_owner_user


def _normalize_role(role: str | MemberRole | None) -> str | None:
    if role is None:
        return None
    if isinstance(role, MemberRole):
        return role.value
    return str(role)


def is_platform_owner(user: User, role: str | MemberRole | None = None) -> bool:
    """Platform operator (configured email) — full org + destructive ops."""
    return bool(user and is_platform_owner_user(user))


def is_org_supervisor(role: str | MemberRole | None) -> bool:
    """Org owner/admin — operational supervisor within their organization."""
    return _normalize_role(role) in (MemberRole.owner.value, MemberRole.admin.value)


def has_org_wide_detection_access(user: User, role: str | MemberRole | None) -> bool:
    """See all non-rejected detections in the organization."""
    return is_platform_owner(user, role) or is_org_supervisor(role)


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
    if not has_org_wide_detection_access(user, role):
        q = q.filter(PotholeDetection.reporter_user_id == user.id)
    return q


def detection_visible_to_user(
    detection: PotholeDetection | dict,
    user: User,
    role: str | MemberRole | None,
) -> bool:
    if has_org_wide_detection_access(user, role):
        return True
    rep_id = (
        detection.get("reporter_user_id")
        if isinstance(detection, dict)
        else getattr(detection, "reporter_user_id", None)
    )
    return rep_id == user.id
