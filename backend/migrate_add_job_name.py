"""
Migration script to add job_name column to jobs and website_scraper_jobs tables.
This column stores the optional user-provided job name for easier identification.

Run this script before deploying the backend changes.
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def migrate():
    """Add job_name column to jobs and website_scraper_jobs tables."""
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        return False
    
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Migrate 'jobs' table
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='jobs' AND column_name='job_name'
        """)
        
        if cursor.fetchone():
            print("Column 'job_name' already exists in jobs table. Skipping.")
        else:
            print("Adding 'job_name' column to jobs table...")
            cursor.execute("""
                ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_name VARCHAR(255) NULL
            """)
            print("Done.")
        
        # Migrate 'website_scraper_jobs' table
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='website_scraper_jobs' AND column_name='job_name'
        """)
        
        if cursor.fetchone():
            print("Column 'job_name' already exists in website_scraper_jobs table. Skipping.")
        else:
            print("Adding 'job_name' column to website_scraper_jobs table...")
            cursor.execute("""
                ALTER TABLE website_scraper_jobs ADD COLUMN IF NOT EXISTS job_name VARCHAR(255) NULL
            """)
            print("Done.")
        
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
