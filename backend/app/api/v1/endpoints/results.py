from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from typing import Optional, List
import csv
import io
import re
import uuid

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.schemas.lead import LeadResponse
from app.core.security import decode_token

router = APIRouter()


def _verify_job_access(db: Session, job_uuid, current_user: User) -> Job:
    if current_user.email == ADMIN_EMAIL:
        job = db.query(Job).filter(Job.id == job_uuid).first()
    else:
        job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _parse_job_uuid(job_id: str):
    try:
        return uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid job ID format")


def _apply_lead_filters(query, status_csv: Optional[str], mx_csv: Optional[str]):
    """Apply status and MX provider filters to a Lead query."""
    if status_csv:
        status_list = [s.strip() for s in status_csv.split(",") if s.strip()]
        conditions = []
        for s in status_list:
            if s == "valid":
                conditions.append(
                    or_(
                        Lead.verification_status == "valid",
                        Lead.verification_tag.in_(["valid-catchall", "catchall-verified"]),
                    )
                )
            elif s == "catchall":
                conditions.append(
                    (Lead.verification_status == "catchall")
                    & or_(
                        Lead.verification_tag.is_(None),
                        Lead.verification_tag.notin_(["catchall-verified", "valid-catchall"]),
                    )
                )
            elif s == "invalid":
                conditions.append(Lead.verification_status.in_(["invalid", "not_found"]))
        if conditions:
            query = query.filter(or_(*conditions))

    if mx_csv:
        mx_list = [m.strip() for m in mx_csv.split(",") if m.strip()]
        mx_conditions = []
        for m in mx_list:
            if m == "other":
                mx_conditions.append(or_(Lead.mx_provider == "other", Lead.mx_provider.is_(None)))
            else:
                mx_conditions.append(Lead.mx_provider == m)
        if mx_conditions:
            query = query.filter(or_(*mx_conditions))

    return query


@router.get("/{job_id}", response_model=List[LeadResponse])
def get_results(
    job_id: str,
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(None, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job_uuid = _parse_job_uuid(job_id)
    _verify_job_access(db, job_uuid, current_user)

    query = db.query(Lead).filter(Lead.job_id == job_uuid, Lead.is_final_result == True)
    if offset is not None:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    return [LeadResponse.model_validate(lead) for lead in query.all()]


@router.get("/{job_id}/download")
def download_results(
    job_id: str,
    token: str = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    mx: Optional[str] = Query(None),
    filename: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    job_uuid = _parse_job_uuid(job_id)

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if user.email == ADMIN_EMAIL:
        job = db.query(Job).filter(Job.id == job_uuid).first()
    else:
        job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    safe_filename = re.sub(r'[^\w\s-]', '', filename or '').strip()[:50] or "results"

    # Pass 1: collect all distinct extra_data keys for consistent CSV headers
    extra_keys_rows = db.execute(text(
        "SELECT DISTINCT jsonb_object_keys(extra_data) FROM leads "
        "WHERE job_id = :jid AND is_final_result = TRUE "
        "AND extra_data IS NOT NULL AND extra_data != '{}'::jsonb "
        "ORDER BY 1"
    ), {"jid": str(job_uuid)}).fetchall()
    extra_keys = [r[0] for r in extra_keys_rows]

    base_query = db.query(Lead).filter(Lead.job_id == job_uuid, Lead.is_final_result == True)
    base_query = _apply_lead_filters(base_query, status_filter, mx)

    def _get_display_status(lead):
        if lead.verification_tag == "valid-catchall":
            return "valid-catchall"
        return lead.verification_status or ""

    def _get_mx_display(lead):
        provider = lead.mx_provider or "other"
        return provider.capitalize()

    def generate_csv():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["First Name", "Last Name", "Website", "Email", "Status", "MX Type"] + extra_keys)
        yield buf.getvalue()

        for lead in base_query.yield_per(500):
            buf = io.StringIO()
            writer = csv.writer(buf)
            row = [
                lead.first_name or "",
                lead.last_name or "",
                lead.domain or "",
                lead.email or "",
                _get_display_status(lead),
                _get_mx_display(lead),
            ]
            for key in extra_keys:
                row.append((lead.extra_data or {}).get(key, ""))
            writer.writerow(row)
            yield buf.getvalue()

    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}.csv"'},
    )

