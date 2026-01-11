from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class LocalScraperConfig(BaseModel):
    """Configuration for Google Maps scraping"""
    business_types: List[str]
    search_method: str = "city"  # "city" or "search_link"
    cities: Optional[List[str]] = None
    search_links: Optional[List[str]] = None
    extraction_method: str = "detailed"  # "overview" or "detailed"
    max_results: Optional[int] = None
    enable_reviews_extraction: bool = False
    max_reviews: int = 20
    enable_photos_extraction: bool = False
    max_photos: int = 100
    lang: Optional[str] = None
    randomize_cities: bool = True
    include_places_outside_city: bool = True
    geo_shape: str = "polygons"
    point_coordinates: Optional[str] = None
    polygons: Optional[Any] = None
    geo_zoom_level: str = "16"
    exclude_outside_shape: bool = True
    reviews_sort: str = "newest"
    reviews_query: Optional[str] = None
    api_key: Optional[str] = None


class CreateLocalScraperOrderRequest(BaseModel):
    """Request to create a new local scraper order"""
    job_name: str
    config: LocalScraperConfig


class LocalScraperOrderResponse(BaseModel):
    """Response for a local scraper order"""
    id: str
    user_id: str
    botasaurus_task_id: Optional[int] = None
    status: str
    job_name: str
    business_types: Optional[str] = None
    search_method: Optional[str] = None
    extraction_method: Optional[str] = None
    max_results: Optional[int] = None
    enable_reviews: bool = False
    progress_percentage: int = 0
    results_count: int = 0
    file_url: Optional[str] = None
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class LocalScraperOrderListResponse(BaseModel):
    """Response for listing local scraper orders"""
    orders: List[LocalScraperOrderResponse]
    total: int


class BotasaurusTaskResponse(BaseModel):
    """Response from task creation"""
    id: int
    status: str
    scraper_name: Optional[str] = None
    created_at: Optional[str] = None


class BotasaurusTaskStatusResponse(BaseModel):
    """Response from task status check"""
    id: int
    status: str
    result_count: Optional[int] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

