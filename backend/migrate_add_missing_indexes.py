#!/usr/bin/env python3
"""
Migration to add missing composite indexes identified by performance audit.
These indexes cover the most frequent query patterns across all endpoint files.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running missing indexes migration...")

    engine = create_engine(settings.DATABASE_URL)

    indexes = [
        ("idx_leads_job_final", "leads", "(job_id, is_final_result)"),
        ("idx_leads_job_verification", "leads", "(job_id, verification_status)"),
        ("idx_leads_enrichment_cache", "leads", "(enrichment_key, is_final_result, created_at DESC)"),
        ("idx_leads_domain_catchall", "leads", "(domain, verification_status, is_final_result)"),
        ("idx_leads_job_prevalence", "leads", "(job_id, prevalence_score DESC NULLS LAST)"),
        ("idx_jobs_user_created", "jobs", "(user_id, created_at DESC)"),
        ("idx_jobs_status_created", "jobs", "(status, created_at)"),
        ("idx_users_created_at", "users", "(created_at DESC)"),
        ("idx_vayne_orders_status_created", "vayne_orders", "(status, created_at)"),
        ("idx_wsj_user_status_created", "website_scraper_jobs", "(user_id, status, created_at DESC)"),
        ("idx_lso_user_status_created", "local_scraper_orders", "(user_id, status, created_at DESC)"),
    ]

    with engine.connect() as conn:
        for idx_name, table, columns in indexes:
            try:
                conn.execute(text(
                    f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} {columns}"
                ))
                print(f"  Created {idx_name} on {table}")
            except Exception as e:
                print(f"  Note ({idx_name}): {e}")

        conn.commit()

    print("Missing indexes migration completed!")


if __name__ == "__main__":
    run_migration()
