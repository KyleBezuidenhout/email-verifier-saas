#!/usr/bin/env python3
"""
Migration: Add plan-based billing columns to users and jobs tables.

- users.plan (VARCHAR 20, default 'trial')
- users.custom_credit_price (NUMERIC 10,5, nullable)
- users.credits type change: INTEGER -> NUMERIC(12,1)
- jobs.plan_at_creation (VARCHAR 20, nullable)
- jobs.cost_in_credits type change: INTEGER -> NUMERIC(12,1)
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running plan-based billing migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # --- users table ---
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'trial' NOT NULL"
            ))
            print("  Added users.plan column")
        except Exception as e:
            print(f"  Note: users.plan: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_credit_price NUMERIC(10,5)"
            ))
            print("  Added users.custom_credit_price column")
        except Exception as e:
            print(f"  Note: users.custom_credit_price: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ALTER COLUMN credits TYPE NUMERIC(12,1)"
            ))
            print("  Changed users.credits to NUMERIC(12,1)")
        except Exception as e:
            print(f"  Note: users.credits type change: {e}")

        # --- jobs table ---
        try:
            conn.execute(text(
                "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS plan_at_creation VARCHAR(20)"
            ))
            print("  Added jobs.plan_at_creation column")
        except Exception as e:
            print(f"  Note: jobs.plan_at_creation: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE jobs ALTER COLUMN cost_in_credits TYPE NUMERIC(12,1)"
            ))
            print("  Changed jobs.cost_in_credits to NUMERIC(12,1)")
        except Exception as e:
            print(f"  Note: jobs.cost_in_credits type change: {e}")

        conn.commit()

    print("Plan-based billing migration completed!")


if __name__ == "__main__":
    run_migration()
