from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class JobResponse(BaseModel):
    id: UUID
    user_id: UUID
    status: str
    job_type: Optional[str] = "enrichment"  # enrichment or verification
    source: Optional[str] = None  # e.g., "Sales Nav"
    original_filename: Optional[str]
    total_leads: int
    processed_leads: int
    valid_emails_found: int
    catchall_emails_found: int
    cost_in_credits: int
    input_file_path: Optional[str]
    output_file_path: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class JobUploadResponse(BaseModel):
    job_id: UUID
    message: str


class JobProgressResponse(BaseModel):
    job_id: UUID
    processed_leads: int
    total_leads: int
    valid_emails_found: int
    catchall_emails_found: int
    status: str
    progress_percentage: float

