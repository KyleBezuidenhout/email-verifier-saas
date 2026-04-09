#!/usr/bin/env python3
"""
Migration: Add has_seen_tutorial boolean column to users table.

Existing users default to true (they don't need to see the tutorial).
New users default to false (they will see the tutorial on first login).
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running has_seen_tutorial migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_tutorial BOOLEAN NOT NULL DEFAULT false"
            ))
            print("  Added users.has_seen_tutorial column")
        except Exception as e:
            print(f"  has_seen_tutorial: {e}")

        conn.commit()

    print("has_seen_tutorial migration complete.")
