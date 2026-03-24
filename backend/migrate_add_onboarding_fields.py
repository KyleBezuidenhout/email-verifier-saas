#!/usr/bin/env python3
"""
Migration to add onboarding fields: company_website, referral_source, daily_cold_emails.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running onboarding fields migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS company_website VARCHAR(255)
            """))
            print("  Added company_website column")
        except Exception as e:
            print(f"  Note: company_website might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS referral_source VARCHAR(500)
            """))
            print("  Added referral_source column")
        except Exception as e:
            print(f"  Note: referral_source might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS daily_cold_emails INTEGER
            """))
            print("  Added daily_cold_emails column")
        except Exception as e:
            print(f"  Note: daily_cold_emails might already exist: {e}")

        conn.commit()

    print("Onboarding fields migration completed!")


if __name__ == "__main__":
    run_migration()
