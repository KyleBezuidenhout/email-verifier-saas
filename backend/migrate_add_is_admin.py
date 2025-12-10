"""
Migration: Add is_admin column to users table
"""
import os
import psycopg2
from psycopg2 import sql

def run_migration():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set, skipping migration")
        return
    
    # Parse the database URL for psycopg2
    if database_url.startswith("postgresql://"):
        conn_str = database_url
    else:
        conn_str = database_url.replace("postgres://", "postgresql://")
    
    try:
        conn = psycopg2.connect(conn_str)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check if column exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'is_admin'
        """)
        
        if cursor.fetchone() is None:
            # Add the column
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN is_admin BOOLEAN DEFAULT FALSE
            """)
            print("✓ Added is_admin column to users table")
        else:
            print("✓ is_admin column already exists")
        
        # Set admin for ben@superwave.io
        cursor.execute("""
            UPDATE users 
            SET is_admin = TRUE 
            WHERE email = 'ben@superwave.io'
        """)
        if cursor.rowcount > 0:
            print("✓ Set is_admin=TRUE for ben@superwave.io")
        else:
            print("ℹ User ben@superwave.io not found (will be set when they register)")
        
        cursor.close()
        conn.close()
        print("✓ Migration completed successfully!")
        
    except Exception as e:
        print(f"Migration error: {e}")
        raise

if __name__ == "__main__":
    run_migration()

