#!/usr/bin/env python3
"""
Migration: Add enable_cache and enable_sublink_scraping columns to website_scraper_jobs table.

These columns control optional features:
- enable_cache: Use cached results for previously scraped URLs (saves credits)
- enable_sublink_scraping: Scrape contact pages if no email found on main page
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    """Add enable_cache and enable_sublink_scraping columns to website_scraper_jobs table."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Check and add enable_cache column
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'website_scraper_jobs' 
            AND column_name = 'enable_cache'
        """))
        
        if result.fetchone():
            print("✓ Column 'enable_cache' already exists in website_scraper_jobs table")
        else:
            print("Adding 'enable_cache' column to website_scraper_jobs table...")
            conn.execute(text("""
                ALTER TABLE website_scraper_jobs 
                ADD COLUMN enable_cache BOOLEAN DEFAULT TRUE
            """))
            conn.commit()
            print("✓ Added 'enable_cache' column")
        
        # Check and add enable_sublink_scraping column
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'website_scraper_jobs' 
            AND column_name = 'enable_sublink_scraping'
        """))
        
        if result.fetchone():
            print("✓ Column 'enable_sublink_scraping' already exists in website_scraper_jobs table")
        else:
            print("Adding 'enable_sublink_scraping' column to website_scraper_jobs table...")
            conn.execute(text("""
                ALTER TABLE website_scraper_jobs 
                ADD COLUMN enable_sublink_scraping BOOLEAN DEFAULT TRUE
            """))
            conn.commit()
            print("✓ Added 'enable_sublink_scraping' column")
        
        print("✓ Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
