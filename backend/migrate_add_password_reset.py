#!/usr/bin/env python3
"""
Migration to add password reset columns: password_reset_token, password_reset_expires.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running password reset fields migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)
            """))
            print("  Added password_reset_token column")
        except Exception as e:
            print(f"  Note: password_reset_token might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ
            """))
            print("  Added password_reset_expires column")
        except Exception as e:
            print(f"  Note: password_reset_expires might already exist: {e}")

        conn.commit()

    print("Password reset fields migration completed!")


if __name__ == "__main__":
    run_migration()
