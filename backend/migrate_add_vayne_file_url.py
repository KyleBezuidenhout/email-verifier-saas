"""
Migration: Add file_url and targeting columns to vayne_orders table
"""
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine


def migrate():
    """Add file_url and targeting columns to vayne_orders table"""
    with engine.connect() as conn:
        # Add file_url column if it doesn't exist
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'vayne_orders' AND column_name = 'file_url'
        """))
        if not result.fetchone():
            print("Adding file_url column to vayne_orders...")
            conn.execute(text("ALTER TABLE vayne_orders ADD COLUMN file_url TEXT"))
            conn.commit()
            print("✅ file_url column added")
        else:
            print("✅ file_url column already exists")
        
        # Add targeting column if it doesn't exist
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'vayne_orders' AND column_name = 'targeting'
        """))
        if not result.fetchone():
            print("Adding targeting column to vayne_orders...")
            conn.execute(text("ALTER TABLE vayne_orders ADD COLUMN targeting VARCHAR(255)"))
            conn.commit()
            print("✅ targeting column added")
        else:
            print("✅ targeting column already exists")
        
        print("Migration complete!")


if __name__ == "__main__":
    migrate()

