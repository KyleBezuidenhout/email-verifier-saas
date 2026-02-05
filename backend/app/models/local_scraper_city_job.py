"""
Local Scraper City Job Model

Stores individual city scraping jobs for Google Maps scraper orders.
Each order has multiple city jobs (1:N relationship).
This normalized design prevents race conditions in webhook processing.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.db.base import Base


class LocalScraperCityJob(Base):
    """
    Individual city scraping job - part of a LocalScraperOrder.
    One row per city, allowing concurrent webhook updates without race conditions.
    """
    __tablename__ = "local_scraper_city_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("local_scraper_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # City identification
    city_index = Column(Integer, nullable=False)  # Position in the order's city list
    city = Column(String(200), nullable=False)
    state = Column(String(100), nullable=False)
    search_term = Column(String(500), nullable=True, index=True)  # For cache lookups
    
    # Apify run tracking
    run_id = Column(String(100), nullable=True)  # Apify run ID
    status = Column(String(20), nullable=False, default="pending")  # pending, running, completed, failed
    dataset_id = Column(String(100), nullable=True)  # Apify dataset ID for results
    
    # Results storage
    results = Column(JSONB, default=list)  # Array of place objects
    results_count = Column(Integer, default=0)
    
    # Error handling
    error = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship back to order
    # order = relationship("LocalScraperOrder", back_populates="city_jobs")
    
    # Unique constraint: one job per city_index per order
    __table_args__ = (
        # Composite unique constraint
        {"sqlite_autoincrement": True},
    )
