"""
Migration script to add column_email field to jobs table.
This gives verification jobs a dedicated column for the email mapping
instead of reusing column_website.
"""
from app.db.session import SessionLocal


def migrate():
    db = SessionLocal()
    try:
        db.execute("""
            ALTER TABLE jobs 
            ADD COLUMN IF NOT EXISTS column_email VARCHAR(255) NULL
        """)
        print("✓ Added column_email column to jobs table")

        db.commit()
        print("\n✅ Migration complete: column_email field added to jobs table")
    except Exception as e:
        print(f"Migration error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
