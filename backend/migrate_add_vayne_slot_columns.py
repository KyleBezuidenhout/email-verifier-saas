"""Add api_key_slot and last_heartbeat columns to vayne_orders for concurrent slot processing."""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE vayne_orders ADD COLUMN IF NOT EXISTS api_key_slot INTEGER"
        ))
        conn.execute(text(
            "ALTER TABLE vayne_orders ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ"
        ))
        conn.commit()


if __name__ == "__main__":
    run_migration()
    print("Migration complete: added api_key_slot and last_heartbeat to vayne_orders")
