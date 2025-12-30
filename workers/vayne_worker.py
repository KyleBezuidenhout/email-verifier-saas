#!/usr/bin/env python3
"""
Vayne Order Processing Worker

Background worker that processes Sales Navigator scraping orders:
- Listens to Redis queue for new orders
- Polls Vayne API for order status updates
- Handles export when scraping finishes
- Stores CSV in R2 and updates database

Implements Steps 4-7 from test_end_to_end_scraping_workflow.py:
- Step 4: Poll order status until completion
- Step 5: Check exports auto-trigger
- Step 6: Trigger export endpoint
- Step 7: Download and store CSV
"""

import asyncio
import os
import sys
import time
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

import redis
import httpx
import boto3
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.services.vayne_client import get_vayne_client
from app.models.vayne_order import VayneOrder

# Redis connection
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# PostgreSQL connection
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Worker configuration
POLL_INTERVAL = settings.VAYNE_WORKER_POLL_INTERVAL
MAX_WAIT_MINUTES = settings.VAYNE_WORKER_MAX_WAIT_MINUTES
MAX_RETRIES = settings.VAYNE_WORKER_MAX_RETRIES
BACKOFF_FACTOR = settings.VAYNE_WORKER_BACKOFF_FACTOR

QUEUE_NAME = "vayne-order-processing"


