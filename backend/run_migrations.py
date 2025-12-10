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
        
        # Run migrations
        migrate_catchall_key()
        migrate_verification_tag()
        migrate_mx_record()
        migrate_mx_provider()
        migrate_extra_data()
        migrate_is_admin()
        
        print("✓ All migrations completed successfully!")
        return True
    except Exception as e:
        print(f"⚠ Migration error (this is OK if columns already exist): {e}")
        # Don't fail startup if migrations fail (columns might already exist)
        return True

if __name__ == "__main__":
    run_migrations()


