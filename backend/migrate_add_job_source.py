#!/usr/bin/env python3
"""
Migration: Add source column to jobs table
This allows jobs to be tagged with their origin (e.g., "Sales Nav")
"""

from app.db.session import SessionLocal
from sqlalchemy import text


def migrate():
    """Add source column to jobs table if it doesn't exist."""
    db = SessionLocal()
    try:
        # Check if column already exists
        result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='jobs' AND column_name='source'
        """))
        
        if result.fetchone():
            print("✓ source column already exists in jobs table")
            return
        
        # Add source column
        db.execute(text("""
            ALTER TABLE jobs 
            ADD COLUMN source VARCHAR(50)
        """))
        
        # Add index for better query performance
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source)
        """))
        
        db.commit()
        print("✓ Added source column to jobs table")
        print("✓ Added index on source column")
    except Exception as e:
        db.rollback()
        print(f"⚠ Error adding source column (this is OK if it already exists): {e}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()

