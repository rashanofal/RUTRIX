"""RUTRIX intelligence layer — severity, RUT score, costs, vehicle risk."""

from __future__ import annotations

import math
from typing import Any

# Severity bands
SEVERITY_LOW = "low"
SEVERITY_MEDIUM = "medium"
SEVERITY_HIGH = "high"
SEVERITY_CRITICAL = "critical"

CLASS_WEIGHTS = {
    "pothole": 1.0,
    "crack": 0.55,
    "patch": 0.35,
    "photo": 0.0,
    "speed_bump": 0.5,
    "water_pool": 0.65,
    "subsidence": 0.9,
    "construction": 0.4,
}

VEHICLE_RISK_LABELS = {
    "low": "آمن للسيارات والدراجات",
    "medium": "حذر — قد يضر بالإطارات",
    "high": "خطر — تجنّب السرعة",
    "critical": "خطير — تجنّب المسار",
}


def estimate_dimensions(bbox_w: float | None, bbox_h: float | None, class_name: str) -> tuple[float, float]:
    """Approximate width/depth in cm from bbox pixels (heuristic without depth camera)."""
    w = float(bbox_w or 40)
    h = float(bbox_h or 40)
    # Calibrated: ~100px bbox ≈ 20–25cm real width at typical phone distance
    diag = math.sqrt(w * h)
    width_cm = max(5.0, min(55.0, diag * 0.14))
    if class_name == "crack":
        depth_cm = max(0.4, min(width_cm * 0.12, 6.0))
        width_cm = max(4.0, width_cm * 0.55)
    elif class_name == "patch":
        depth_cm = max(0.2, min(width_cm * 0.06, 3.5))
    else:
        depth_cm = max(0.8, min(width_cm * 0.22, 18.0))
    return round(width_cm, 1), round(depth_cm, 1)


def compute_vehicle_risk(
    class_name: str,
    depth_cm: float,
    width_cm: float,
    confidence: float,
) -> tuple[float, bool]:
    """0-100 vehicle damage risk; bicycle_safe flag."""
    base = CLASS_WEIGHTS.get(class_name, 0.5) * confidence * 100
    size_factor = min(1.0, (depth_cm / 25.0) * 0.5 + (width_cm / 60.0) * 0.5)
    risk = min(100.0, base * (0.4 + 0.6 * size_factor))
    bicycle_safe = risk < 45 and depth_cm < 12
    return round(risk, 1), bicycle_safe


def compute_repair_costs(class_name: str, width_cm: float, depth_cm: float, severity: str) -> tuple[float, float]:
    """Estimated spot cold-patch cost (USD) — material + short crew labor."""
    if class_name == "photo":
        return 0.0, 0.0

    w = max(5.0, float(width_cm or 15))
    d = max(0.5, float(depth_cm or 3))

    if class_name == "crack":
        base = 4.0 + w * 0.28
        cap = 35.0
    elif class_name == "patch":
        base = 6.0 + w * 0.38
        cap = 42.0
    else:
        area_cm2 = max(20.0, (w**2) * 0.35)
        depth_mult = 1.0 + min(d / 15.0, 1.5) * 0.25
        material = area_cm2 * 0.004 * depth_mult
        labor = 5.0 + w * 0.12
        base = material + labor
        cap = {"low": 28.0, "medium": 45.0, "high": 70.0, "critical": 95.0}.get(severity, 50.0)

    mult = {"low": 0.85, "medium": 1.0, "high": 1.15, "critical": 1.35}.get(severity, 1.0)
    low = base * mult * 0.9
    high = base * mult * 1.15
    low = round(min(max(low, 4.0), cap), 0)
    high = round(min(max(high, low + 3.0), cap), 0)
    return low, high


def compute_tire_damage_risk(depth_cm: float, vehicle_risk: float) -> float:
    return round(min(100.0, vehicle_risk * 0.7 + depth_cm * 1.2), 1)


def severity_from_metrics(
    class_name: str,
    depth_cm: float,
    width_cm: float,
    confidence: float,
    confirmation_count: int = 1,
) -> str:
    if class_name == "photo":
        return SEVERITY_LOW
    size_score = min(42.0, depth_cm * 1.6 + width_cm * 0.32)
    conf_score = confidence * 28.0
    confirm_score = min(8.0, max(0, confirmation_count - 1) * 3.5)
    score = size_score + conf_score + confirm_score
    if class_name == "crack":
        score *= 0.72
    elif class_name == "patch":
        score *= 0.55
    elif class_name == "subsidence":
        score *= 1.15
    if score >= 62:
        return SEVERITY_CRITICAL
    if score >= 44:
        return SEVERITY_HIGH
    if score >= 26:
        return SEVERITY_MEDIUM
    return SEVERITY_LOW


