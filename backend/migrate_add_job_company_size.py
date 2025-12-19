"""
Migration script to add company_size column to jobs table.
This stores the user's dropdown selection for permutation ranking.
"""
from app.db.session import SessionLocal


def migrate():
    db = SessionLocal()
    try:
        db.execute("""
            ALTER TABLE jobs 
            ADD COLUMN IF NOT EXISTS company_size VARCHAR(50) NULL
        """)
        db.commit()
        print("✓ Added company_size column to jobs table")
    except Exception as e:
        print(f"Migration error (may already exist): {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
