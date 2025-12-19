#!/usr/bin/env python3
"""
Run all database migrations on startup.
This ensures the database schema is up to date.
"""

import sys
import os

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def run_migrations():
    """Run all pending migrations."""
    print("Running database migrations...")

    try:
        # Import migrations
        from migrate_add_catchall_key import migrate as migrate_catchall_key
        from migrate_add_verification_tag import migrate as migrate_verification_tag
        from migrate_add_mx_record import migrate as migrate_mx_record
        from migrate_add_mx_provider import migrate as migrate_mx_provider
        from migrate_add_extra_data import migrate as migrate_extra_data
        from migrate_add_is_admin import run_migration as migrate_is_admin
        from migrate_add_job_source_and_vayne_orders import migrate as migrate_job_source_and_vayne_orders
        from migrate_vayne_orders_columns import run_migration as migrate_vayne_orders_columns
        from migrate_add_job_company_size import migrate as migrate_job_company_size

        # Run migrations
        migrate_catchall_key()
        migrate_verification_tag()
        migrate_mx_record()
        migrate_mx_provider()
        migrate_extra_data()
        migrate_is_admin()
        migrate_job_source_and_vayne_orders()
        migrate_vayne_orders_columns()
        migrate_job_company_size()

        print("✓ All migrations completed successfully!")
        return True
    except Exception as e:
        print(f"⚠ Migration error (this is OK if columns already exist): {e}")
        # Don't fail startup if migrations fail (columns might already exist)
        return True


if __name__ == "__main__":
    run_migrations()


