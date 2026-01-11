"""
Migration: Add local_scraper_orders table

Creates the table for storing Google Maps scraper orders.
"""

import logging
from sqlalchemy import text, inspect
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)


def run_migration():
    """Create local_scraper_orders table if it doesn't exist"""
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        
        # Check if table already exists
        if "local_scraper_orders" in inspector.get_table_names():
            logger.info("✅ local_scraper_orders table already exists")
            return
        
        logger.info("Creating local_scraper_orders table...")
        
        # Create the table
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS local_scraper_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id),
                botasaurus_task_id INTEGER UNIQUE,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                job_name VARCHAR(255) NOT NULL,
                scraper_config JSONB,
                business_types TEXT,
                search_method VARCHAR(50),
                search_locations JSONB,
                extraction_method VARCHAR(50),
                max_results INTEGER,
                enable_reviews BOOLEAN DEFAULT FALSE,
                max_reviews INTEGER,
                progress_percentage INTEGER DEFAULT 0,
                results_count INTEGER DEFAULT 0,
                file_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error_message TEXT
            )
        """))
        
        # Create indexes
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_user_id 
            ON local_scraper_orders(user_id)
        """))
        
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_botasaurus_task_id 
            ON local_scraper_orders(botasaurus_task_id)
        """))
        
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_status 
            ON local_scraper_orders(status)
        """))
        
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_created_at 
            ON local_scraper_orders(created_at DESC)
        """))
        
        db.commit()
        logger.info("✅ local_scraper_orders table created successfully!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating local_scraper_orders table: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migration()

