#!/usr/bin/env python3
"""
Migration to add performance indexes on vayne_orders table.
The (user_id, status, created_at) query was taking 7.7s without an index.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running vayne_orders index migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_vayne_orders_user_status_created
                ON vayne_orders(user_id, status, created_at)
            """))
            print("Created index idx_vayne_orders_user_status_created")
        except Exception as e:
            print(f"Note: Index might already exist: {e}")

        conn.commit()

    print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
