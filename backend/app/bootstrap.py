"""Database bootstrap: migrations for existing DBs + demo account."""

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, engine
from app.models import Base, MemberRole, Organization, OrganizationMember, PotholeDetection, User
from app.services.auth_service import hash_password, register_user, verify_password
from app.services.inference import reload_model
from app.services.rut_intelligence import analyze_detection

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


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)
    if settings.database_url.startswith("sqlite"):
        _add_column_if_missing("pothole_detections", "organization_id", "INTEGER")
        _add_column_if_missing("upload_records", "organization_id", "INTEGER")
        for col, typ in INTELLIGENCE_COLUMNS:
            _add_column_if_missing("pothole_detections", col, typ)
        for col, typ in WORK_ORDER_COLUMNS:
            _add_column_if_missing("work_orders", col, typ)


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

    db.query(PotholeDetection).filter(PotholeDetection.organization_id.is_(None)).update(
        {PotholeDetection.organization_id: org_id}
    )
    db.query(UploadRecord).filter(UploadRecord.organization_id.is_(None)).update(
        {UploadRecord.organization_id: org_id}
    )
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


def bootstrap() -> None:
    run_migrations()
    seed_demo_account()
    backfill_intelligence()
