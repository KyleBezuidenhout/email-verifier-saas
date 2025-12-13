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
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_path)

# Log startup before imports to help debug
print(f"Python path: {sys.path}", flush=True)
print(f"Backend path: {backend_path}", flush=True)
print(f"Current directory: {os.getcwd()}", flush=True)

try:
    from app.core.config import settings
    from app.services.vayne_client import get_vayne_client
    from app.models.vayne_order import VayneOrder
    print("✓ Successfully imported app modules", flush=True)
except ImportError as e:
    print(f"❌ Import error: {e}", flush=True)
    print(f"Looking for app in: {backend_path}", flush=True)
    if os.path.exists(backend_path):
        print(f"Backend directory exists: {os.listdir(backend_path)}", flush=True)
    raise

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
    print(f"[{timestamp}] {prefix} {message}", flush=True)


def get_active_order(db):
    """
    Get the oldest active order that has been sent to Vayne.
    Only checks orders with vayne_order_id IS NOT NULL and status IN ('pending', 'initialization').
    Both 'pending' and 'initialization' mean order was created with Vayne but not yet completed.
    These are the two possible responses from Vayne's order creation API.
    """
    result = db.execute(
        text("""
            SELECT * FROM vayne_orders 
            WHERE vayne_order_id IS NOT NULL 
            AND status IN ('pending', 'initialization')
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
    # active_order.id is our internal UUID - PostgreSQL may return it as UUID object or string
    if isinstance(active_order.id, UUID):
        order_id = active_order.id  # Already a UUID, use it directly
    else:
        order_id = UUID(str(active_order.id))  # Convert string to UUID
    
    vayne_order_id = active_order.vayne_order_id  # This is Vayne's ID (string)
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
        
        # Status is still initialization (not completed yet), wait and check again
        # n8n workflow will update status to "completed" when done
        log(f"Active order {order_id} status: {status}, waiting {ACTIVE_CHECK_INTERVAL}s...", "wait")
        await asyncio.sleep(ACTIVE_CHECK_INTERVAL)


async def process_queued_order(order_row):
    """
    Process a queued order:
    1. Update cookie with Vayne
    2. Create Vayne order
    3. Update database with vayne_order_id and status
    """
    # order_row.id is our internal UUID - PostgreSQL may return it as UUID object or string
    if isinstance(order_row.id, UUID):
        order_id = order_row.id  # Already a UUID, use it directly
    else:
        order_id = UUID(str(order_row.id))  # Convert string to UUID
    
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
            
            # Extract scraping_status from Vayne's create_order response
            # Vayne may return "initialization" or "pending" status when order is first created
            scraping_status = vayne_order.get("scraping_status", "initialization")
            
            # Map Vayne's scraping_status to our database status
            # Vayne can return "initialization" or "pending" - both mean order is processing
            if scraping_status == "initialization" or scraping_status == "pending":
                db_status = scraping_status  # Use the status Vayne returned
            else:
                db_status = "initialization"  # Default fallback
            
            # n8n workflow will update it to "completed" when done
            # DO NOT poll Vayne API for status updates - let n8n handle it
            
            # Update database with vayne_order_id and set status to initialization
            update_order_status(
                db,
                order_id,
                status=db_status,
                vayne_order_id=vayne_order_id_str,
                name=order_name
            )
            
            log(f"Order {order_id} successfully sent to Vayne (Vayne ID: {vayne_order_id_str}, Status: {db_status})", "success")
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
    try:
        # Force stdout to be unbuffered for Railway logs
        import sys
        sys.stdout.reconfigure(line_buffering=True)
        
        log("Initializing Vayne Queue Worker...", "info")
        asyncio.run(main())
    except Exception as e:
        print(f"FATAL ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
