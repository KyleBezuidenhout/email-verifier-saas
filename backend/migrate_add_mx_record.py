#!/usr/bin/env python3
"""
Migration script to add mx_record column to leads table.
This allows storing MX provider information (e.g., "google", "outlook").
Run this once after deploying the updated code.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running database migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Add mx_record column
        try:
            conn.execute(text("""
                ALTER TABLE leads 
                ADD COLUMN IF NOT EXISTS mx_record VARCHAR(255) NULL
            """))
            print("✓ Added mx_record column to leads table")
        except Exception as e:
            print(f"Note: Column might already exist: {e}")
        
        conn.commit()
    
    print("✓ Migration completed successfully!")


if __name__ == "__main__":
    migrate()

