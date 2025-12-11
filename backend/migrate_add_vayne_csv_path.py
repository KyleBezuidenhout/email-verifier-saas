"""
Migration: Add csv_file_path column to vayne_orders table

This column stores the R2 path to the exported CSV file.
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

def migrate_add_vayne_csv_path():
    """Add csv_file_path column to vayne_orders table."""
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Check if column already exists
        result = session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='vayne_orders' AND column_name='csv_file_path'
        """))
        
        if result.fetchone():
            print("✓ csv_file_path column already exists in vayne_orders table")
            return
        
        # Add csv_file_path column
        session.execute(text("""
            ALTER TABLE vayne_orders 
            ADD COLUMN csv_file_path VARCHAR(500)
        """))
        
        session.commit()
        print("✓ Added csv_file_path column to vayne_orders table")
        
    except Exception as e:
        session.rollback()
        print(f"✗ Error adding csv_file_path column: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    migrate_add_vayne_csv_path()

