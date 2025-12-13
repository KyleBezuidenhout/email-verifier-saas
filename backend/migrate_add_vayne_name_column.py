"""
Migration: Add name column to vayne_orders table
This column stores the order name from Vayne API (required for webhook matching)
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import settings

def migrate_add_vayne_name():
    """Add name column to vayne_orders table."""
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Check if name column already exists
        result = session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='vayne_orders' AND column_name='name'
        """))
        
        if result.fetchone():
            print("✓ name column already exists in vayne_orders table")
        else:
            # Add name column
            session.execute(text("""
                ALTER TABLE vayne_orders 
                ADD COLUMN name VARCHAR(255)
            """))
            session.commit()
            print("✓ Added name column to vayne_orders table")
        
        # Also check csv_file_path
        result = session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='vayne_orders' AND column_name='csv_file_path'
        """))
        
        if result.fetchone():
            print("✓ csv_file_path column already exists in vayne_orders table")
        else:
            # Add csv_file_path column
            session.execute(text("""
                ALTER TABLE vayne_orders 
                ADD COLUMN csv_file_path VARCHAR(500)
            """))
            session.commit()
            print("✓ Added csv_file_path column to vayne_orders table")
            
    except Exception as e:
        session.rollback()
        print(f"✗ Error adding columns: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    migrate_add_vayne_name()

