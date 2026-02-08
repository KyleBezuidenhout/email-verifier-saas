"""
Website Scraper Cache Model

Stores scraped URL results for reuse, saving ZenRows credits
when the same URL is scraped again in future jobs.
"""

from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class WebsiteScraperCache(Base):
    """
    Cache for website contact scraping results.
    Stores email/phone data for verbatim URL matching.
    """
    __tablename__ = "website_scraper_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url = Column(Text, nullable=False, unique=True, index=True)  # Verbatim URL for exact matching
    
    # Extracted contact data
    email_1 = Column(String(255), nullable=True)
    email_2 = Column(String(255), nullable=True)
    phone_1 = Column(String(100), nullable=True)
    phone_2 = Column(String(100), nullable=True)
    
    # Quick lookup flag
    has_contacts = Column(Boolean, default=False, index=True)
    
    # Timestamp
    scraped_at = Column(DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary for easy access."""
        return {
            'email_1': self.email_1 or '',
            'email_2': self.email_2 or '',
            'phone_1': self.phone_1 or '',
            'phone_2': self.phone_2 or '',
            'has_contacts': self.has_contacts,
        }
