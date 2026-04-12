#!/usr/bin/env python3
"""
Migration: Add onboarding v2 columns to users table.

New columns: job_role, company_size, onboarding_goals, onboarding_completed.
Existing users get onboarding_completed = true so they skip the new flow.
New users default to false.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running onboarding v2 migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_role VARCHAR(100)"
            ))
            print("  Added users.job_role column")
        except Exception as e:
            print(f"  job_role: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_size VARCHAR(50)"
            ))
            print("  Added users.company_size column")
        except Exception as e:
            print(f"  company_size: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_goals TEXT"
            ))
            print("  Added users.onboarding_goals column")
        except Exception as e:
            print(f"  onboarding_goals: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT true"
            ))
            print("  Added users.onboarding_completed column (default true for existing rows)")
        except Exception as e:
            print(f"  onboarding_completed: {e}")

        conn.commit()

    print("Onboarding v2 migration complete.")
