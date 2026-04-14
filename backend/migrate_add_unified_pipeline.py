"""Add enrichment_job_id and auto_enrich columns to vayne_orders for unified scrape-to-enrich pipeline."""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE vayne_orders ADD COLUMN IF NOT EXISTS enrichment_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL"
        ))
        conn.execute(text(
            "ALTER TABLE vayne_orders ADD COLUMN IF NOT EXISTS auto_enrich BOOLEAN DEFAULT false"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_vayne_orders_enrichment_job_id ON vayne_orders(enrichment_job_id)"
        ))
        conn.commit()


if __name__ == "__main__":
    run_migration()
    print("Migration complete: added enrichment_job_id and auto_enrich to vayne_orders")
