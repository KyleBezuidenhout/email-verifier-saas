"""
Migration: add `source` column to jobs table and create `vayne_orders` table.
Idempotent: safe to run multiple times.
"""
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DATABASE_URL = os.getenv("DATABASE_URL")


def migrate():
    if not DATABASE_URL:
        print("⚠ DATABASE_URL not set, skipping migrate_add_job_source_and_vayne_orders")
        return

    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    # Add source column to jobs
    try:
        cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR(50);")
        print("✓ Added source column to jobs (if not existed)")
    except Exception as e:
        print(f"⚠ Could not add source column to jobs: {e}")

    # Create vayne_orders table
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vayne_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                vayne_order_id VARCHAR(255) UNIQUE NOT NULL,
                status VARCHAR(50),
                url TEXT,
                export_format VARCHAR(20),
                qualified_leads_only BOOLEAN DEFAULT FALSE,
                estimated_leads INTEGER,
                leads_found INTEGER,
                leads_qualified INTEGER,
                progress_percentage INTEGER,
                credits_charged INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            );
            """
        )
        # Indexes for status and user_id
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vayne_orders_user_id ON vayne_orders(user_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vayne_orders_status ON vayne_orders(status);")
        print("✓ Created vayne_orders table (if not existed)")
    except Exception as e:
        print(f"⚠ Could not create vayne_orders table: {e}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    migrate()


