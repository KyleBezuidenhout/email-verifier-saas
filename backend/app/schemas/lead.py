from pydantic import BaseModel, field_validator
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime


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
    verification_tag: Optional[str]
    mx_record: Optional[str]
    mx_provider: Optional[str]
    extra_data: Optional[Dict[str, Any]] = {}
    is_final_result: bool
    created_at: str

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


