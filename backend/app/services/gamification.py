"""User points and leaderboard for confirmed reports."""

from sqlalchemy.orm import Session

from app.models import DetectionStatus, PotholeDetection, User, UserContribution

RANK_TIERS = [
    (0, "ميداني مبتدئ", "Field Scout"),
    (50, "مراقب طرق", "Road Watcher"),
    (150, "خبير ميدان", "Field Expert"),
    (400, "سفير RUTRIX", "RUTRIX Ambassador"),
    (1000, "بطل البنية التحتية", "Infrastructure Hero"),
]


def rank_title_for_points(points: int, locale: str = "ar") -> str:
    title = RANK_TIERS[0][1 if locale == "ar" else 2]
    for threshold, ar, en in RANK_TIERS:
        if points >= threshold:
            title = ar if locale == "ar" else en
    return title


def get_or_create_contribution(db: Session, user_id: int, organization_id: int) -> UserContribution:
    row = (
        db.query(UserContribution)
        .filter(
            UserContribution.user_id == user_id,
            UserContribution.organization_id == organization_id,
        )
        .first()
    )
    if row:
        return row
    row = UserContribution(user_id=user_id, organization_id=organization_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def award_report_points(
    db: Session,
    user_id: int,
    organization_id: int,
    *,
    confirmed: bool = False,
    points: int = 10,
) -> UserContribution:
    contrib = get_or_create_contribution(db, user_id, organization_id)
    contrib.total_reports += 1
    if confirmed:
        contrib.confirmed_reports += 1
        contrib.points += points
    contrib.rank_title = rank_title_for_points(contrib.points)
    db.commit()
    db.refresh(contrib)
    return contrib


def award_confirmation_points(
    db: Session, user_id: int, organization_id: int, points: int = 5
) -> UserContribution:
    contrib = get_or_create_contribution(db, user_id, organization_id)
    contrib.points += points
    contrib.rank_title = rank_title_for_points(contrib.points)
    db.commit()
    db.refresh(contrib)
    return contrib


def leaderboard(db: Session, organization_id: int, limit: int = 20) -> list[dict]:
    rows = (
        db.query(UserContribution, User)
        .join(User, User.id == UserContribution.user_id)
        .filter(UserContribution.organization_id == organization_id)
        .order_by(UserContribution.points.desc())
        .limit(limit)
        .all()
    )
    result = []
    for rank, (c, u) in enumerate(rows, start=1):
        result.append(
            {
                "rank": rank,
                "user_id": u.id,
                "full_name": u.full_name,
                "points": c.points,
                "confirmed_reports": c.confirmed_reports,
                "total_reports": c.total_reports,
                "rank_title": c.rank_title,
            }
        )
    return result


def points_for_detection(detection: PotholeDetection) -> int:
    base = 10
    if detection.detection_status == DetectionStatus.verified:
        base += 15
    if detection.severity in ("high", "critical"):
        base += 10
    if detection.cloud_verified:
        base += 5
    return base
