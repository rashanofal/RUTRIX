from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import Organization, User
from app.schemas import AuthResponse, LoginRequest, OrganizationResponse, RegisterRequest, UserResponse
from app.services.auth_service import authenticate, create_access_token, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
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
        user=UserResponse.model_validate(user),
        organization=OrganizationResponse.model_validate(org),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    result = authenticate(db, payload.email, payload.password)
    if not result:
        raise HTTPException(status_code=401, detail="بريد أو كلمة مرور غير صحيحة")

    user, org = result
    token = create_access_token(user.id, org.id, user.email)
    return AuthResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
        organization=OrganizationResponse.model_validate(org),
    )


@router.get("/me", response_model=AuthResponse)
def me(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
):
    return AuthResponse(
        access_token=credentials.credentials,
        user=UserResponse.model_validate(user),
        organization=OrganizationResponse.model_validate(org),
    )
