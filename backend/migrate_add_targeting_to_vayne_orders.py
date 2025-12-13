"""
Migration: Add targeting column to vayne_orders table

This column stores the job name/targeting description for each scraping order.
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

def migrate_add_targeting_to_vayne_orders():
    """Add targeting column to vayne_orders table."""
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Check if column already exists
        result = session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='vayne_orders' AND column_name='targeting'
        """))
        
        if result.fetchone():
            print("✓ targeting column already exists in vayne_orders table")
            return
        
        # Add targeting column
        session.execute(text("""
            ALTER TABLE vayne_orders 
            ADD COLUMN targeting VARCHAR(255)
        """))
        
        session.commit()
        print("✓ Added targeting column to vayne_orders table")
        
    except Exception as e:
        session.rollback()
        print(f"✗ Error adding targeting column: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    migrate_add_targeting_to_vayne_orders()
