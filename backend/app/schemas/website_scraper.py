"""
Pydantic schemas for Website Contact Scraper feature.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class WebsiteScraperJobResponse(BaseModel):
    """Response for a website scraper job"""
    id: str
    user_id: str
    status: str
    original_filename: Optional[str] = None
    total_leads: int = 0
    completed_leads: int = 0
    progress_percentage: int = 0
    hit_rate_percentage: float = 0.00
    input_file_path: Optional[str] = None
    output_file_path: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class WebsiteScraperJobListResponse(BaseModel):
    """Response for listing website scraper jobs"""
    jobs: List[WebsiteScraperJobResponse]
    total: int


class WebsiteScraperUploadResponse(BaseModel):
    """Response after uploading a CSV for website scraping"""
    job_id: str
    message: str
    total_websites: int


class WebsiteScraperHealthResponse(BaseModel):
    """Response for Crawl4AI health check"""
    crawl4ai_api: str  # "connected" or "disconnected"
    api_url: Optional[str] = None
    message: str


class WebsiteScraperJobStatusResponse(BaseModel):
    """Response for job status polling"""
    job_id: str
    status: str
    total_leads: int
    completed_leads: int
    progress_percentage: int
    hit_rate_percentage: float
    error_message: Optional[str] = None
