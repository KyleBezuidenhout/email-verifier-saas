#!/usr/bin/env python3
"""
Migration script to make job_id nullable in leads table.
This allows leads to persist even when jobs are deleted.
Run this once after deploying the updated code.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running database migration...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Make job_id nullable
        try:
            conn.execute(text("""
                ALTER TABLE leads 
                ALTER COLUMN job_id DROP NOT NULL
            """))
            print("✓ Made job_id nullable in leads table")
        except Exception as e:
            print(f"Note: job_id might already be nullable: {e}")
        
        # Update foreign key constraint to SET NULL instead of CASCADE
        try:
            # Drop existing foreign key constraint
            conn.execute(text("""
                ALTER TABLE leads 
                DROP CONSTRAINT IF EXISTS leads_job_id_fkey
            """))
            print("✓ Dropped old foreign key constraint")
            
            # Add new foreign key with SET NULL
            conn.execute(text("""
                ALTER TABLE leads 
                ADD CONSTRAINT leads_job_id_fkey 
                FOREIGN KEY (job_id) 
                REFERENCES jobs(id) 
                ON DELETE SET NULL
            """))
            print("✓ Added new foreign key constraint with SET NULL")
        except Exception as e:
            print(f"Note: Foreign key might already be updated: {e}")
        
        conn.commit()
    
    print("✓ Migration completed successfully!")


if __name__ == "__main__":
    migrate()


