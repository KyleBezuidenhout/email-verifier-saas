from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.api.dependencies import get_current_user
from app.schemas.lead import LeadResponse

router = APIRouter()


@router.get("/{job_id}", response_model=List[LeadResponse])
async def get_results(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job belongs to user
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Get final results (is_final_result = True)
    leads = db.query(Lead).filter(
        Lead.job_id == job_id,
        Lead.is_final_result == True
    ).all()
    
    return [LeadResponse(
        id=lead.id,
        job_id=lead.job_id,
        user_id=lead.user_id,
        first_name=lead.first_name,
        last_name=lead.last_name,
        domain=lead.domain,
        company_size=lead.company_size,
        email=lead.email,
        pattern_used=lead.pattern_used,
        prevalence_score=lead.prevalence_score,
        verification_status=lead.verification_status,
        is_final_result=lead.is_final_result,
        created_at=lead.created_at.isoformat(),
    ) for lead in leads]

