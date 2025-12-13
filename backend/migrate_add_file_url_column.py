#!/usr/bin/env python3
"""
Migration: Add file_url column to vayne_orders table

This column stores the direct URL to CSV file from Vayne (from webhook).
Users will download CSV manually and upload to enrichment.
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import settings

def add_file_url_column():
    """Add file_url column to vayne_orders table."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        try:
            # Check if column already exists
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='vayne_orders' AND column_name='file_url'
            """))
            
            if result.fetchone():
                print("✓ file_url column already exists in vayne_orders table")
                return
            
            # Add file_url column
            conn.execute(text("""
                ALTER TABLE vayne_orders 
                ADD COLUMN file_url TEXT
            """))
            conn.commit()
            
            print("✓ Added file_url column to vayne_orders table")
            
        except ProgrammingError as e:
            print(f"✗ Error adding file_url column: {e}")
            conn.rollback()
        except Exception as e:
            print(f"✗ Error: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_file_url_column()

