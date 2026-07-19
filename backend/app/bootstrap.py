"""Database bootstrap: migrations for existing DBs + demo account."""

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.persistence import ensure_storage_dirs
from app.database import SessionLocal, engine
from app.models import Base, MemberRole, Organization, OrganizationMember, PotholeDetection, User
from app.services.auth_service import get_demo_organization, get_user_org_membership, hash_password, register_user, verify_password
from app.services.rut_intelligence import analyze_detection
# Do not import inference/YOLO at module load — keeps uvicorn import fast on HF.

INTELLIGENCE_COLUMNS = [
    ("reporter_user_id", "INTEGER"),
    ("severity", "VARCHAR(20) DEFAULT 'low'"),
    ("rut_score", "REAL DEFAULT 0"),
    ("estimated_depth_cm", "REAL"),
    ("estimated_width_cm", "REAL"),
    ("vehicle_risk_score", "REAL DEFAULT 0"),
    ("repair_cost_min", "REAL"),
    ("repair_cost_max", "REAL"),
    ("tire_damage_risk", "REAL"),
    ("anomaly_type", "VARCHAR(50) DEFAULT 'pothole'"),
    ("confirmation_count", "INTEGER DEFAULT 1"),
    ("evolution_stage", "VARCHAR(20) DEFAULT 'new'"),
    ("predicted_days_to_critical", "INTEGER"),
    ("bicycle_safe", "INTEGER DEFAULT 1"),
    ("priority_rank", "INTEGER DEFAULT 0"),
    ("rejection_reason", "TEXT"),
    ("mission_id", "VARCHAR(100)"),
    ("frame_index", "INTEGER"),
    ("timestamp_sec", "REAL"),
    ("video_path", "VARCHAR(500)"),
]


def _add_column_if_missing(table: str, column: str, col_type: str) -> None:
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns(table)}
    if column in cols:
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))


WORK_ORDER_COLUMNS = [
    ("verified_by_user_id", "INTEGER"),
    ("accepted_at", "TIMESTAMP"),
    ("started_at", "TIMESTAMP"),
    ("verified_at", "TIMESTAMP"),
    ("proof_image_path", "VARCHAR(500)"),
    ("declined_reason", "TEXT"),
]

ORG_MEMBER_COLUMNS = [
    ("provisioned_password", "VARCHAR(120)"),
]

USER_COLUMNS = [
    ("last_login_at", "TIMESTAMP"),
]


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)
    if settings.database_url.startswith("sqlite"):
        _add_column_if_missing("pothole_detections", "organization_id", "INTEGER")
        _add_column_if_missing("upload_records", "organization_id", "INTEGER")
        for col, typ in INTELLIGENCE_COLUMNS:
            _add_column_if_missing("pothole_detections", col, typ)
        for col, typ in WORK_ORDER_COLUMNS:
            _add_column_if_missing("work_orders", col, typ)
        for col, typ in USER_COLUMNS:
            _add_column_if_missing("users", col, typ)
        for col, typ in ORG_MEMBER_COLUMNS:
            _add_column_if_missing("organization_members", col, typ)


def backfill_intelligence() -> None:
    db = SessionLocal()
    try:
        photos = db.query(PotholeDetection).filter(PotholeDetection.class_name == "photo").all()
        for d in photos:
            d.rut_score = 0.0
            d.severity = "low"
            d.repair_cost_min = 0.0
            d.repair_cost_max = 0.0
            d.priority_rank = 0
            d.vehicle_risk_score = 0.0
        if photos:
            db.commit()

        rows = (
            db.query(PotholeDetection)
            .filter(PotholeDetection.class_name != "photo")
            .limit(2000)
            .all()
        )
        for d in rows:
            intel = analyze_detection(
                class_name=d.class_name or "pothole",
                confidence=d.confidence or 0.5,
                bbox_w=d.bbox_w,
                bbox_h=d.bbox_h,
                confirmation_count=d.confirmation_count or 1,
                evolution_stage=d.evolution_stage or "new",
            )
            for k, v in intel.items():
                if k == "vehicle_risk_label":
                    continue
                setattr(d, k, v)
        if rows:
            db.commit()
    finally:
        db.close()


def _assign_orphan_data(db: Session, org_id: int) -> None:
    from app.models import UploadRecord

    member_ids = [
        m.user_id
        for m in db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id)
        .all()
    ]
    if not member_ids:
        return

    db.query(PotholeDetection).filter(
        PotholeDetection.organization_id.is_(None),
        PotholeDetection.reporter_user_id.in_(member_ids),
    ).update({PotholeDetection.organization_id: org_id}, synchronize_session=False)

    # Upload records without org: only attach files under this org's upload folder.
    org_prefix = f"/{org_id}/"
    orphans = db.query(UploadRecord).filter(UploadRecord.organization_id.is_(None)).all()
    for row in orphans:
        if org_prefix in row.file_path.replace("\\", "/"):
            row.organization_id = org_id
    db.commit()


