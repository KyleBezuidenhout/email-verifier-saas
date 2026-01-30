"""
Migration: Add website_scraper_jobs table

This migration creates the website_scraper_jobs table for the Website Contact Scraper feature.
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    """Create website_scraper_jobs table if it doesn't exist."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'website_scraper_jobs'
            );
        """))
        table_exists = result.scalar()
        
        if not table_exists:
            print("Creating website_scraper_jobs table...")
            conn.execute(text("""
                CREATE TABLE website_scraper_jobs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    status VARCHAR(50) NOT NULL DEFAULT 'pending',
                    original_filename TEXT,
                    total_leads INTEGER DEFAULT 0,
                    completed_leads INTEGER DEFAULT 0,
                    progress_percentage INTEGER DEFAULT 0,
                    hit_rate_percentage DECIMAL(5,2) DEFAULT 0.00,
                    input_file_path TEXT,
                    output_file_path TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    completed_at TIMESTAMP,
                    error_message TEXT
                );
                
                CREATE INDEX idx_website_scraper_jobs_user_id ON website_scraper_jobs(user_id);
                CREATE INDEX idx_website_scraper_jobs_status ON website_scraper_jobs(status);
                CREATE INDEX idx_website_scraper_jobs_created_at ON website_scraper_jobs(created_at);
            """))
            conn.commit()
            print("✓ website_scraper_jobs table created successfully!")
        else:
            print("✓ website_scraper_jobs table already exists, skipping creation.")


if __name__ == "__main__":
    run_migration()
