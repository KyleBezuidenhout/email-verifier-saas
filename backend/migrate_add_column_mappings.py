"""
Migration script to add column mapping fields to jobs table.
These store the user's manual column selections for the enrichment worker.
"""
from app.db.session import SessionLocal


def migrate():
    db = SessionLocal()
    try:
        # Add column_first_name
        db.execute("""
            ALTER TABLE jobs 
            ADD COLUMN IF NOT EXISTS column_first_name VARCHAR(255) NULL
        """)
        print("✓ Added column_first_name column to jobs table")
        
        # Add column_last_name
        db.execute("""
            ALTER TABLE jobs 
            ADD COLUMN IF NOT EXISTS column_last_name VARCHAR(255) NULL
        """)
        print("✓ Added column_last_name column to jobs table")
        
        # Add column_website
        db.execute("""
            ALTER TABLE jobs 
            ADD COLUMN IF NOT EXISTS column_website VARCHAR(255) NULL
        """)
        print("✓ Added column_website column to jobs table")
        
        # Add column_company_size
        db.execute("""
            ALTER TABLE jobs 
            ADD COLUMN IF NOT EXISTS column_company_size VARCHAR(255) NULL
        """)
        print("✓ Added column_company_size column to jobs table")
        
        db.commit()
        print("\n✅ Migration complete: column mapping fields added to jobs table")
    except Exception as e:
        print(f"Migration error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
