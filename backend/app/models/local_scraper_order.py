from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class LocalScraperOrder(Base):
    """
    Model for storing Google Maps / Local Lead Scraper orders.
    Uses Botasaurus Desktop API for scraping.
    """
    __tablename__ = "local_scraper_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Botasaurus task ID (returned when creating task)
    botasaurus_task_id = Column(Integer, unique=True, nullable=True, index=True)
    
    # Order status: queued, pending, processing, completed, failed, cancelled
    status = Column(String(50), default="queued")
    
    # Job name/description
    job_name = Column(String(255))
    
    # Scraper configuration (stored as JSON)
    scraper_config = Column(JSON, nullable=False)
    
    # Business types being searched (comma-separated for display)
    business_types = Column(Text)
    
    # Search method: city, search_link, geo_shape
    search_method = Column(String(50))
    
    # Cities or search links (stored as JSON array)
    search_locations = Column(JSON)
    
    # Extraction method: detailed, fast
    extraction_method = Column(String(50), default="detailed")
    
    # Results configuration
    max_results = Column(Integer, nullable=True)
    enable_reviews = Column(Boolean, default=False)
    max_reviews = Column(Integer, default=20)
    
    # Progress tracking
    progress_percentage = Column(Integer, default=0)
    results_count = Column(Integer, default=0)
    
    # File storage
    file_url = Column(Text)  # URL to CSV file in R2
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    
    # Error message if failed
    error_message = Column(Text)

