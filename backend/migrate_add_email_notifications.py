#!/usr/bin/env python3
"""
Migration: Add email_notifications_enabled boolean column to users table.

Defaults to true — all existing and new users receive job completion emails
unless they explicitly opt out via settings.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running email_notifications_enabled migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT true"
            ))
            print("  Added users.email_notifications_enabled column")
        except Exception as e:
            print(f"  email_notifications_enabled: {e}")

        conn.commit()

    print("email_notifications_enabled migration complete.")
