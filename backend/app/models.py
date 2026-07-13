import enum
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import is_sqlite
from app.database import Base

_enum_kw = {"native_enum": False} if is_sqlite() else {}


class DeviceType(str, enum.Enum):
    phone = "phone"
    mms = "mms"
    drone = "drone"


class LocationStatus(str, enum.Enum):
    confirmed = "confirmed"
    uncertain = "uncertain"
    pending = "pending"


class DetectionStatus(str, enum.Enum):
    detected = "detected"
    verified = "verified"
    rejected = "rejected"


class SeverityLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class EvolutionStage(str, enum.Enum):
    new = "new"
    growing = "growing"
    stable = "stable"
    resolved = "resolved"


class AnomalyType(str, enum.Enum):
    pothole = "pothole"
    crack = "crack"
    patch = "patch"
    speed_bump = "speed_bump"
    water_pool = "water_pool"
    subsidence = "subsidence"
    construction = "construction"
    photo = "photo"


class MemberRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    field = "field"
    viewer = "viewer"


class WorkOrderStatus(str, enum.Enum):
    open = "open"
    assigned = "assigned"
    accepted = "accepted"
    in_progress = "in_progress"
    completed = "completed"
    verified = "verified"
    cancelled = "cancelled"
    declined = "declined"


class NotificationType(str, enum.Enum):
    work_order_assigned = "work_order_assigned"
    work_order_accepted = "work_order_accepted"
    work_order_declined = "work_order_declined"
    work_order_started = "work_order_started"
    work_order_completed = "work_order_completed"
    work_order_verified = "work_order_verified"
    work_order_cancelled = "work_order_cancelled"
    critical_detection = "critical_detection"


class WorkOrderPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(50), default="starter")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization")
    detections: Mapped[list["PotholeDetection"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    memberships: Mapped[list["OrganizationMember"]] = relationship(back_populates="user")


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole, name="member_role_enum", **_enum_kw),
        default=MemberRole.field,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    organization: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")


class PotholeDetection(Base):
    __tablename__ = "pothole_detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location = (
        mapped_column(Text, nullable=True)
        if is_sqlite()
        else mapped_column(Geometry("POINT", srid=4326), nullable=True)
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    device_type: Mapped[DeviceType] = mapped_column(
        Enum(DeviceType, name="device_type_enum", **_enum_kw), nullable=False
    )
    location_status: Mapped[LocationStatus] = mapped_column(
        Enum(LocationStatus, name="location_status_enum", **_enum_kw),
        default=LocationStatus.pending,
    )
    detection_status: Mapped[DetectionStatus] = mapped_column(
        Enum(DetectionStatus, name="detection_status_enum", **_enum_kw),
        default=DetectionStatus.detected,
    )
    bbox_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    bbox_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    bbox_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    bbox_h: Mapped[float | None] = mapped_column(Float, nullable=True)
    class_name: Mapped[str] = mapped_column(String(50), default="pothole")
    image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bearing: Mapped[float | None] = mapped_column(Float, nullable=True)
    edge_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    cloud_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    cluster_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporter_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    severity: Mapped[str] = mapped_column(String(20), default="low")
    rut_score: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_depth_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_width_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    vehicle_risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    repair_cost_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    repair_cost_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    tire_damage_risk: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomaly_type: Mapped[str] = mapped_column(String(50), default="pothole")
    confirmation_count: Mapped[int] = mapped_column(Integer, default=1)
    evolution_stage: Mapped[str] = mapped_column(String(20), default="new")
    predicted_days_to_critical: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bicycle_safe: Mapped[bool] = mapped_column(Boolean, default=True)
    priority_rank: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    organization: Mapped["Organization | None"] = relationship(back_populates="detections")


class UserContribution(Base):
    __tablename__ = "user_contributions"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_contrib_org_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    confirmed_reports: Mapped[int] = mapped_column(Integer, default=0)
    total_reports: Mapped[int] = mapped_column(Integer, default=0)
    rank_title: Mapped[str] = mapped_column(String(80), default="ميداني مبتدئ")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DetectionConfirmation(Base):
    __tablename__ = "detection_confirmations"
    __table_args__ = (UniqueConstraint("detection_id", "user_id", name="uq_confirm_det_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    detection_id: Mapped[int] = mapped_column(ForeignKey("pothole_detections.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ClusterSnapshot(Base):
    __tablename__ = "cluster_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cluster_id: Mapped[str] = mapped_column(String(64), index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    rut_score: Mapped[float] = mapped_column(Float, default=0.0)
    detection_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_severity: Mapped[str] = mapped_column(String(20), default="low")
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    detection_id: Mapped[int | None] = mapped_column(
        ForeignKey("pothole_detections.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[WorkOrderStatus] = mapped_column(
        Enum(WorkOrderStatus, name="work_order_status_enum", **_enum_kw),
        default=WorkOrderStatus.open,
        index=True,
    )
    priority: Mapped[WorkOrderPriority] = mapped_column(
        Enum(WorkOrderPriority, name="work_order_priority_enum", **_enum_kw),
        default=WorkOrderPriority.medium,
    )
    assigned_to_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    verified_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    scheduled_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    repair_cost_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    repair_cost_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    declined_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UploadRecord(Base):
    __tablename__ = "upload_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    device_type: Mapped[DeviceType] = mapped_column(
        Enum(DeviceType, name="upload_device_type_enum", **_enum_kw), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    detections_count: Mapped[int] = mapped_column(Integer, default=0)
    used_for_training: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WorkOrderEvent(Base):
    """Audit trail: one row per action taken on a work order."""

    __tablename__ = "work_order_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    work_order_id: Mapped[int] = mapped_column(
        ForeignKey("work_orders.id"), nullable=False, index=True
    )
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Notification(Base):
    """Persistent per-user notification inbox entry."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("work_orders.id"), nullable=True, index=True
    )
    detection_id: Mapped[int | None] = mapped_column(
        ForeignKey("pothole_detections.id"), nullable=True, index=True
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PushToken(Base):
    """Expo push token registered per user device."""

    __tablename__ = "push_tokens"
    __table_args__ = (UniqueConstraint("expo_token", name="uq_push_expo_token"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    expo_token: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str | None] = mapped_column(String(20), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
