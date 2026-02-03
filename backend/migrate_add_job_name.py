"""
Migration script to add job_name column to jobs table.
This column stores the optional user-provided job name for easier identification.

Run this script before deploying the backend changes.
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def migrate():
    """Add job_name column to jobs table."""
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        return False
    
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='jobs' AND column_name='job_name'
        """)
        
        if cursor.fetchone():
            print("Column 'job_name' already exists in jobs table. Skipping migration.")
            return True
        
        # Add the job_name column
        print("Adding 'job_name' column to jobs table...")
        cursor.execute("""
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_name VARCHAR(255) NULL
        """)
        
        conn.commit()
        print("Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"Migration failed: {e}")
        return False
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    migrate()
