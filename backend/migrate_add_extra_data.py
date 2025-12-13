"""
Migration to add extra_data JSONB column to leads table.
This column stores all additional CSV columns that aren't part of the standard schema.
"""
import os
import sys
from sqlalchemy import create_engine, text

# Get database URL from environment
DATABASE_URL = os.environ.get("DATABASE_URL")

def migrate():
    """Add extra_data column to leads table."""
    print("Running database migration: Adding extra_data to leads table...")
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set")
        return
    
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'leads' AND column_name = 'extra_data'
        """))
        
        if result.fetchone():
            print("✓ extra_data column already exists in leads table")
        else:
            # Add extra_data column as JSONB with default empty object
            conn.execute(text("""
                ALTER TABLE leads 
                ADD COLUMN extra_data JSONB DEFAULT '{}'::jsonb
            """))
            conn.commit()
            print("✓ Added extra_data column to leads table")
        
        print("✓ Migration completed successfully!")

if __name__ == "__main__":
    migrate()

