from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class LocalScraperOrder(Base):
    """
    Local Lead Scraper Order - for Google Maps scraping.
    Uses Google Maps Scraper API on AWS.
    """
    __tablename__ = "local_scraper_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Task ID (returned when creating task)
    botasaurus_task_id = Column(Integer, unique=True, nullable=True, index=True)
    
    # Order status: pending, processing, completed, failed, cancelled, deleted
    status = Column(String(50), nullable=False, default="pending", index=True)
    
    # Job metadata
    job_name = Column(String(255), nullable=False)
    scraper_config = Column(JSON, nullable=True)  # Full config sent to API
    
    # Search parameters (for display)
    business_types = Column(Text, nullable=True)  # Comma-separated
    search_method = Column(String(50), nullable=True)  # "city" or "search_link"
    search_locations = Column(JSON, nullable=True)  # List of cities or search links
    extraction_method = Column(String(50), nullable=True)  # "overview" or "detailed"
    max_results = Column(Integer, nullable=True)
    enable_reviews = Column(Boolean, default=False)
    max_reviews = Column(Integer, nullable=True)
    
    # Progress tracking
    progress_percentage = Column(Integer, default=0)
    results_count = Column(Integer, default=0)
    
    # File storage
    file_url = Column(Text, nullable=True)  # R2 URL for completed results
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)

