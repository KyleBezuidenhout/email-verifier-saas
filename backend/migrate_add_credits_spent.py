#!/usr/bin/env python3
"""
Migration: Add credits_spent column to website_scraper_jobs table.

This tracks ZenRows API credits consumed per job for cost monitoring.
"""

import os
import sys
from sqlalchemy import create_engine, text

# Get database URL from environment
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    sys.exit(1)

def migrate():
    """Add credits_spent column to website_scraper_jobs table."""
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'website_scraper_jobs' 
            AND column_name = 'credits_spent'
        """))
        
        if result.fetchone():
            print("Column 'credits_spent' already exists in website_scraper_jobs table")
            return
        
        # Add the column
        conn.execute(text("""
            ALTER TABLE website_scraper_jobs 
            ADD COLUMN credits_spent INTEGER DEFAULT 0
        """))
        conn.commit()
        
        print("Successfully added 'credits_spent' column to website_scraper_jobs table")

if __name__ == "__main__":
    migrate()
