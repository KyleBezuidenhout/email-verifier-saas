import os
from sqlalchemy import create_engine, text
from app.core.config import settings

def migrate():
    print("Running database migration: Adding job_type to jobs table...")
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        try:
            # Add column if it doesn't exist
            conn.execute(text("""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'jobs' AND column_name = 'job_type'
                    ) THEN
                        ALTER TABLE jobs
                        ADD COLUMN job_type VARCHAR(50) DEFAULT 'enrichment';
                    END IF;
                END $$;
            """))
            print("✓ Added job_type column to jobs table (or it already exists).")
            
            # Update any NULL values to 'enrichment' for backward compatibility
            conn.execute(text("""
                UPDATE jobs 
                SET job_type = 'enrichment' 
                WHERE job_type IS NULL;
            """))
            print("✓ Updated existing jobs to have job_type='enrichment'.")
            
            conn.commit()
        except Exception as e:
            print(f"Error adding job_type column: {e}")
            raise
    
    print("✓ Migration completed successfully!")

if __name__ == "__main__":
    migrate()