def compute_rut_score(
    severity: str,
    confidence: float,
    vehicle_risk: float,
    confirmation_count: int,
    class_name: str,
) -> float:
    """RUT Index 0-100 — higher = worse road condition at this point."""
    sev_base = {
        SEVERITY_LOW: 12,
        SEVERITY_MEDIUM: 30,
        SEVERITY_HIGH: 50,
        SEVERITY_CRITICAL: 68,
    }.get(severity, 15)
    conf_boost = confidence * 14.0
    risk_boost = vehicle_risk * 0.1
    confirm_boost = min(5.0, max(0, confirmation_count - 1) * 2.0)
    class_boost = CLASS_WEIGHTS.get(class_name, 0.5) * 5.0
    rut = sev_base + conf_boost + risk_boost + confirm_boost + class_boost
    # Soft cap so only the worst cases reach 95–100
    if rut > 82:
        rut = 82 + (rut - 82) * 0.4
    return round(min(100.0, max(5.0, rut)), 1)


def predict_days_to_critical(
    evolution_stage: str,
    class_name: str,
    rut_score: float,
    growth_rate: float = 0.0,
) -> int | None:
    if class_name not in ("crack", "pothole", "subsidence"):
        return None
    if rut_score >= 75:
        return 0
    if evolution_stage == "growing" and growth_rate > 0:
        remaining = max(0, 75 - rut_score)
        days = int(remaining / max(growth_rate, 0.5))
        return min(365, max(7, days))
    if class_name == "crack" and rut_score >= 35:
        return 90
    return None


def analyze_detection(
    *,
    class_name: str,
    confidence: float,
    bbox_w: float | None = None,
    bbox_h: float | None = None,
    confirmation_count: int = 1,
    evolution_stage: str = "new",
    growth_rate: float = 0.0,
    anomaly_type: str | None = None,
) -> dict[str, Any]:
    """Full intelligence payload for one detection."""
    cn = (anomaly_type or class_name or "pothole").lower()
    if cn == "photo" or confidence < 0.05:
        return {
            "severity": SEVERITY_LOW,
            "rut_score": 0.0,
            "estimated_width_cm": None,
            "estimated_depth_cm": None,
            "vehicle_risk_score": 0.0,
            "vehicle_risk_label": VEHICLE_RISK_LABELS[SEVERITY_LOW],
            "bicycle_safe": True,
            "repair_cost_min": 0.0,
            "repair_cost_max": 0.0,
            "tire_damage_risk": 0.0,
            "priority_rank": 0,
            "predicted_days_to_critical": None,
            "anomaly_type": "photo" if cn == "photo" else cn,
        }

    width_cm, depth_cm = estimate_dimensions(bbox_w, bbox_h, cn)
    severity = severity_from_metrics(cn, depth_cm, width_cm, confidence, confirmation_count)
    vehicle_risk, bicycle_safe = compute_vehicle_risk(cn, depth_cm, width_cm, confidence)
    repair_min, repair_max = compute_repair_costs(cn, width_cm, depth_cm, severity)
    tire_risk = compute_tire_damage_risk(depth_cm, vehicle_risk)
    rut_score = compute_rut_score(severity, confidence, vehicle_risk, confirmation_count, cn)
    days_critical = predict_days_to_critical(evolution_stage, cn, rut_score, growth_rate)
    priority = int(rut_score)  # higher = fix first

    return {
        "severity": severity,
        "rut_score": rut_score,
        "estimated_width_cm": width_cm,
        "estimated_depth_cm": depth_cm,
        "vehicle_risk_score": vehicle_risk,
        "vehicle_risk_label": VEHICLE_RISK_LABELS.get(severity, ""),
        "bicycle_safe": bicycle_safe,
        "repair_cost_min": repair_min,
        "repair_cost_max": repair_max,
        "tire_damage_risk": tire_risk,
        "priority_rank": priority,
        "predicted_days_to_critical": days_critical,
        "anomaly_type": cn,
    }


def cluster_growth_rate(db, cluster_id: str, organization_id: int) -> tuple[str, float]:
    """Derive evolution stage and RUT growth from cluster history."""
    from app.models import ClusterSnapshot

    snaps = (
        db.query(ClusterSnapshot)
        .filter(
            ClusterSnapshot.cluster_id == cluster_id,
            ClusterSnapshot.organization_id == organization_id,
        )
        .order_by(ClusterSnapshot.snapshot_at.desc())
        .limit(5)
        .all()
    )
    if len(snaps) < 2:
        return "new", 0.0
    latest, prev = snaps[0], snaps[1]
    delta = (latest.rut_score or 0) - (prev.rut_score or 0)
    if delta > 5:
        return "growing", delta
    if delta < -3:
        return "stable", delta
    return "stable", delta
