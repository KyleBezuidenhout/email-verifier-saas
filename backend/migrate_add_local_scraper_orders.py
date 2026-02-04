"""
Migration: Add/Update local_scraper_orders table

Creates or updates the table for storing Google Maps scraper orders (via Apify).
Supports single_city and full_state scraping modes.
"""

import logging
from sqlalchemy import text, inspect
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)


def run_migration():
    """Create local_scraper_orders table if it doesn't exist, and add new columns for Apify"""
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        
        # Check if table already exists
        if "local_scraper_orders" not in inspector.get_table_names():
            logger.info("Creating local_scraper_orders table...")
            
            # Create the table with new schema
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS local_scraper_orders (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    status VARCHAR(50) NOT NULL DEFAULT 'pending',
                    job_name VARCHAR(255) NOT NULL,
                    scrape_mode VARCHAR(20) NOT NULL,
                    states JSONB NOT NULL,
                    city VARCHAR(200),
                    search_term VARCHAR(500) NOT NULL,
                    apify_run_ids JSONB,
                    webhook_secret VARCHAR(100),
                    webhook_url VARCHAR(500),
                    total_cities INTEGER DEFAULT 1,
                    completed_cities INTEGER DEFAULT 0,
                    progress_percentage INTEGER DEFAULT 0,
                    results_count INTEGER DEFAULT 0,
                    estimated_cost DECIMAL(10, 2),
                    actual_cost DECIMAL(10, 2),
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
                CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_status 
                ON local_scraper_orders(status)
            """))
            
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_local_scraper_orders_created_at 
                ON local_scraper_orders(created_at DESC)
            """))
            
            db.commit()
            logger.info("✅ local_scraper_orders table created successfully!")
        else:
            # Table exists - add new columns for Apify integration if they don't exist
            logger.info("local_scraper_orders table exists, checking for new columns...")
            
            existing_columns = [col['name'] for col in inspector.get_columns('local_scraper_orders')]
            
            # New columns to add for Apify integration
            new_columns = [
                ("scrape_mode", "VARCHAR(20)"),
                ("states", "JSONB"),  # List of states to scrape
                ("city", "VARCHAR(200)"),
                ("search_term", "VARCHAR(500)"),
                ("apify_run_ids", "JSONB"),
                ("webhook_secret", "VARCHAR(100)"),
                ("webhook_url", "VARCHAR(500)"),  # Webhook URL for Apify callbacks
                ("total_cities", "INTEGER DEFAULT 1"),
                ("completed_cities", "INTEGER DEFAULT 0"),
                ("estimated_cost", "DECIMAL(10, 2)"),
                ("actual_cost", "DECIMAL(10, 2)"),
            ]
            
            # Columns to remove (old Botasaurus columns)
            old_columns = [
                "botasaurus_task_id",
                "scraper_config",
                "business_types",
                "search_method",
                "search_locations",
                "extraction_method",
                "max_results",
                "enable_reviews",
                "max_reviews",
            ]
            
            for col_name, col_type in new_columns:
                if col_name not in existing_columns:
                    try:
                        db.execute(text(f"ALTER TABLE local_scraper_orders ADD COLUMN {col_name} {col_type}"))
                        logger.info(f"  ✅ Added column: {col_name}")
                    except Exception as e:
                        logger.warning(f"  ⚠️ Could not add column {col_name}: {e}")
            
            # Note: We don't drop old columns to avoid data loss
            # They will just be unused
            
            db.commit()
            logger.info("✅ local_scraper_orders table updated successfully!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error with local_scraper_orders table: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migration()
