#!/usr/bin/env python3
"""
Migration: Add website_scraper_cache table

This table stores scraped URL results for reuse, saving ZenRows credits
when the same URL is scraped again in future jobs.
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    """Create website_scraper_cache table if it doesn't exist."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'website_scraper_cache'
            );
        """))
        table_exists = result.scalar()
        
        if not table_exists:
            print("Creating website_scraper_cache table...")
            conn.execute(text("""
                CREATE TABLE website_scraper_cache (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    url TEXT NOT NULL UNIQUE,
                    email_1 VARCHAR(255),
                    email_2 VARCHAR(255),
                    phone_1 VARCHAR(100),
                    phone_2 VARCHAR(100),
                    has_contacts BOOLEAN DEFAULT FALSE,
                    scraped_at TIMESTAMP DEFAULT NOW()
                );
                
                CREATE INDEX idx_website_scraper_cache_url ON website_scraper_cache(url);
                CREATE INDEX idx_website_scraper_cache_has_contacts ON website_scraper_cache(has_contacts);
            """))
            conn.commit()
            print("✓ website_scraper_cache table created successfully!")
        else:
            print("✓ website_scraper_cache table already exists, skipping creation.")


if __name__ == "__main__":
    run_migration()