def log(message: str, level: str = "info"):
    """Log a message with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = "✅" if level == "success" else "❌" if level == "error" else "⏳" if level == "wait" else "ℹ️"
    print(f"[{timestamp}] {prefix} {message}")


async def poll_vayne_status(vayne_order_id: str) -> Dict[str, Any]:
    """
    Step 4: Poll Vayne API for order status updates.
    Matches step4_poll_order_status() from test file.
    """
    vayne_client = get_vayne_client()
    try:
        vayne_order = await vayne_client.get_order(vayne_order_id)
        return vayne_order
    except Exception as e:
        log(f"Failed to poll Vayne status for order {vayne_order_id}: {e}", "error")
        raise


async def check_exports_auto_trigger(vayne_order_id: str) -> Dict[str, Any]:
    """
    Step 5: Check if exports are available via GET order endpoint.
    Matches step5_test_export_auto_trigger() from test file.
    """
    vayne_client = get_vayne_client()
    try:
        vayne_order = await vayne_client.get_order(vayne_order_id)
        exports = vayne_order.get("exports", {})
        return exports
    except Exception as e:
        log(f"Failed to check exports for order {vayne_order_id}: {e}", "error")
        raise


async def trigger_export(vayne_order_id: str, export_format: str = "advanced") -> Dict[str, Any]:
    """
    Step 6: Trigger export via POST export endpoint and extract export info.
    Matches step6_test_export_endpoint() from test file.
    Uses _extract_exports_info() to get both simple and advanced (prioritizes simple).
    """
    vayne_client = get_vayne_client()
    try:
        # First get order to check exports
        vayne_order = await vayne_client.get_order(vayne_order_id)
        
        # Extract exports info (prioritizes simple)
        # Note: get_order returns the order dict directly, but we need the full response with exports
        # So we'll call _request directly to get the full response
        order_response = await vayne_client._request("GET", f"/api/orders/{vayne_order_id}")
        order_data = order_response.get("order", {})
        
        # Extract exports info (prioritizes simple)
        exports_info = await vayne_client._extract_exports_info(order_data)
        simple = exports_info.get("simple", {})
        advanced = exports_info.get("advanced", {})
        preferred = exports_info.get("preferred", {})
        
        # If preferred format is ready, use it
        if preferred.get("status") == "completed" and preferred.get("file_url"):
            log(f"Export ready in preferred format for order {vayne_order_id}")
            return exports_info
        
        # Otherwise, trigger export for requested format
        response = await vayne_client._request(
            "POST",
            f"/api/orders/{vayne_order_id}/export",
            data={"export_format": export_format}
        )
        
        # Re-extract exports info after triggering
        order_export = response.get("order", {})
        exports_info_after = await vayne_client._extract_exports_info(order_export)
        
        return exports_info_after
    except Exception as e:
        log(f"Failed to trigger export for order {vayne_order_id}: {e}", "error")
        raise


async def store_export_csv(order_id: UUID, vayne_order_id: str, export_format: str = "advanced") -> str:
    """
    Step 7: Download CSV from Vayne and store in R2.
    Matches step7_verify_export_persistence() from test file.
    """
    vayne_client = get_vayne_client()
    
    try:
        # Export CSV from Vayne (uses _extract_exports_info internally, prioritizes simple)
        csv_data = await vayne_client.export_order(vayne_order_id, export_format)
        
        # Store CSV in R2
        csv_file_path = f"vayne-orders/{order_id}/export.csv"
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path,
            Body=csv_data,
            ContentType="text/csv"
        )
        
        log(f"Stored CSV for order {order_id} in R2: {csv_file_path}", "success")
        return csv_file_path
    except Exception as e:
        log(f"Failed to store CSV for order {order_id}: {e}", "error")
        raise


def update_order_status(
    db: Any,
    order_id: UUID,
    status: Optional[str] = None,
    scraping_status: Optional[str] = None,
    progress_percentage: Optional[int] = None,
    leads_found: Optional[int] = None,
    leads_qualified: Optional[int] = None,
    csv_file_path: Optional[str] = None,
    completed_at: Optional[datetime] = None
):
    """Update order status in database."""
    try:
        result = db.execute(
            text("""
                UPDATE vayne_orders
                SET 
                    status = COALESCE(:status, status),
                    progress_percentage = COALESCE(:progress_percentage, progress_percentage),
                    leads_found = COALESCE(:leads_found, leads_found),
                    leads_qualified = COALESCE(:leads_qualified, leads_qualified),
                    csv_file_path = COALESCE(:csv_file_path, csv_file_path),
                    completed_at = COALESCE(:completed_at, completed_at)
                WHERE id = :order_id
            """),
            {
                "order_id": str(order_id),
                "status": status,
                "progress_percentage": progress_percentage,
                "leads_found": leads_found,
                "leads_qualified": leads_qualified,
                "csv_file_path": csv_file_path,
                "completed_at": completed_at
            }
        )
        db.commit()
        return result.rowcount > 0
    except Exception as e:
        db.rollback()
        log(f"Failed to update order {order_id} status: {e}", "error")
        raise


async def process_order(order_id: str):
    """
    Main processing loop for an order.
    Implements Steps 4-7 from test_end_to_end_scraping_workflow.py.
    """
    order_uuid = UUID(order_id)
    db = SessionLocal()
    
    try:
        # Get order from database
        result = db.execute(
            text("SELECT * FROM vayne_orders WHERE id = :order_id"),
            {"order_id": str(order_uuid)}
        )
        order_row = result.fetchone()
        
        if not order_row:
            log(f"Order {order_id} not found in database", "error")
            return
        
        vayne_order_id = order_row.vayne_order_id
        if not vayne_order_id:
            log(f"Order {order_id} has no vayne_order_id yet, skipping", "wait")
            return
        
        export_format = order_row.export_format or "advanced"
        only_qualified = order_row.only_qualified or False
        
        log(f"Processing order {order_id} (Vayne ID: {vayne_order_id})", "info")
        
        # Step 4: Poll order status until completion
        start_time = time.time()
        max_wait_seconds = MAX_WAIT_MINUTES * 60
        last_status = None
        last_progress = None
        
        while True:
            elapsed = time.time() - start_time
            
            if elapsed > max_wait_seconds:
                log(f"Maximum wait time ({MAX_WAIT_MINUTES} minutes) exceeded for order {order_id}", "error")
                update_order_status(db, order_uuid, status="failed")
                return
            
            try:
                # Poll Vayne API for status
                vayne_order = await poll_vayne_status(vayne_order_id)
                scraping_status = vayne_order.get("scraping_status", "initialization")
                progress = vayne_order.get("progress_percentage", 0)
                leads_found = vayne_order.get("leads_found", 0)
                
                # Only log if status or progress changed
                if scraping_status != last_status or progress != last_progress:
                    log(
                        f"Order {order_id}: status={scraping_status}, progress={progress}%, leads={leads_found}, elapsed={int(elapsed)}s",
                        "info"
                    )
                    last_status = scraping_status
                    last_progress = progress
                
                # Update database with latest status
                db_status = "processing" if scraping_status in ["initialization", "scraping"] else scraping_status
                update_order_status(
                    db,
                    order_uuid,
                    status=db_status,
                    progress_percentage=progress,
                    leads_found=leads_found,
                    leads_qualified=leads_found if only_qualified else leads_found
                )
                
                # Check if scraping is finished
                if scraping_status == "finished":
                    log(f"Order {order_id} scraping finished, proceeding to export", "success")
                    break
                elif scraping_status == "failed":
                    log(f"Order {order_id} scraping failed", "error")
                    update_order_status(db, order_uuid, status="failed")
                    return
                
            except Exception as e:
                log(f"Error polling status for order {order_id}: {e}", "error")
                # Continue polling even on error (might be temporary)
            
            # Wait before next poll
            await asyncio.sleep(POLL_INTERVAL)
        
        # Step 5: Check exports auto-trigger
        try:
            exports = await check_exports_auto_trigger(vayne_order_id)
            if exports:
                log(f"Exports found for order {order_id}", "success")
        except Exception as e:
            log(f"Failed to check exports for order {order_id}: {e}", "error")
            # Continue anyway, will try to trigger export
        
        # Step 6: Trigger export
        retries = 0
        exports_info = None
        
        while retries < MAX_RETRIES:
            try:
                exports_info = await trigger_export(vayne_order_id, export_format)
                if exports_info:
                    preferred = exports_info.get("preferred", {})
                    if preferred.get("status") == "completed" and preferred.get("file_url"):
                        log(f"Export ready for order {order_id}", "success")
                        break
                retries += 1
                if retries < MAX_RETRIES:
                    wait_time = BACKOFF_FACTOR ** retries
                    log(f"Export not ready yet for order {order_id}, retrying in {wait_time}s...", "wait")
                    await asyncio.sleep(wait_time)
            except Exception as e:
                retries += 1
                if retries < MAX_RETRIES:
                    wait_time = BACKOFF_FACTOR ** retries
                    log(f"Export trigger failed for order {order_id}, retrying in {wait_time}s: {e}", "error")
                    await asyncio.sleep(wait_time)
                else:
                    log(f"Export trigger failed for order {order_id} after {MAX_RETRIES} retries: {e}", "error")
                    update_order_status(db, order_uuid, status="failed")
                    return
        
        if not exports_info:
            log(f"No exports available for order {order_id}", "error")
            update_order_status(db, order_uuid, status="failed")
            return
        
        # Step 7: Download and store CSV
        try:
            csv_file_path = await store_export_csv(order_uuid, vayne_order_id, export_format)
            
            # Update order with CSV path and mark as completed
            update_order_status(
                db,
                order_uuid,
                status="completed",
                csv_file_path=csv_file_path,
                completed_at=datetime.utcnow()
            )
            
            log(f"Order {order_id} processing completed successfully", "success")
            
            # Note: Enrichment is now a separate workflow - users must manually create enrichment jobs
            # from the completed scrape CSV file via the upload interface
            
        except Exception as e:
            log(f"Failed to store CSV for order {order_id}: {e}", "error")
            update_order_status(db, order_uuid, status="failed")
            return
        
    except Exception as e:
        log(f"Error processing order {order_id}: {e}", "error")
        update_order_status(db, order_uuid, status="failed")
    finally:
        db.close()


async def main():
    """Main worker loop - listens to Redis queue and processes orders."""
    log("Vayne Order Processing Worker starting...", "info")
    log(f"Queue: {QUEUE_NAME}", "info")
    log(f"Poll interval: {POLL_INTERVAL}s", "info")
    log(f"Max wait time: {MAX_WAIT_MINUTES} minutes", "info")
    
    while True:
        try:
            # Pop order ID from Redis queue (blocking, waits up to 5 seconds)
            order_id = redis_client.brpop(QUEUE_NAME, timeout=5)
            
            if order_id:
                # order_id is a tuple: (queue_name, order_id_value)
                order_id_value = order_id[1]
                log(f"Processing order from queue: {order_id_value}", "info")
                
                # Process order asynchronously
                await process_order(order_id_value)
            else:
                # No orders in queue, continue loop
                pass
                
        except KeyboardInterrupt:
            log("Worker shutting down...", "info")
            break
        except Exception as e:
            log(f"Error in main loop: {e}", "error")
            await asyncio.sleep(5)  # Wait before retrying


if __name__ == "__main__":
    asyncio.run(main())
