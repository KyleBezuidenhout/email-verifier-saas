#!/usr/bin/env python3
"""
Migration script to add mx_provider column to leads table.
This allows categorizing MX records as outlook, google, or other.
Run this once after deploying the updated code.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running database migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Add mx_provider column
        try:
            conn.execute(text("""
                ALTER TABLE leads 
                ADD COLUMN IF NOT EXISTS mx_provider VARCHAR(50) NULL
            """))
            print("✓ Added mx_provider column to leads table")
            
            # Add index for faster filtering
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_leads_mx_provider 
                ON leads(mx_provider)
            """))
            print("✓ Added index on mx_provider column")
        except Exception as e:
            print(f"Note: Column or index might already exist: {e}")
        
        conn.commit()
    
    print("✓ Migration completed successfully!")


if __name__ == "__main__":
    migrate()

