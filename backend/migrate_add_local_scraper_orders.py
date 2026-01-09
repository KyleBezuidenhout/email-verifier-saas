"""
Migration: Add local_scraper_orders table

This migration creates the table for storing Google Maps / Local Lead Scraper orders.
This is completely separate from Sales Nav, Enrichment, and Verification features.
"""

import os
import sys
from sqlalchemy import create_engine, text, inspect
import logging

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate():
    """Create local_scraper_orders table if it doesn't exist"""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        return False
    
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        # Check if table already exists
        inspector = inspect(engine)
        if "local_scraper_orders" in inspector.get_table_names():
            logger.info("✅ local_scraper_orders table already exists")
            return True
        
        logger.info("Creating local_scraper_orders table...")
        
        # Create the table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS local_scraper_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                botasaurus_task_id INTEGER UNIQUE,
                status VARCHAR(50) DEFAULT 'queued',
                job_name VARCHAR(255),
                scraper_config JSONB NOT NULL,
                business_types TEXT,
                search_method VARCHAR(50),
                search_locations JSONB,
                extraction_method VARCHAR(50) DEFAULT 'detailed',
                max_results INTEGER,
                enable_reviews BOOLEAN DEFAULT FALSE,
                max_reviews INTEGER DEFAULT 20,
                progress_percentage INTEGER DEFAULT 0,
                results_count INTEGER DEFAULT 0,
                file_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                started_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE,
                error_message TEXT
            )
        """))
        
        # Create indexes
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_user_id 
            ON local_scraper_orders(user_id)
        """))
        
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_botasaurus_task_id 
            ON local_scraper_orders(botasaurus_task_id)
        """))
        
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_status 
            ON local_scraper_orders(status)
        """))
        
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_created_at 
            ON local_scraper_orders(created_at DESC)
        """))
        
        conn.commit()
        
        logger.info("✅ local_scraper_orders table created successfully!")
        return True


def run_migration():
    """Entry point for running migration"""
    try:
        migrate()
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}")
        raise


if __name__ == "__main__":
    run_migration()

