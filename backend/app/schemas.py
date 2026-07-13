from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class DeviceType(str, Enum):
    phone = "phone"
    mms = "mms"
    drone = "drone"


class LocationStatus(str, Enum):
    confirmed = "confirmed"
    uncertain = "uncertain"
    pending = "pending"


class DetectionStatus(str, Enum):
    detected = "detected"
    verified = "verified"
    rejected = "rejected"


class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float
    confidence: float
    class_name: str = "pothole"


class DetectionCreate(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    confidence: float
    device_type: DeviceType
    bbox: BBox | None = None
    class_name: str = "pothole"
    edge_confidence: float | None = None
    bearing: float | None = None
    source_id: str | None = None
    location_status: LocationStatus = LocationStatus.pending
    metadata: dict | None = None


class ClearMapResponse(BaseModel):
    message: str
    detections_deleted: int
    uploads_deleted: int
    work_orders_deleted: int = 0
    files_deleted: int


class DeleteDetectionResponse(BaseModel):
    message: str
    id: int
    deleted_ids: list[int] = []
    deleted_count: int = 1
    files_deleted: int


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)
    organization_name: str = Field(default="", min_length=0)


class LoginRequest(BaseModel):
    email: str
    password: str


class OrganizationResponse(BaseModel):
    id: int
    name: str
    slug: str
    plan: str

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str | None = None
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    organization: OrganizationResponse


class DetectionResponse(BaseModel):
    id: int
    latitude: float | None
    longitude: float | None
    confidence: float
    device_type: DeviceType
    location_status: LocationStatus
    detection_status: DetectionStatus
    class_name: str
    bbox_x: float | None
    bbox_y: float | None
    bbox_w: float | None
    bbox_h: float | None
    image_path: str | None
    image_url: str | None = None
    cloud_verified: bool
    cluster_id: str | None
    created_at: datetime
    severity: str = "low"
    rut_score: float = 0.0
    estimated_depth_cm: float | None = None
    estimated_width_cm: float | None = None
    vehicle_risk_score: float = 0.0
    repair_cost_min: float | None = None
    repair_cost_max: float | None = None
    tire_damage_risk: float | None = None
    anomaly_type: str = "pothole"
    confirmation_count: int = 1
    evolution_stage: str = "new"
    predicted_days_to_critical: int | None = None
    bicycle_safe: bool = True
    priority_rank: int = 0
    reporter_user_id: int | None = None
    reporter_name: str | None = None

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    upload_id: int
    detections: list[DetectionResponse]
    message: str


class MapBoundsQuery(BaseModel):
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


class StatsResponse(BaseModel):
    total_detections: int
    total_potholes: int = 0
    verified_detections: int
    by_device: dict[str, int]
    by_status: dict[str, int]
    by_severity: dict[str, int] = {}
    avg_rut_score: float = 0.0
    total_repair_min: float = 0.0
    total_repair_max: float = 0.0
    critical_count: int = 0
    growing_clusters: int = 0


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    full_name: str
    points: int
    confirmed_reports: int
    total_reports: int
    rank_title: str


class PriorityItem(BaseModel):
    id: int
    severity: str
    rut_score: float
    class_name: str
    anomaly_type: str
    latitude: float | None
    longitude: float | None
    estimated_depth_cm: float | None
    estimated_width_cm: float | None
    repair_cost_min: float | None
    repair_cost_max: float | None
    vehicle_risk_score: float
    confirmation_count: int
    evolution_stage: str
    predicted_days_to_critical: int | None
    priority_rank: int


class ClusterPoint(BaseModel):
    latitude: float
    longitude: float
    bearing: float | None = None


class RoadQualityCluster(BaseModel):
    cluster_id: str
    rut_score: float
    detection_count: int
    pothole_count: int = 0
    latitude: float
    longitude: float
    severity: str
    points: list[ClusterPoint] = []
    road_bearing: float | None = None
    is_survey: bool = False


class RoadBearingPoint(BaseModel):
    id: int | None = None
    latitude: float
    longitude: float


class RoadBearingBatchRequest(BaseModel):
    points: list[RoadBearingPoint]


class RoadBearingBatchResponse(BaseModel):
    bearings: dict[str, float | None]


class RouteQualityResponse(BaseModel):
    sample_points: int
    hazard_count: int
    avg_rut_score: float
    quality_grade: str
    recommendation: str
    bicycle_safe_pct: float


class ConfirmDetectionResponse(BaseModel):
    message: str
    confirmation_count: int
    rut_score: float
    severity: str
    points_awarded: int
    your_points: int = 0


class WorkOrderDetectionRef(BaseModel):
    id: int
    latitude: float | None
    longitude: float | None
    severity: str
    rut_score: float
    anomaly_type: str


class WorkOrderEventResponse(BaseModel):
    id: int
    event_type: str
    from_status: str | None = None
    to_status: str | None = None
    actor_user_id: int | None = None
    actor_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkOrderResponse(BaseModel):
    id: int
    detection_id: int | None
    title: str
    description: str | None
    status: str
    priority: str
    assigned_to_user_id: int | None
    assignee_name: str | None = None
    verified_by_user_id: int | None = None
    verified_by_name: str | None = None
    scheduled_date: datetime | None
    accepted_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None
    verified_at: datetime | None = None
    repair_cost_estimate: float | None
    repair_cost_actual: float | None
    notes: str | None
    proof_image_path: str | None = None
    proof_image_url: str | None = None
    declined_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    detection: WorkOrderDetectionRef | None = None
    events: list[WorkOrderEventResponse] = []

    model_config = {"from_attributes": True}


class WorkOrderCreate(BaseModel):
    detection_id: int | None = None
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    assigned_to_user_id: int | None = None
    scheduled_date: str | None = None


class WorkOrderUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_to_user_id: int | None = None
    scheduled_date: str | None = None
    repair_cost_actual: float | None = None
    notes: str | None = None
    title: str | None = None


class WorkOrderActionRequest(BaseModel):
    notes: str | None = None
    reason: str | None = None


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str | None = None
    work_order_id: int | None = None
    detection_id: int | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PushTokenRegister(BaseModel):
    expo_token: str = Field(..., min_length=8)
    platform: str | None = None


class PushTokenUnregister(BaseModel):
    expo_token: str = Field(..., min_length=8)


class MaintenanceDashboardResponse(BaseModel):
    open_work_orders: int
    completed_this_week: int
    critical_open: int
    pending_verification: int
    unassigned_orders: int
    budget_estimate_open: float
    budget_spent: float
    completion_rate: float


class TeamMemberResponse(BaseModel):
    user_id: int
    email: str
    full_name: str
    role: str
    joined_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class TeamInviteRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)
    role: str = "field"


class DetectionStatusUpdate(BaseModel):
    detection_status: DetectionStatus
