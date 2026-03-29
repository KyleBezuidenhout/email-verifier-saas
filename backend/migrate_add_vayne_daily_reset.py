#!/usr/bin/env python3
"""
Migration to add vayne_daily_usage_reset_at column to users table.
Tracks when a user last reset their per-client daily scraping limit.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running vayne daily usage reset migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS vayne_daily_usage_reset_at TIMESTAMPTZ
            """))
            print("  Added vayne_daily_usage_reset_at column")
        except Exception as e:
            print(f"  Note: vayne_daily_usage_reset_at might already exist: {e}")

        conn.commit()

    print("Vayne daily usage reset migration completed!")


if __name__ == "__main__":
    run_migration()
