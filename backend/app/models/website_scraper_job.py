"""
Website Scraper Job Model

Stores website contact scraper jobs - for extracting emails and phones from websites.
Uses ZenRows API for web scraping with tiered escalation.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class WebsiteScraperJob(Base):
    """
    Website Contact Scraper Job - for extracting emails and phones from websites.
    Uses ZenRows API with tiered scraping (basic → JS render → premium proxy → residential).
    """
    __tablename__ = "website_scraper_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Job status: pending, processing, completed, failed, cancelled
    status = Column(String(50), nullable=False, default="pending", index=True)
    
    # File metadata
    original_filename = Column(Text, nullable=True)
    job_name = Column(String(255), nullable=True)  # Optional user-provided job name
    
    # Progress tracking
    total_leads = Column(Integer, default=0)
    completed_leads = Column(Integer, default=0)
    progress_percentage = Column(Integer, default=0)
    hit_rate_percentage = Column(Numeric(5, 2), default=0.00)  # % of sites with contacts found
    
    # Cost tracking (ZenRows credits)
    credits_spent = Column(Integer, default=0)  # Total ZenRows API credits consumed
    
    # File storage (R2 paths)
    input_file_path = Column(Text, nullable=True)
    output_file_path = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)
