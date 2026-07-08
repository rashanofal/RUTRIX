from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Organization, OrganizationMember, User
from app.services.auth_service import decode_token, get_user_org_membership

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="يلزم تسجيل الدخول",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="جلسة غير صالحة")

    user = db.query(User).filter(User.id == int(payload["sub"]), User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="المستخدم غير موجود")
    return user


def get_current_organization(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Organization:
    if not credentials:
        raise HTTPException(status_code=401, detail="يلزم تسجيل الدخول")

    payload = decode_token(credentials.credentials)
    org_id = payload.get("org_id") if payload else None
    if not org_id:
        raise HTTPException(status_code=401, detail="منظمة غير محددة")

    membership = get_user_org_membership(db, user.id, int(org_id))
    if not membership:
        raise HTTPException(status_code=403, detail="لا صلاحية لهذه المنظمة")

    org = db.query(Organization).filter(Organization.id == int(org_id)).first()
    if not org or not org.is_active:
        raise HTTPException(status_code=403, detail="المنظمة غير نشطة")
    return org
