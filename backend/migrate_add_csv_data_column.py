#!/usr/bin/env python3
"""
Migration: Add csv_data column to vayne_orders table

This column stores CSV content in PostgreSQL instead of R2.
All webhook responses will be stored in PostgreSQL moving forward.
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import settings

def add_csv_data_column():
    """Add csv_data column to vayne_orders table."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        try:
            # Check if column already exists
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='vayne_orders' AND column_name='csv_data'
            """))
            
            if result.fetchone():
                print("✓ csv_data column already exists in vayne_orders table")
                return
            
            # Add csv_data column
            conn.execute(text("""
                ALTER TABLE vayne_orders 
                ADD COLUMN csv_data TEXT
            """))
            conn.commit()
            
            print("✓ Added csv_data column to vayne_orders table")
            
        except ProgrammingError as e:
            print(f"✗ Error adding csv_data column: {e}")
            conn.rollback()
        except Exception as e:
            print(f"✗ Error: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_csv_data_column()

