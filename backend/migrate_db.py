#!/usr/bin/env python3
"""
Migration script to add full_name and company_name columns to users table.
Run this once after deploying the updated code.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running database migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Add full_name column if it doesn't exist
        try:
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)
            """))
            print("✓ Added full_name column")
        except Exception as e:
            print(f"Note: full_name column might already exist: {e}")
        
        # Add company_name column if it doesn't exist
        try:
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)
            """))
            print("✓ Added company_name column")
        except Exception as e:
            print(f"Note: company_name column might already exist: {e}")
        
        conn.commit()
    
    print("✓ Migration completed successfully!")


if __name__ == "__main__":
    migrate()


