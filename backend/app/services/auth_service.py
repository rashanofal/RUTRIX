import re
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.models import MemberRole, Organization, OrganizationMember, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    base = base.strip("-") or "org"
    return f"{base}-{uuid.uuid4().hex[:6]}"


def create_access_token(user_id: int, organization_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "org_id": organization_id,
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def register_user(
    db: Session,
    email: str,
    password: str,
    full_name: str,
    organization_name: str,
) -> tuple[User, Organization]:
    email = email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise ValueError("البريد مسجّل مسبقاً")

    org = Organization(name=organization_name.strip(), slug=slugify(organization_name))
    db.add(org)
    db.flush()

    user = User(
        email=email,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()

    db.add(
        OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role=MemberRole.owner,
        )
    )
    db.commit()
    db.refresh(user)
    db.refresh(org)
    return user, org


def authenticate(db: Session, email: str, password: str) -> tuple[User, Organization] | None:
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email, User.is_active.is_(True)).first()
    if not user or not verify_password(password, user.password_hash):
        return None

    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .order_by(OrganizationMember.id.asc())
        .first()
    )
    if not membership:
        return None

    org = db.query(Organization).filter(Organization.id == membership.organization_id).first()
    if not org or not org.is_active:
        return None

    return user, org


def get_user_org_membership(db: Session, user_id: int, org_id: int) -> OrganizationMember | None:
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.organization_id == org_id,
        )
        .first()
    )


def invite_user_to_organization(
    db: Session,
    org: Organization,
    email: str,
    password: str,
    full_name: str,
    role: MemberRole,
) -> User:
    email = email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        dup = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org.id,
                OrganizationMember.user_id == existing.id,
            )
            .first()
        )
        if dup:
            raise ValueError("المستخدم موجود بالفعل في المنظمة")
        db.add(
            OrganizationMember(
                organization_id=org.id,
                user_id=existing.id,
                role=role,
            )
        )
        db.commit()
        db.refresh(existing)
        return existing

    user = User(
        email=email,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()
    db.add(
        OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role=role,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def update_user_profile(db: Session, user: User, full_name: str) -> User:
    user.full_name = full_name.strip()
    db.commit()
    db.refresh(user)
    return user


def change_user_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise ValueError("كلمة المرور الحالية غير صحيحة")
    if current_password == new_password:
        raise ValueError("كلمة المرور الجديدة يجب أن تختلف عن الحالية")
    user.password_hash = hash_password(new_password)
    db.commit()
