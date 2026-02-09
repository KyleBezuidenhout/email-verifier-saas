"""
Migration: Add google_maps_cities table

Creates the table for storing US cities for Google Maps scraping.
This table will be seeded with ~9,574 cities across 50 US states.
"""

import logging
from sqlalchemy import text, inspect
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)


def run_migration():
    """Create google_maps_cities table if it doesn't exist"""
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        
        # Check if table already exists
        if "google_maps_cities" in inspector.get_table_names():
            logger.info("✅ google_maps_cities table already exists")
            return
        
        logger.info("Creating google_maps_cities table...")
        
        # Create the table
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS google_maps_cities (
                id SERIAL PRIMARY KEY,
                state VARCHAR(100) NOT NULL,
                city VARCHAR(200) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(state, city)
            )
        """))
        
        # Create index on state for fast lookups
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_google_maps_cities_state 
            ON google_maps_cities(state)
        """))
        
        db.commit()
        logger.info("✅ google_maps_cities table created successfully!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating google_maps_cities table: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migration()
