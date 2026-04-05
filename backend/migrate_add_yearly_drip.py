#!/usr/bin/env python3
"""
Migration: Add yearly credit drip tracking columns to users table.

- users.yearly_credits_start (TIMESTAMPTZ) — when the yearly subscription began
- users.yearly_credits_granted (INTEGER, default 0) — how many monthly drips issued (0–12)
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running yearly credit drip migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS yearly_credits_start TIMESTAMPTZ"
            ))
            print("  Added users.yearly_credits_start column")
        except Exception as e:
            print(f"  yearly_credits_start: {e}")

        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS yearly_credits_granted INTEGER NOT NULL DEFAULT 0"
            ))
            print("  Added users.yearly_credits_granted column")
        except Exception as e:
            print(f"  yearly_credits_granted: {e}")

        conn.commit()

    print("Yearly credit drip migration complete.")
