#!/usr/bin/env python3
"""
Migration to add email verification columns: email_verified, email_verification_token, email_verification_expires.
Existing users are grandfathered with email_verified=TRUE via the column default.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running email verification fields migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE
            """))
            print("  Added email_verified column")
        except Exception as e:
            print(f"  Note: email_verified might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255)
            """))
            print("  Added email_verification_token column")
        except Exception as e:
            print(f"  Note: email_verification_token might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ
            """))
            print("  Added email_verification_expires column")
        except Exception as e:
            print(f"  Note: email_verification_expires might already exist: {e}")

        conn.commit()

    print("Email verification fields migration completed!")


if __name__ == "__main__":
    run_migration()
