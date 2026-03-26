#!/usr/bin/env python3
"""
Migration: add cache_hits and cache_lookups columns to jobs table.
These track how many enrichment leads were resolved from the lead-cache
vs. how many total people were looked up, enabling cache-hit-rate analytics.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running cache hit tracking migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE jobs
                ADD COLUMN IF NOT EXISTS cache_hits INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS cache_lookups INTEGER DEFAULT 0
            """))
            print("Added cache_hits and cache_lookups columns to jobs table")
        except Exception as e:
            print(f"Note: Columns might already exist: {e}")

        conn.commit()

    print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
