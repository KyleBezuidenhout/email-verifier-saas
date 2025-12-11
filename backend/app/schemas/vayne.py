from pydantic import BaseModel, HttpUrl
from typing import Optional
from uuid import UUID
from datetime import datetime


class VayneAuthStatusResponse(BaseModel):
    is_connected: bool
    linkedin_email: Optional[str] = None

    class Config:
        from_attributes = True


class VayneAuthUpdateRequest(BaseModel):
    linkedin_cookie: str


class VayneAuthUpdateResponse(BaseModel):
    message: str


class VayneCreditsResponse(BaseModel):
    available_credits: int
    leads_scraped_today: int
    daily_limit: int
    subscription_plan: Optional[str] = None
    subscription_expires_at: Optional[str] = None


class VayneUrlCheckRequest(BaseModel):
    sales_nav_url: str


class VayneUrlCheckResponse(BaseModel):
    is_valid: bool
    estimated_results: Optional[int] = None
    error: Optional[str] = None


class VayneOrderCreateRequest(BaseModel):
    sales_nav_url: str
    linkedin_cookie: str  # Required for each order


class VayneOrderCreateResponse(BaseModel):
    success: bool = True
    order_id: str
    status: str = "pending"
    message: str


class VayneOrderResponse(BaseModel):
    id: str
    status: str  # pending, processing, completed, failed
    scraping_status: Optional[str] = None  # Direct from Vayne: initialization, scraping, finished, failed
    vayne_order_id: Optional[str] = None  # Vayne's order ID (set by worker)
    sales_nav_url: str
    export_format: str
    only_qualified: bool
    leads_found: Optional[int] = None
    leads_qualified: Optional[int] = None
    progress_percentage: Optional[int] = None
    estimated_completion: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    csv_file_path: Optional[str] = None  # R2 path to exported CSV

    class Config:
        from_attributes = True


class VayneOrderListResponse(BaseModel):
    orders: list[VayneOrderResponse]
    total: int


class VayneWebhookPayload(BaseModel):
    """Webhook payload from Vayne API when order status changes."""
    order_id: str  # Vayne's order ID
    status: str  # pending, processing, completed, failed
    progress_percentage: Optional[int] = None
    leads_found: Optional[int] = None
    leads_qualified: Optional[int] = None
    estimated_completion: Optional[str] = None
    error_message: Optional[str] = None

