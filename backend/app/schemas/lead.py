from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class LeadResponse(BaseModel):
    id: int
    job_id: UUID
    user_id: UUID
    first_name: str
    last_name: str
    domain: str
    company_size: Optional[str]
    email: str
    pattern_used: Optional[str]
    prevalence_score: Optional[int]
    verification_status: str
    is_final_result: bool
    created_at: str

    class Config:
        from_attributes = True

