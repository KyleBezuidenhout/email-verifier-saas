#!/usr/bin/env python3
"""
Migration to add OAuth columns (oauth_provider, oauth_provider_id) and
make hashed_password nullable for OAuth-only users.
"""

from sqlalchemy import create_engine, text
from app.core.config import settings


def run_migration():
    print("Running OAuth columns migration...")

    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)
            """))
            print("  Added oauth_provider column")
        except Exception as e:
            print(f"  Note: oauth_provider might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255)
            """))
            print("  Added oauth_provider_id column")
        except Exception as e:
            print(f"  Note: oauth_provider_id might already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE users
                ALTER COLUMN hashed_password DROP NOT NULL
            """))
            print("  Made hashed_password nullable")
        except Exception as e:
            print(f"  Note: hashed_password nullable change: {e}")

        conn.commit()

    print("OAuth columns migration completed!")


if __name__ == "__main__":
    run_migration()
