"""Add failure_reason column to vayne_orders table."""
from sqlalchemy import create_engine, text
from app.core.config import settings

def run_migration():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'vayne_orders' AND column_name = 'failure_reason'"
        ))
        if result.fetchone() is None:
            conn.execute(text("ALTER TABLE vayne_orders ADD COLUMN failure_reason TEXT"))
            conn.commit()
            print("✓ Added failure_reason column to vayne_orders")
        else:
            print("✓ failure_reason column already exists")

if __name__ == "__main__":
    run_migration()
