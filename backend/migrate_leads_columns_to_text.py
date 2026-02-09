"""
Migration: Convert leads table VARCHAR columns to TEXT

Removes artificial 255/50 character limits on leads columns.
PostgreSQL treats VARCHAR(n) and TEXT identically for performance,
so this just removes unnecessary length constraints that cause
StringDataRightTruncation errors on large CSV imports.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running migration: Converting leads VARCHAR columns to TEXT...")

    engine = create_engine(settings.DATABASE_URL)

    columns_to_convert = [
        "first_name",
        "last_name",
        "domain",
        "company_size",
        "email",
        "pattern_used",
        "mx_record",
    ]

    with engine.connect() as conn:
        for col in columns_to_convert:
            try:
                conn.execute(text(f"""
                    ALTER TABLE leads
                    ALTER COLUMN {col} TYPE TEXT;
                """))
                print(f"  ✓ Converted leads.{col} to TEXT")
            except Exception as e:
                # Column might already be TEXT or table might not exist yet
                print(f"  - leads.{col}: {e}")

        conn.commit()

    print("✓ Migration completed: leads columns converted to TEXT")


if __name__ == "__main__":
    run_migration()
