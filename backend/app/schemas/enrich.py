from pydantic import BaseModel, model_validator
from typing import Optional


class EnrichRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    company_website: str

    @model_validator(mode="after")
    def validate_name_input(self):
        has_parts = bool(self.first_name and self.last_name)
        has_full = bool(self.name)
        if not has_parts and not has_full:
            raise ValueError("Provide either 'name' or both 'first_name' and 'last_name'")
        return self


class EnrichResponse(BaseModel):
    first_name: str
    last_name: str
    company_website: str
    email: str
    status: str  # valid | catchall | not_found
    pattern: Optional[str] = None
    mx_provider: Optional[str] = None
    credits_used: int
    credits_remaining: int
