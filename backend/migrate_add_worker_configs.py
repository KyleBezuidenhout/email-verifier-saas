#!/usr/bin/env python3
"""
Migration: Add worker_configs table for dedicated worker routing

This table stores per-client configuration for routing jobs to dedicated workers.
Each client can have their own verification queue, enabling isolated processing
with their own API keys and capacity.

Usage:
    python migrate_add_worker_configs.py
"""

import os
import sys
from sqlalchemy import create_engine, text

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings


def run_migration():
    """Create worker_configs table for dedicated worker routing."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'worker_configs'
            );
        """))
        exists = result.scalar()
        
        if exists:
            print("✅ Table 'worker_configs' already exists, skipping migration")
            return
        
        print("🔄 Creating 'worker_configs' table...")
        
        # Create the worker_configs table
        conn.execute(text("""
            CREATE TABLE worker_configs (
                id SERIAL PRIMARY KEY,
                user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                worker_mode VARCHAR(20) DEFAULT 'dedicated' NOT NULL,
                verification_queue VARCHAR(255) NOT NULL,
                enrichment_queue VARCHAR(255),
                api_key_hint VARCHAR(50),
                notes TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """))
        
        # Create index on user_id for fast lookups
        conn.execute(text("""
            CREATE INDEX idx_worker_configs_user_id ON worker_configs(user_id);
        """))
        
        # Create index on verification_queue for debugging/monitoring
        conn.execute(text("""
            CREATE INDEX idx_worker_configs_verification_queue ON worker_configs(verification_queue);
        """))
        
        conn.commit()
        print("✅ Successfully created 'worker_configs' table")
        print("   - user_id: UUID reference to users table")
        print("   - worker_mode: 'dedicated' or 'shared'")
        print("   - verification_queue: Client's dedicated queue name")
        print("   - enrichment_queue: Optional custom enrichment queue")
        print("   - api_key_hint: Last 4 chars of API key for display")
        print("   - notes: Admin notes about the client setup")
        print("   - is_active: Whether the dedicated setup is active")


def rollback_migration():
    """Drop the worker_configs table (for rollback)."""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        print("🔄 Rolling back: Dropping 'worker_configs' table...")
        conn.execute(text("DROP TABLE IF EXISTS worker_configs CASCADE;"))
        conn.commit()
        print("✅ Rolled back successfully")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--rollback":
        rollback_migration()
    else:
        run_migration()

