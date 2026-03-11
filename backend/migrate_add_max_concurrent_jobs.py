#!/usr/bin/env python3
"""
Migration script to add max_concurrent_jobs column to users table.
This limits how many jobs a client can have active/queued simultaneously.
Run this once after deploying the fair-share system.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running max_concurrent_jobs migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS max_concurrent_jobs INTEGER NOT NULL DEFAULT 3
            """))
            print("Added max_concurrent_jobs column to users table (default: 3)")
        except Exception as e:
            print(f"Note: Column might already exist: {e}")
        
        conn.commit()
    
    print("Migration completed successfully!")


if __name__ == "__main__":
    migrate()
