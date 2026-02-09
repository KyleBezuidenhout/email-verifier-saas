"""
Pydantic schemas for Google Maps Scraper feature.
Uses Apify compass/crawler-google-places actor.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


class ApifySettings(BaseModel):
    """Apify scraper configuration settings"""
    max_results_per_city: Optional[int] = Field(None, description="Max results per city (null = unlimited)")
    skip_closed_places: bool = Field(True, description="Exclude permanently closed businesses")
    website_filter: Literal["allPlaces", "withWebsite", "withoutWebsite"] = Field("withWebsite", description="Filter by website presence")
    scrape_reviews: bool = Field(False, description="Fetch reviews (increases cost)")
    max_reviews: int = Field(0, description="Max reviews per place if scrape_reviews is true")
    scrape_images: bool = Field(False, description="Fetch images (increases cost)")
    max_images: int = Field(0, description="Max images per place if scrape_images is true")
    language: str = Field("en", description="Language for results")


class GoogleMapsScraperOrderCreate(BaseModel):
    """Request to create a new Google Maps scraper order"""
    job_name: str
    scrape_mode: str  # "single_city" or "full_state"
    states: List[str]  # List of states (single for single_city, multiple for full_state admin)
    city: Optional[str] = None  # Required for single_city mode
    search_term: str
    
    # Cache option - if enabled, returns cached results for matching city+state+search_term
    use_cache: bool = False
    
    # Apify settings (optional - defaults applied if not provided)
    max_results_per_city: Optional[int] = None
    skip_closed_places: bool = True
    website_filter: str = "withWebsite"
    scrape_reviews: bool = False
    max_reviews: int = 0
    scrape_images: bool = False
    max_images: int = 0
    language: str = "en"


class GoogleMapsScraperOrderResponse(BaseModel):
    """Response for a Google Maps scraper order"""
    id: str
    user_id: str
    status: str
    scrape_mode: str
    states: List[str]  # List of states being scraped
    city: Optional[str] = None
    search_term: str
    job_name: str
    total_cities: int = 1
    completed_cities: int = 0
    progress_percentage: int = 0
    results_count: int = 0
    estimated_cost: float = 0.0
    actual_cost: Optional[float] = None
    file_url: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    # Apify settings
    max_results_per_city: Optional[int] = None
    skip_closed_places: bool = True
    website_filter: str = "withWebsite"
    scrape_reviews: bool = False
    max_reviews: int = 0
    scrape_images: bool = False
    max_images: int = 0
    language: str = "en"

    class Config:
        from_attributes = True


class GoogleMapsScraperOrderListResponse(BaseModel):
    """Response for listing Google Maps scraper orders"""
    orders: List[GoogleMapsScraperOrderResponse]
    total: int


class GoogleMapsScraperHealthResponse(BaseModel):
    """Response for Apify API health check"""
    apify_api: str  # "connected" or "disconnected"
    message: str


class GoogleMapsScraperStatusResponse(BaseModel):
    """Response for order status polling"""
    order_id: str
    status: str
    total_cities: int
    completed_cities: int
    cached_cities: int = 0  # Cities served from cache
    progress_percentage: int
    results_count: int
    error_message: Optional[str] = None


class CostEstimateRequest(BaseModel):
    """Request for cost estimation"""
    scrape_mode: str  # "single_city" or "full_state"
    states: List[str]  # List of states
    city: Optional[str] = None  # For single_city mode


class CostEstimateResponse(BaseModel):
    """Response for cost estimation"""
    num_cities: int
    estimated_cost: float
    cost_per_city: float


class StateListResponse(BaseModel):
    """Response for listing available states"""
    states: List[str]


class CityListResponse(BaseModel):
    """Response for listing cities in a state"""
    state: str
    cities: List[str]
    count: int


class GoogleMapsScraperPreviewResponse(BaseModel):
    """Response for previewing scraper results"""
    order_id: str
    total_rows: int
    preview_count: int
    columns: List[str]
    rows: List[dict]
