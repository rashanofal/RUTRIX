"""Organization team management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import MemberRole, Organization, OrganizationMember, User
from app.schemas import TeamInviteRequest, TeamMemberResponse
from app.services.auth_service import invite_user_to_organization

router = APIRouter(prefix="/api/team", tags=["team"])


@router.get("/members", response_model=list[TeamMemberResponse])
def list_members(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org.id)
        .order_by(OrganizationMember.created_at)
        .all()
    )
    return [
        TeamMemberResponse(
            user_id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=m.role.value,
            joined_at=m.created_at,
        )
        for m, u in rows
    ]


@router.post("/invite", response_model=TeamMemberResponse)
def invite_member(
    payload: TeamInviteRequest,
    current: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == current.id,
        )
        .first()
    )
    if not membership or membership.role not in (MemberRole.owner, MemberRole.admin):
        raise HTTPException(status_code=403, detail="Admin access required")

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
    return TeamMemberResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=member.role.value if member else payload.role.value,
        joined_at=member.created_at if member else user.created_at,
    )
