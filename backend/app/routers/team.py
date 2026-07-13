"""Organization team management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_organization, get_current_role, get_current_user
from app.models import MemberRole, Organization, OrganizationMember, User
from app.schemas import TeamInviteRequest, TeamMemberResponse, TeamResetPasswordRequest
from app.services.auth_service import invite_user_to_organization, reset_member_password
from app.services.team_service import member_activity_stats

router = APIRouter(prefix="/api/team", tags=["team"])

_ADMIN_ROLES = {MemberRole.owner, MemberRole.admin}


def _require_admin_membership(db: Session, org_id: int, user_id: int) -> OrganizationMember:
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if not membership or membership.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح للمشرفين فقط")
    return membership


def _require_owner(role: str, user: User) -> None:
    owner_email = settings.owner_email.strip().lower()
    if role != MemberRole.owner.value or user.email.strip().lower() != owner_email:
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح لمالك المنصة فقط")


def _member_payload(
    m: OrganizationMember,
    u: User,
    org_id: int,
    db: Session,
    *,
    include_password: bool,
) -> TeamMemberResponse:
    stats = member_activity_stats(db, org_id, u.id)
    return TeamMemberResponse(
        user_id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=m.role.value,
        joined_at=m.created_at,
        last_login_at=u.last_login_at,
        provisioned_password=m.provisioned_password if include_password else None,
        **stats,
    )


@router.get("/members", response_model=list[TeamMemberResponse])
def list_members(
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    include_password = role == MemberRole.owner.value
    rows = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org.id)
        .order_by(OrganizationMember.created_at)
        .all()
    )
    return [_member_payload(m, u, org.id, db, include_password=include_password) for m, u in rows]


@router.post("/invite", response_model=TeamMemberResponse)
def invite_member(
    payload: TeamInviteRequest,
    current: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_admin_membership(db, org.id, current.id)
    if payload.role == MemberRole.owner.value:
        raise HTTPException(status_code=400, detail="لا يمكن تعيين دور مالك — مالك واحد فقط لكل منظمة")
    try:
        user = invite_user_to_organization(
            db,
            org,
            payload.email,
            payload.password,
            payload.full_name,
            MemberRole(payload.role),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=500, detail="تعذّر إنشاء العضو")
    return _member_payload(
        member,
        user,
        org.id,
        db,
        include_password=role == MemberRole.owner.value,
    )


@router.post("/members/{user_id}/reset-password", response_model=TeamMemberResponse)
def reset_password(
    user_id: int,
    payload: TeamResetPasswordRequest,
    current: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    _require_owner(role, current)
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="استخدم صفحة الملف الشخصي لتغيير كلمة مرورك")
    try:
        membership = reset_member_password(db, org.id, user_id, payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return _member_payload(membership, user, org.id, db, include_password=True)


@router.delete("/members/{user_id}")
def remove_member(
    user_id: int,
    current: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    _require_admin_membership(db, org.id, current.id)

    if user_id == current.id:
        raise HTTPException(status_code=400, detail="لا يمكن إزالة حسابك")

    target = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود في المنظمة")
    if target.role == MemberRole.owner:
        raise HTTPException(status_code=400, detail="لا يمكن إزالة مالك المنظمة")

    db.delete(target)
    db.commit()

    remaining = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .count()
    )
    if remaining == 0:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_active = False
            db.commit()

    return {"message": "ok", "user_id": user_id}
