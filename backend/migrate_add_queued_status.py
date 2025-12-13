#!/usr/bin/env python3
"""
Migration: Update vayne_orders table for FIFO queue system
- Ensure vayne_order_id can be NULL (for queued orders)
- Update default status to 'queued'
- Ensure status column supports 'queued' status
"""

from app.db.session import SessionLocal
from sqlalchemy import text


def migrate():
    """Update vayne_orders table to support queued status and NULL vayne_order_id."""
    db = SessionLocal()
    try:
        # Check if table exists
        result = db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name='vayne_orders'
        """))
        
        if not result.fetchone():
            print("⚠ vayne_orders table does not exist, skipping migration")
            return
        
        # Check if vayne_order_id column allows NULL
        result = db.execute(text("""
            SELECT is_nullable 
            FROM information_schema.columns 
            WHERE table_name='vayne_orders' 
            AND column_name='vayne_order_id'
        """))
        
        row = result.fetchone()
        if row and row.is_nullable == 'NO':
            # Make vayne_order_id nullable
            print("Making vayne_order_id nullable...")
            db.execute(text("""
                ALTER TABLE vayne_orders 
                ALTER COLUMN vayne_order_id DROP NOT NULL
            """))
            db.commit()
            print("✓ vayne_order_id is now nullable")
        else:
            print("✓ vayne_order_id already allows NULL")
        
        # Check current default status
        result = db.execute(text("""
            SELECT column_default 
            FROM information_schema.columns 
            WHERE table_name='vayne_orders' 
            AND column_name='status'
        """))
        
        row = result.fetchone()
        current_default = row.column_default if row else None
        
        # Update default to 'queued' if it's not already
        if current_default != "'queued'::character varying":
            print("Updating default status to 'queued'...")
            db.execute(text("""
                ALTER TABLE vayne_orders 
                ALTER COLUMN status SET DEFAULT 'queued'
            """))
            db.commit()
            print("✓ Default status updated to 'queued'")
        else:
            print("✓ Default status is already 'queued'")
        
        print("✓ Migration completed successfully")
        
    except Exception as e:
        db.rollback()
        print(f"⚠ Error during migration (this is OK if changes already applied): {e}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()

