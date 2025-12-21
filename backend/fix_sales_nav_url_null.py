#!/usr/bin/env python3
"""
Standalone migration: Allow NULL values in sales_nav_url column of vayne_orders table
Run with: DATABASE_URL=<your_railway_url> python3 fix_sales_nav_url_null.py
"""

import os
import sys
from sqlalchemy import create_engine, text

def migrate():
    database_url = os.environ.get("DATABASE_URL")
    
    if not database_url:
        print("❌ Error: DATABASE_URL environment variable is required")
        print("Usage: DATABASE_URL=<your_railway_url> python3 fix_sales_nav_url_null.py")
        sys.exit(1)
    
    # Convert postgres:// to postgresql:// if needed (Railway uses postgres://)
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE vayne_orders 
                ALTER COLUMN sales_nav_url DROP NOT NULL
            """))
            conn.commit()
            print("✅ Removed NOT NULL constraint from sales_nav_url column")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()


