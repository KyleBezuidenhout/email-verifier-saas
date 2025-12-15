"""
Migration: Add missing columns to vayne_orders table
"""
import os
import psycopg2
from psycopg2 import sql

DATABASE_URL = os.environ.get("DATABASE_URL")

def run_migration():
    print("Running database migration: Adding missing columns to vayne_orders table...")
    
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    
    # List of columns to add with their definitions
    columns_to_add = [
        ("export_format", "VARCHAR(20)"),
        ("qualified_leads_only", "BOOLEAN DEFAULT FALSE"),
        ("estimated_leads", "INTEGER"),
        ("leads_found", "INTEGER"),
        ("leads_qualified", "INTEGER"),
        ("progress_percentage", "INTEGER"),
        ("credits_charged", "INTEGER"),
        ("file_url", "TEXT"),
        ("targeting", "VARCHAR(255)"),
    ]
    
    for column_name, column_type in columns_to_add:
        try:
            cur.execute(f"""
                ALTER TABLE vayne_orders 
                ADD COLUMN IF NOT EXISTS {column_name} {column_type};
            """)
            print(f"✓ Added {column_name} column (or it already exists)")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"✓ {column_name} column already exists")
            else:
                print(f"⚠ Error adding {column_name}: {e}")
    
    cur.close()
    conn.close()
    print("✓ Migration completed successfully!")

if __name__ == "__main__":
    run_migration()

