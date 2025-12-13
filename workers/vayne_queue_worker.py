#!/usr/bin/env python3
"""
Vayne Queue Worker

Background worker that processes queued Vayne orders sequentially:
- Monitors queued orders in database
- Checks for active orders (with vayne_order_id) that are processing
- Waits for active orders to complete before processing next queued order
- Ensures only one order processes at a time to prevent cookie conflicts
"""

import asyncio
import os
import sys
import time
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.services.vayne_client import get_vayne_client
from app.models.vayne_order import VayneOrder

# PostgreSQL connection
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Worker configuration
QUEUE_POLL_INTERVAL = settings.VAYNE_QUEUE_WORKER_POLL_INTERVAL  # 30 seconds
ACTIVE_CHECK_INTERVAL = settings.VAYNE_QUEUE_WORKER_ACTIVE_CHECK_INTERVAL  # 60 seconds


def log(message: str, level: str = "info"):
    """Log a message with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = "✅" if level == "success" else "❌" if level == "error" else "⏳" if level == "wait" else "ℹ️"
    print(f"[{timestamp}] {prefix} {message}")


def get_active_order(db):
    """
    Get the oldest active order that has been sent to Vayne.
    Only checks orders with vayne_order_id IS NOT NULL to exclude old test orders.
    """
    result = db.execute(
        text("""
            SELECT * FROM vayne_orders 
            WHERE vayne_order_id IS NOT NULL 
            AND status IN ('pending', 'processing')
            ORDER BY created_at ASC 
            LIMIT 1
        """)
    )
    return result.fetchone()


def get_queued_order(db):
    """Get the oldest queued order."""
    result = db.execute(
        text("""
            SELECT * FROM vayne_orders 
            WHERE status = 'queued'
            ORDER BY created_at ASC 
            LIMIT 1
        """)
    )
    return result.fetchone()


def check_order_status(db, order_id: UUID) -> Optional[str]:
    """Check the status of an order by its own id (UUID)."""
    result = db.execute(
        text("""
            SELECT status FROM vayne_orders 
            WHERE id = :order_id
        """),
        {"order_id": str(order_id)}
    )
    row = result.fetchone()
    return row.status if row else None


def update_order_status(
    db,
    order_id: UUID,
    status: Optional[str] = None,
    vayne_order_id: Optional[str] = None,
    name: Optional[str] = None
):
    """Update order status and vayne_order_id in database."""
    try:
        update_params = {}
        if status:
            update_params["status"] = status
        if vayne_order_id:
            update_params["vayne_order_id"] = vayne_order_id
        if name:
            update_params["name"] = name
        
        if not update_params:
            return True
        
        set_clause = ", ".join([f"{k} = :{k}" for k in update_params.keys()])
        
        result = db.execute(
            text(f"""
                UPDATE vayne_orders
                SET {set_clause}
                WHERE id = :order_id
            """),
            {"order_id": str(order_id), **update_params}
        )
        db.commit()
        return result.rowcount > 0
    except Exception as e:
        db.rollback()
        log(f"Failed to update order {order_id} status: {e}", "error")
        raise


def mark_order_failed(db, order_id: UUID, error_reason: str):
    """Mark an order as failed."""
    try:
        result = db.execute(
            text("""
                UPDATE vayne_orders
                SET status = 'failed'
                WHERE id = :order_id
            """),
            {"order_id": str(order_id)}
        )
        db.commit()
        log(f"Order {order_id} marked as failed: {error_reason}", "error")
        return result.rowcount > 0
    except Exception as e:
        db.rollback()
        log(f"Failed to mark order {order_id} as failed: {e}", "error")
        raise


async def wait_for_active_order_completion(db, active_order):
    """
    Wait for an active order to complete by polling its status.
    Uses the order's own id (UUID) for tracking, not vayne_order_id.
    Returns True when order is completed, False if it fails.
    """
    order_id = UUID(active_order.id)
    vayne_order_id = active_order.vayne_order_id
    log(f"Waiting for active order {order_id} (Vayne ID: {vayne_order_id}) to complete...", "wait")
    
    while True:
        status = check_order_status(db, order_id)  # Use order's own id
        
        if status == "completed":
            log(f"Active order {order_id} completed, proceeding to next queued order", "success")
            return True
        elif status == "failed":
            log(f"Active order {order_id} failed, proceeding to next queued order", "error")
            return True  # Treat failed as "done" so we can process next order
        elif status is None:
            log(f"Active order {order_id} not found in database, proceeding", "wait")
            return True  # Order doesn't exist, proceed
        
        # Status is still pending or processing, wait and check again
        log(f"Active order {order_id} status: {status}, waiting {ACTIVE_CHECK_INTERVAL}s...", "wait")
        await asyncio.sleep(ACTIVE_CHECK_INTERVAL)


async def process_queued_order(order_row):
    """
    Process a queued order:
    1. Update cookie with Vayne
    2. Create Vayne order
    3. Update database with vayne_order_id and status
    """
    order_id = UUID(order_row.id)
    db = SessionLocal()
    
    try:
        log(f"Processing queued order {order_id}", "info")
        
        vayne_client = get_vayne_client()
        
        # Step 1: Update LinkedIn session cookie with Vayne
        try:
            log(f"Updating LinkedIn cookie for order {order_id}", "info")
            cookie_response = await vayne_client.update_authentication(order_row.linkedin_cookie)
            log(f"LinkedIn authentication updated for order {order_id}", "success")
        except Exception as auth_error:
            error_msg = str(auth_error).lower()
            if "401" in error_msg or "unauthorized" in error_msg or "invalid" in error_msg or "expired" in error_msg:
                log(f"LinkedIn cookie authentication failed for order {order_id}: {auth_error}", "error")
                mark_order_failed(db, order_id, f"LinkedIn cookie invalid or expired: {auth_error}")
                return False
            log(f"Failed to update cookie for order {order_id}: {auth_error}", "error")
            mark_order_failed(db, order_id, f"Cookie update failed: {auth_error}")
            return False
        
        # Step 2: Create the scraping order with Vayne API
        try:
            log(f"Creating Vayne order for order {order_id}", "info")
            vayne_order = await vayne_client.create_order(
                sales_nav_url=order_row.sales_nav_url,
                linkedin_cookie=order_row.linkedin_cookie
            )
            
            # Extract vayne_order_id from Vayne's response
            vayne_order_id = vayne_order.get("id")
            if not vayne_order_id:
                log(f"Vayne order creation returned no order_id for order {order_id}", "error")
                mark_order_failed(db, order_id, "Vayne order creation failed: no order_id returned")
                return False
            
            vayne_order_id_str = str(vayne_order_id)
            order_name = vayne_order.get("name")
            
            # Update database with vayne_order_id and set status to processing
            update_order_status(
                db,
                order_id,
                status="processing",
                vayne_order_id=vayne_order_id_str,
                name=order_name
            )
            
            log(f"Order {order_id} successfully sent to Vayne (Vayne ID: {vayne_order_id_str})", "success")
            return True
            
        except Exception as e:
            log(f"Failed to create Vayne order for order {order_id}: {e}", "error")
            mark_order_failed(db, order_id, f"Vayne order creation failed: {e}")
            return False
        
    except Exception as e:
        log(f"Error processing queued order {order_id}: {e}", "error")
        mark_order_failed(db, order_id, f"Processing error: {e}")
        return False
    finally:
        db.close()


async def main():
    """Main worker loop - monitors queue and processes orders sequentially."""
    log("Vayne Queue Worker starting...", "info")
    log(f"Queue poll interval: {QUEUE_POLL_INTERVAL}s", "info")
    log(f"Active order check interval: {ACTIVE_CHECK_INTERVAL}s", "info")
    
    while True:
        try:
            db = SessionLocal()
            
            try:
                # Check for active orders (orders that have been sent to Vayne)
                active_order = get_active_order(db)
                
                if active_order:
                    # Wait for active order to complete
                    await wait_for_active_order_completion(db, active_order)
                    # After active order completes, check for queued orders in next iteration
                    await asyncio.sleep(QUEUE_POLL_INTERVAL)
                    continue
                
                # No active orders, check for queued orders
                queued_order = get_queued_order(db)
                
                if queued_order:
                    log(f"Found queued order {queued_order.id}, processing...", "info")
                    await process_queued_order(queued_order)
                    # After processing, wait before checking again
                    await asyncio.sleep(QUEUE_POLL_INTERVAL)
                else:
                    # No queued orders, wait before checking again
                    await asyncio.sleep(QUEUE_POLL_INTERVAL)
                    
            finally:
                db.close()
                
        except KeyboardInterrupt:
            log("Worker shutting down...", "info")
            break
        except Exception as e:
            log(f"Error in main loop: {e}", "error")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(5)  # Wait before retrying


if __name__ == "__main__":
    asyncio.run(main())
