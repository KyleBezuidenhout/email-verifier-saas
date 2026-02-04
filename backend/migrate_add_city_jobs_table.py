"""
Migration: Add local_scraper_city_jobs table and Apify settings columns

Creates the normalized city_jobs table for storing individual city scraping jobs.
This prevents race conditions when processing concurrent webhooks.

Also adds Apify configuration columns to local_scraper_orders for per-job settings.
"""

import logging
from sqlalchemy import text, inspect
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)


def run_migration():
    """Create local_scraper_city_jobs table and add Apify settings to orders table"""
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        
        # ============================================
        # Part 1: Create local_scraper_city_jobs table
        # ============================================
        if "local_scraper_city_jobs" not in inspector.get_table_names():
            logger.info("Creating local_scraper_city_jobs table...")
            
            db.execute(text("""
                CREATE TABLE local_scraper_city_jobs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    order_id UUID NOT NULL REFERENCES local_scraper_orders(id) ON DELETE CASCADE,
                    city_index INTEGER NOT NULL,
                    city VARCHAR(200) NOT NULL,
                    state VARCHAR(100) NOT NULL,
                    
                    -- Apify tracking
                    run_id VARCHAR(100),
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    dataset_id VARCHAR(100),
                    
                    -- Results (JSON array of places)
                    results JSONB DEFAULT '[]'::jsonb,
                    results_count INTEGER DEFAULT 0,
                    
                    -- Error handling
                    error TEXT,
                    retry_count INTEGER DEFAULT 0,
                    
                    -- Timestamps
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    
                    -- Unique constraint: one job per city_index per order
                    UNIQUE(order_id, city_index)
                )
            """))
            
            # Create indexes for fast queries
            db.execute(text("""
                CREATE INDEX idx_city_jobs_order_id 
                ON local_scraper_city_jobs(order_id)
            """))
            
            db.execute(text("""
                CREATE INDEX idx_city_jobs_order_status 
                ON local_scraper_city_jobs(order_id, status)
            """))
            
            db.execute(text("""
                CREATE INDEX idx_city_jobs_run_id 
                ON local_scraper_city_jobs(run_id)
            """))
            
            db.execute(text("""
                CREATE INDEX idx_city_jobs_status_updated 
                ON local_scraper_city_jobs(status, updated_at)
            """))
            
            db.commit()
            logger.info("✅ local_scraper_city_jobs table created successfully!")
        else:
            logger.info("local_scraper_city_jobs table already exists, skipping...")
        
        # ============================================
        # Part 2: Add Apify settings columns to local_scraper_orders
        # ============================================
        logger.info("Checking for Apify settings columns in local_scraper_orders...")
        
        existing_columns = [col['name'] for col in inspector.get_columns('local_scraper_orders')]
        
        apify_settings_columns = [
            ("max_results_per_city", "INTEGER"),
            ("skip_closed_places", "BOOLEAN DEFAULT true"),
            ("website_filter", "VARCHAR(20) DEFAULT 'withWebsite'"),
            ("scrape_reviews", "BOOLEAN DEFAULT false"),
            ("max_reviews", "INTEGER DEFAULT 0"),
            ("scrape_images", "BOOLEAN DEFAULT false"),
            ("max_images", "INTEGER DEFAULT 0"),
            ("language", "VARCHAR(10) DEFAULT 'en'"),
        ]
        
        for col_name, col_type in apify_settings_columns:
            if col_name not in existing_columns:
                try:
                    db.execute(text(f"ALTER TABLE local_scraper_orders ADD COLUMN {col_name} {col_type}"))
                    logger.info(f"  ✅ Added column: {col_name}")
                except Exception as e:
                    logger.warning(f"  ⚠️ Could not add column {col_name}: {e}")
        
        db.commit()
        logger.info("✅ Migration completed successfully!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error running migration: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migration()
