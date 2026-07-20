"""Audit log API — supervisors and admins only."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_role
from app.models import Organization
from app.services.audit_service import list_audit_events

router = APIRouter(prefix="/api/audit", tags=["audit"])

_SUPERVISOR_ROLES = {"owner", "admin", "supervisor"}


def _require_supervisor(role: str) -> None:
    from fastapi import HTTPException

    if role not in _SUPERVISOR_ROLES:
        raise HTTPException(status_code=403, detail="Supervisor access required")


@router.get("")
def get_audit_log(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_organization),
    role: str = Depends(get_current_role),
):
    _require_supervisor(role)
    return list_audit_events(db, org.id, limit=limit, offset=offset)
