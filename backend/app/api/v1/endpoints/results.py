from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.schemas.lead import LeadResponse

router = APIRouter()


@router.get("/{job_id}", response_model=List[LeadResponse])
async def get_results(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Verify job belongs to user (or user is ben@superwave.io admin)
    # Only ben@superwave.io can view other clients' jobs
    if current_user.email == ADMIN_EMAIL:
        # Admin can view any job
        job = db.query(Job).filter(Job.id == job_uuid).first()
    else:
        # Regular users can only view their own jobs
        job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Get final results (is_final_result = True)
    leads = db.query(Lead).filter(
        Lead.job_id == job_uuid,
        Lead.is_final_result == True
    ).all()
    
    # Use model_validate to automatically include all fields including extra_data
    # This handles created_at conversion and includes all schema fields
    return [LeadResponse.model_validate(lead) for lead in leads]

