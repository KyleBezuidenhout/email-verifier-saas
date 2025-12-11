#!/usr/bin/env python3
"""
Migration: Create vayne_orders table
Stores Vayne API scraping orders
"""

from app.db.session import SessionLocal
from sqlalchemy import text


def migrate():
    """Create vayne_orders table if it doesn't exist."""
    db = SessionLocal()
    try:
        # Check if table already exists
        result = db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name='vayne_orders'
        """))
        
        if result.fetchone():
            print("✓ vayne_orders table already exists")
            return
        
        # Create vayne_orders table
        db.execute(text("""
            CREATE TABLE vayne_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                vayne_order_id VARCHAR(255) UNIQUE,
                status VARCHAR(50) DEFAULT 'pending',
                sales_nav_url TEXT NOT NULL,
                export_format VARCHAR(50) DEFAULT 'simple',
                only_qualified BOOLEAN DEFAULT FALSE,
                leads_found INTEGER,
                leads_qualified INTEGER,
                progress_percentage INTEGER DEFAULT 0,
                estimated_completion VARCHAR(255),
                linkedin_cookie TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP WITH TIME ZONE
            )
        """))
        
        # Create indexes
        db.execute(text("""
            CREATE INDEX idx_vayne_orders_user_id ON vayne_orders(user_id)
        """))
        
        db.execute(text("""
            CREATE INDEX idx_vayne_orders_status ON vayne_orders(status)
        """))
        
        db.execute(text("""
            CREATE INDEX idx_vayne_orders_created_at ON vayne_orders(created_at)
        """))
        
        db.execute(text("""
            CREATE INDEX idx_vayne_orders_vayne_order_id ON vayne_orders(vayne_order_id)
        """))
        
        db.commit()
        print("✓ Created vayne_orders table")
        print("✓ Created indexes on vayne_orders table")
    except Exception as e:
        db.rollback()
        print(f"⚠ Error creating vayne_orders table (this is OK if it already exists): {e}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()

