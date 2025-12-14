#!/usr/bin/env python3
"""
Quick fix: Add url column to vayne_orders table immediately.
Run this script to fix the missing url column issue.
"""
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL not set!")
    exit(1)

try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    
    # Add url column if it doesn't exist
    cur.execute("ALTER TABLE vayne_orders ADD COLUMN IF NOT EXISTS url TEXT;")
    print("✅ Successfully added url column to vayne_orders table!")
    
    # Verify it was added
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='vayne_orders' AND column_name='url'
    """)
    if cur.fetchone():
        print("✅ Verified: url column exists in vayne_orders table")
    else:
        print("⚠️  Warning: url column may not have been added")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)
