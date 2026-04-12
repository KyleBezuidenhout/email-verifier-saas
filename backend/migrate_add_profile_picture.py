#!/usr/bin/env python3
"""Migration to add profile_picture_url column to users table."""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running profile_picture_url migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS profile_picture_url TEXT
            """))
            print("  Added profile_picture_url column")
        except Exception as e:
            print(f"  Note: profile_picture_url might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ALTER COLUMN profile_picture_url TYPE TEXT
            """))
            print("  Ensured profile_picture_url is TEXT")
        except Exception as e:
            print(f"  Note: profile_picture_url type change: {e}")

        conn.commit()

    print("profile_picture_url migration completed!")


if __name__ == "__main__":
    run_migration()