def reconcile_detection_orgs(db: Session) -> None:
    """Ensure each detection belongs to its reporter's organization."""
    rows = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.reporter_user_id.isnot(None))
        .all()
    )
    changed = False
    for det in rows:
        membership = (
            db.query(OrganizationMember)
            .filter(OrganizationMember.user_id == det.reporter_user_id)
            .order_by(OrganizationMember.id.asc())
            .first()
        )
        if membership and det.organization_id != membership.organization_id:
            det.organization_id = membership.organization_id
            changed = True
    if changed:
        db.commit()


def _resolve_platform_owner(db: Session) -> User | None:
    """Return the configured platform owner user, fixing common email typos."""
    owner_email = settings.owner_email.strip().lower()
    user = db.query(User).filter(User.email == owner_email).first()
    if user:
        return user
    typo = owner_email.replace("gmail.com", "gmai.com")
    if typo != owner_email:
        wrong = db.query(User).filter(User.email == typo).first()
        if wrong:
            wrong.email = owner_email
            db.commit()
            db.refresh(wrong)
            return wrong
    return None


def reconcile_owner_roles(db: Session) -> None:
    """One owner per org — platform owner email is the sole owner when present."""
    owner_user = _resolve_platform_owner(db)
    owner_user_id = owner_user.id if owner_user else None

    changed = False
    for org in db.query(Organization).all():
        members = (
            db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == org.id)
            .order_by(OrganizationMember.id.asc())
            .all()
        )
        if not members:
            continue

        owner_member = members[0]
        if owner_user_id:
            platform_m = next((m for m in members if m.user_id == owner_user_id), None)
            if platform_m:
                owner_member = platform_m

        for m in members:
            if m.id == owner_member.id:
                if m.role != MemberRole.owner:
                    m.role = MemberRole.owner
                    changed = True
            elif m.role == MemberRole.owner:
                m.role = MemberRole.field
                changed = True

    if changed:
        db.commit()


def seed_demo_account() -> None:
    if not settings.seed_demo_account:
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == settings.demo_email).first()
        if existing:
            if not verify_password(settings.demo_password, existing.password_hash):
                existing.password_hash = hash_password(settings.demo_password)
                db.commit()
            membership = (
                db.query(OrganizationMember)
                .filter(OrganizationMember.user_id == existing.id)
                .first()
            )
            if membership:
                if not membership.provisioned_password:
                    membership.provisioned_password = settings.demo_password
                    db.commit()
                _assign_orphan_data(db, membership.organization_id)
            return

        user, org = register_user(
            db,
            email=settings.demo_email,
            password=settings.demo_password,
            full_name="حساب تجريبي",
            organization_name=settings.demo_org_name,
        )
        _assign_orphan_data(db, org.id)
    finally:
        db.close()


def reconcile_canonical_organization(db: Session) -> None:
    """Unify self-registered users into the shared org; attach platform owner for supervision."""
    if not settings.demo_shared_registration or not settings.seed_demo_account:
        return

    canonical = get_demo_organization(db)
    if not canonical:
        return

    owner_user = _resolve_platform_owner(db)
    owner_email = settings.owner_email.strip().lower()
    changed = False

    if owner_user:
        owner_m = get_user_org_membership(db, owner_user.id, canonical.id)
        if not owner_m:
            db.add(
                OrganizationMember(
                    organization_id=canonical.id,
                    user_id=owner_user.id,
                    role=MemberRole.owner,
                )
            )
            changed = True
        elif owner_m.role != MemberRole.owner:
            owner_m.role = MemberRole.owner
            changed = True

    demo_email = settings.demo_email.strip().lower()
    for org in db.query(Organization).filter(Organization.id != canonical.id).all():
        members = (
            db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == org.id)
            .all()
        )
        if len(members) != 1:
            continue
        m = members[0]
        user = db.query(User).filter(User.id == m.user_id, User.is_active.is_(True)).first()
        if not user:
            continue
        email = user.email.strip().lower()
        if email == owner_email or email == demo_email:
            continue
        if get_user_org_membership(db, user.id, canonical.id):
            continue

        db.query(PotholeDetection).filter(
            PotholeDetection.reporter_user_id == user.id,
        ).update({PotholeDetection.organization_id: canonical.id}, synchronize_session=False)

        db.add(
            OrganizationMember(
                organization_id=canonical.id,
                user_id=user.id,
                role=MemberRole.field,
                provisioned_password=m.provisioned_password,
            )
        )
        db.delete(m)
        changed = True

    if changed:
        db.commit()


def bootstrap() -> None:
    ensure_storage_dirs()
    run_migrations()
    seed_demo_account()
    db = SessionLocal()
    try:
        reconcile_canonical_organization(db)
        reconcile_detection_orgs(db)
        reconcile_owner_roles(db)
    finally:
        db.close()
    backfill_intelligence()


def bootstrap_fast() -> None:
    """Must finish before the API accepts traffic (dirs + schema only)."""
    ensure_storage_dirs()
    run_migrations()


def bootstrap_background() -> None:
    """Non-critical reconcile/backfill — safe after the app is listening."""
    try:
        seed_demo_account()
        db = SessionLocal()
        try:
            reconcile_canonical_organization(db)
            reconcile_detection_orgs(db)
            reconcile_owner_roles(db)
        finally:
            db.close()
        backfill_intelligence()
    except Exception:
        import logging

        logging.getLogger(__name__).exception("background bootstrap failed")
