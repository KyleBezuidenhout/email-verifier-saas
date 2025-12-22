#!/usr/bin/env python3
"""
Migration: Ensure vayne_orders has url column for backwards compatibility

Run this on Railway with:
  railway run python migrate_add_url_column.py

Or set DATABASE_URL environment variable and run:
  python migrate_add_url_column.py
"""
import os
import sys

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL environment variable is required")
    print("Run with: railway run python migrate_add_url_column.py")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    os.system("pip install psycopg2-binary")
    import psycopg2


def migrate():
    """Add url column to vayne_orders table if it doesn't exist"""
    print(f"Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    
    # Check and add url column if it doesn't exist
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vayne_orders' AND column_name = 'url'
    """)
    if not cur.fetchone():
        print("Adding url column to vayne_orders...")
        cur.execute("ALTER TABLE vayne_orders ADD COLUMN url TEXT")
        print("✅ url column added")
    else:
        print("✅ url column already exists")
    
    # Verify linkedin_cookie column exists
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vayne_orders' AND column_name = 'linkedin_cookie'
    """)
    if not cur.fetchone():
        print("Adding linkedin_cookie column to vayne_orders...")
        cur.execute("ALTER TABLE vayne_orders ADD COLUMN linkedin_cookie TEXT")
        print("✅ linkedin_cookie column added")
    else:
        print("✅ linkedin_cookie column already exists")
    
    # Verify sales_nav_url column exists
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vayne_orders' AND column_name = 'sales_nav_url'
    """)
    if not cur.fetchone():
        print("Adding sales_nav_url column to vayne_orders...")
        cur.execute("ALTER TABLE vayne_orders ADD COLUMN sales_nav_url TEXT")
        print("✅ sales_nav_url column added")
    else:
        print("✅ sales_nav_url column already exists")
    
    cur.close()
    conn.close()
    print("\n✅ Migration complete!")


if __name__ == "__main__":
    migrate()
