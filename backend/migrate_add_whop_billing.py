#!/usr/bin/env python3
"""
Migration: Add Whop billing columns to users table and create payment_logs table.

- users.whop_membership_id (VARCHAR 255, unique)
- users.whop_user_id (VARCHAR 255)
- users.subscription_status (VARCHAR 30, default 'none', NOT NULL)
- users.billing_period_end (TIMESTAMPTZ)
- users.manage_url (VARCHAR 500)
- users.billing_interval (VARCHAR 10, default 'monthly', NOT NULL)
- payment_logs table with composite index
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running Whop billing migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # --- users table: add whop/billing columns ---
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS whop_membership_id VARCHAR(255) UNIQUE"
            ))
            print("  Added users.whop_membership_id column")
        except Exception as e:
            print(f"  Note: users.whop_membership_id: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS whop_user_id VARCHAR(255)"
            ))
            print("  Added users.whop_user_id column")
        except Exception as e:
            print(f"  Note: users.whop_user_id: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'none' NOT NULL"
            ))
            print("  Added users.subscription_status column")
        except Exception as e:
            print(f"  Note: users.subscription_status: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ"
            ))
            print("  Added users.billing_period_end column")
        except Exception as e:
            print(f"  Note: users.billing_period_end: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS manage_url VARCHAR(500)"
            ))
            print("  Added users.manage_url column")
        except Exception as e:
            print(f"  Note: users.manage_url: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(10) DEFAULT 'monthly' NOT NULL"
            ))
            print("  Added users.billing_interval column")
        except Exception as e:
            print(f"  Note: users.billing_interval: {e}")

        # --- payment_logs table ---
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS payment_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    whop_payment_id VARCHAR(255) UNIQUE NOT NULL,
                    event_type VARCHAR(50) NOT NULL,
                    amount_dollars NUMERIC(10, 2) NOT NULL,
                    credits_delta NUMERIC(12, 1) NOT NULL,
                    old_balance NUMERIC(12, 1) NOT NULL,
                    new_balance NUMERIC(12, 1) NOT NULL,
                    plan_name VARCHAR(20),
                    whop_membership_id VARCHAR(255),
                    metadata_json JSONB,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """))
            print("  Created payment_logs table")
        except Exception as e:
            print(f"  Note: payment_logs table: {e}")

        try:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_payment_logs_user_created "
                "ON payment_logs (user_id, created_at DESC)"
            ))
            print("  Created ix_payment_logs_user_created index")
        except Exception as e:
            print(f"  Note: ix_payment_logs_user_created index: {e}")

        conn.commit()

    print("Whop billing migration completed!")


if __name__ == "__main__":
    run_migration()
