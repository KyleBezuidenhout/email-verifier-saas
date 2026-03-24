#!/usr/bin/env python3
"""
Migration script to add last_heartbeat column to jobs table.
Used by crash recovery to distinguish actively-processing jobs from orphaned ones.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def migrate():
    print("Running last_heartbeat migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE jobs
                ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ
            """))
            print("Added last_heartbeat column to jobs table")
        except Exception as e:
            print(f"Note: Column might already exist: {e}")

        conn.commit()

    print("Migration completed successfully!")


if __name__ == "__main__":
    migrate()
