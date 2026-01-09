from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class LocalScraperConfig(BaseModel):
    """Configuration for the Google Maps scraper"""
    business_types: List[str]
    search_method: str = "city"  # city, search_link, geo_shape
    cities: List[str] = []
    search_links: List[str] = []
    extraction_method: str = "detailed"  # detailed, fast
    max_results: Optional[int] = None
    enable_reviews_extraction: bool = False
    max_reviews: int = 20
    enable_photos_extraction: bool = False
    max_photos: int = 100
    lang: Optional[str] = None
    # Advanced options
    randomize_cities: bool = True
    include_places_outside_city: bool = True
    geo_shape: str = "polygons"
    point_coordinates: str = ""
    polygons: Optional[str] = None
    geo_zoom_level: str = "16"
    exclude_outside_shape: bool = True
    reviews_sort: str = "newest"
    reviews_query: str = ""
    api_key: str = ""


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
    created_at: datetime
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
    """Response from Botasaurus task creation"""
    id: int
    status: str
    scraper_name: Optional[str] = None
    result_count: Optional[int] = None


class BotasaurusTaskStatusResponse(BaseModel):
    """Response from Botasaurus task status check"""
    id: int
    status: str  # pending, in_progress, completed, failed
    scraper_name: Optional[str] = None
    result_count: Optional[int] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

