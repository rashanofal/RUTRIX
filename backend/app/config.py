from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./pothole.db"
    model_path: str = "../ml/models/pothole_yolov8n.pt"
    onnx_model_path: str = "../ml/models/pothole_yolov8n.onnx"
    upload_dir: str = "../data/uploads"
    training_dir: str = "../data/training"
    confidence_threshold: float = 0.62
    cloud_reverify_min: float = 0.4
    cloud_reverify_max: float = 0.7
    cluster_radius_meters: float = 15.0
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    jwt_secret: str = "change-me-in-production-use-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    seed_demo_account: bool = True
    demo_email: str = "demo@pothole.app"
    demo_password: str = "demo1234"
    demo_org_name: str = "تجريبي"
    demo_shared_registration: bool = True
    owner_email: str = "rashanofal82@gmail.com"

    class Config:
        env_file = ".env"


settings = Settings()


def is_sqlite() -> bool:
    return settings.database_url.startswith("sqlite")
