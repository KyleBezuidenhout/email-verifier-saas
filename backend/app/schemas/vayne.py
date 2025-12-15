from typing import Optional
from pydantic import BaseModel, HttpUrl


class LinkedInAuthStatus(BaseModel):
    authenticated: bool
    session_valid: bool
    session_expires_at: Optional[str] = None
    account_type: Optional[str] = None
    linkedin_id: Optional[str] = None
    message: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    session_cookie: str


class CreditsResponse(BaseModel):
    total_credits: int
    available_credits: int
    daily_limit: int
    leads_scraped_today: int
    leads_remaining_today: int
    reset_time: str
    subscription_plan: Optional[str] = None
    subscription_expires: Optional[str] = None


class UrlValidationRequest(BaseModel):
    url: HttpUrl


class UrlCheckRequest(BaseModel):
    sales_nav_url: str


class UrlValidationResponse(BaseModel):
    is_valid: bool  # Renamed from 'valid' to match frontend VayneUrlCheck type
    url: Optional[str] = None
    search_type: Optional[str] = None
    estimated_results: Optional[int] = None
    filters_detected: Optional[list[str]] = None
    error: Optional[str] = None
    suggestion: Optional[str] = None


class CreateOrderRequest(BaseModel):
    sales_nav_url: str
    linkedin_cookie: str
    targeting: Optional[str] = None  # Job name/targeting description


class CreateOrderResponse(BaseModel):
    success: bool
    order_id: str
    status: str
    message: str


class OrderStatusResponse(BaseModel):
    id: str
    status: str
    url: str
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    estimated_completion: Optional[str] = None
    progress_percentage: Optional[int] = None
    leads_found: Optional[int] = None
    leads_qualified: Optional[int] = None


class DownloadStatusResponse(BaseModel):
    status: str  # "ready" or "pending"
    file_url: Optional[str] = None


