"""
Pydantic schemas for Google Maps Scraper feature.
Uses Apify compass/crawler-google-places actor.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class GoogleMapsScraperOrderCreate(BaseModel):
    """Request to create a new Google Maps scraper order"""
    job_name: str
    scrape_mode: str  # "single_city" or "full_state"
    states: List[str]  # List of states (single for single_city, multiple for full_state admin)
    city: Optional[str] = None  # Required for single_city mode
    search_term: str


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
