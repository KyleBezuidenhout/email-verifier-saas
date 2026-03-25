#!/usr/bin/env python3
"""
Migration script to create queue_depth_snapshots table.
Stores periodic snapshots of Redis queue state for analytics trend lines.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running queue_depth_snapshots migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS queue_depth_snapshots (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    active_jobs INT NOT NULL DEFAULT 0,
                    queued_jobs INT NOT NULL DEFAULT 0,
                    waiting_room_jobs INT NOT NULL DEFAULT 0,
                    vayne_queued INT NOT NULL DEFAULT 0,
                    catchall_queued INT NOT NULL DEFAULT 0
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_qds_snapshot_at
                ON queue_depth_snapshots(snapshot_at)
            """))
            print("Created queue_depth_snapshots table")
        except Exception as e:
            print(f"Note: Table might already exist: {e}")

        conn.commit()

    print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
