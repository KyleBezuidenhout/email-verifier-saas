"""
Google Maps Scraper Order Model

Stores Google Maps scraper orders - using Apify compass/crawler-google-places actor.
Supports single city and full state (concurrent) scraping modes.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Numeric, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class LocalScraperOrder(Base):
    """
    Google Maps Scraper Order - for scraping Google Maps via Apify.
    Supports single_city and full_state modes with concurrent execution.
    """
    __tablename__ = "local_scraper_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Order status: pending, queued, processing, completed, failed, cancelled
    status = Column(String(50), nullable=False, default="pending", index=True)
    
    # Job metadata
    job_name = Column(String(255), nullable=False)
    
    # Scrape configuration
    scrape_mode = Column(String(20), nullable=False)  # "single_city" or "full_state"
    states = Column(JSON, nullable=False)  # List of states to scrape
    city = Column(String(200), nullable=True)  # Null for full_state mode
    search_term = Column(String(500), nullable=False)
    
    # Apify settings (user-configurable per job)
    max_results_per_city = Column(Integer, nullable=True)  # null = unlimited
    skip_closed_places = Column(Boolean, default=True)
    website_filter = Column(String(20), default="withWebsite")  # allPlaces, withWebsite, withoutWebsite
    scrape_reviews = Column(Boolean, default=False)
    max_reviews = Column(Integer, default=0)
    scrape_images = Column(Boolean, default=False)
    max_images = Column(Integer, default=0)
    language = Column(String(10), default="en")
    
    # Legacy: Apify run tracking (kept for backward compatibility with old orders)
    apify_run_ids = Column(JSON, nullable=True)  # DEPRECATED: Use local_scraper_city_jobs table instead
    webhook_secret = Column(String(100), nullable=True)  # For verifying webhook callbacks
    webhook_url = Column(String(500), nullable=True)  # Webhook URL for Apify callbacks
    
    # Progress tracking
    total_cities = Column(Integer, default=1)
    completed_cities = Column(Integer, default=0)
    progress_percentage = Column(Integer, default=0)
    results_count = Column(Integer, default=0)
    
    # Cost tracking
    estimated_cost = Column(Numeric(10, 2), nullable=True)
    actual_cost = Column(Numeric(10, 2), nullable=True)
    
    # File storage
    file_url = Column(Text, nullable=True)  # R2 URL for completed results
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)
