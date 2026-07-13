from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import Organization, OrganizationMember, User
from app.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    OrganizationResponse,
    RegisterRequest,
    UpdateProfileRequest,
    UserResponse,
)
from app.config import settings
from app.services.auth_service import (
    authenticate,
    change_user_password,
    create_access_token,
    decode_token,
    register_user,
    register_user_in_demo_org,
    resolve_login_organization,
    update_user_profile,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


def _user_response(db: Session, user: User, org_id: int) -> UserResponse:
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user.id,
            OrganizationMember.organization_id == org_id,
        )
        .first()
    )
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role.value if membership else None,
        last_login_at=user.last_login_at,
    )


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        if settings.seed_demo_account and settings.demo_shared_registration:
            user, org = register_user_in_demo_org(
                db,
                email=payload.email,
                password=payload.password,
                full_name=payload.full_name,
            )
        else:
            user, org = register_user(
                db,
                email=payload.email,
                password=payload.password,
                full_name=payload.full_name,
                organization_name=payload.organization_name,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    token = create_access_token(user.id, org.id, user.email)
    return AuthResponse(
        access_token=token,
        user=_user_response(db, user, org.id),
        organization=OrganizationResponse.model_validate(org),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    result = authenticate(db, payload.email, payload.password)
    if not result:
        raise HTTPException(status_code=401, detail="بريد أو كلمة مرور غير صحيحة")

    user, org = result
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    login_org = resolve_login_organization(db, user) or org
    token = create_access_token(user.id, login_org.id, user.email)
    return AuthResponse(
        access_token=token,
        user=_user_response(db, user, login_org.id),
        organization=OrganizationResponse.model_validate(login_org),
    )


@router.get("/me", response_model=AuthResponse)
def me(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    session_org = resolve_login_organization(db, user) or org
    token = credentials.credentials
    payload = decode_token(token) if credentials else None
    if payload and int(payload.get("org_id", 0)) != session_org.id:
        token = create_access_token(user.id, session_org.id, user.email)
    return AuthResponse(
        access_token=token,
        user=_user_response(db, user, session_org.id),
        organization=OrganizationResponse.model_validate(session_org),
    )


@router.patch("/me", response_model=AuthResponse)
def update_me(
    payload: UpdateProfileRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    user = update_user_profile(db, user, payload.full_name)
    return AuthResponse(
        access_token=credentials.credentials,
        user=_user_response(db, user, org.id),
        organization=OrganizationResponse.model_validate(org),
    )


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        change_user_password(db, user, payload.current_password, payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"message": "تم تحديث كلمة المرور"}
