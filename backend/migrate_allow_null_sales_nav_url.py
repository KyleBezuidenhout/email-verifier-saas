#!/usr/bin/env python3
"""
Migration: Allow NULL values in sales_nav_url column of vayne_orders table
"""

from app.db.session import SessionLocal
from sqlalchemy import text


def migrate():
    """Remove NOT NULL constraint from sales_nav_url column."""
    db = SessionLocal()
    try:
        # Alter the column to allow NULL values
        db.execute(text("""
            ALTER TABLE vayne_orders 
            ALTER COLUMN sales_nav_url DROP NOT NULL
        """))
        
        db.commit()
        print("✓ Removed NOT NULL constraint from sales_nav_url column")
    except Exception as e:
        db.rollback()
        print(f"⚠ Error removing NOT NULL constraint: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()




