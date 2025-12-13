#!/usr/bin/env python3
"""
Migration script to add verification_tag to leads table.
This allows tracking how emails were verified (e.g., catchall-verified).
Run this once after deploying the updated code.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running database migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Add verification_tag column
        try:
            conn.execute(text("""
                ALTER TABLE leads 
                ADD COLUMN IF NOT EXISTS verification_tag VARCHAR(50) NULL
            """))
            print("✓ Added verification_tag column to leads table")
        except Exception as e:
            print(f"Note: Column might already exist: {e}")
        
        conn.commit()
    
    print("✓ Migration completed successfully!")


if __name__ == "__main__":
    migrate()


