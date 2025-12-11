#!/usr/bin/env python3
"""
Migration script to add catchall_verifier_api_key to users table.
This allows users to optionally add their catchall verifier API key.
Run this once after deploying the updated code.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running database migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Add catchall_verifier_api_key column
        try:
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS catchall_verifier_api_key VARCHAR(255) NULL
            """))
            print("✓ Added catchall_verifier_api_key column to users table")
        except Exception as e:
            print(f"Note: Column might already exist: {e}")
        
        conn.commit()
    
    print("✓ Migration completed successfully!")


if __name__ == "__main__":
    migrate()


