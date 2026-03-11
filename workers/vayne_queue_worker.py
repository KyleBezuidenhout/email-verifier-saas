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
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
    from app.models.job import Job
    from app.models.user import User
    import redis
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

# Redis connection (kept for potential future use)
redis_client = redis.from_url(settings.REDIS_URL)

# Worker configuration
QUEUE_POLL_INTERVAL = settings.VAYNE_QUEUE_WORKER_POLL_INTERVAL  # 30 seconds
ACTIVE_CHECK_INTERVAL = settings.VAYNE_QUEUE_WORKER_ACTIVE_CHECK_INTERVAL  # 60 seconds

# Gmail configuration for notifications
GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
APP_URL = os.getenv("APP_URL", "https://yourapp.com")


def log(message: str, level: str = "info"):
    """Log a message with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = "✅" if level == "success" else "❌" if level == "error" else "⏳" if level == "wait" else "ℹ️"
    print(f"[{timestamp}] {prefix} {message}", flush=True)


def send_scraping_completion_email(user_email: str, order_id: str, results: dict, targeting: str = None) -> bool:
    """Send email notification when a scraping job completes."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        log("Gmail credentials not configured - skipping email notification", "info")
        return False
    
    job_name = targeting or f"Order {order_id[:8]}"
    leads_found = results.get("leads_found", 0)
    
    subject = f"✅ Scraping complete: {leads_found} leads found"
    
    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 22px;">🎉 Your Scraping Job is Complete!</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #475569; font-size: 16px; margin-top: 0;">Great news! Your scraping job "<strong>{job_name}</strong>" has finished.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
          <h3 style="margin: 0 0 12px 0; color: #1e293b; font-size: 16px;">📊 Results Summary</h3>
          <p style="margin: 0; padding: 8px 0; color: #475569;">👥 Leads found: <strong>{leads_found}</strong></p>
        </div>
        
        <a href="{APP_URL}/sales-nav-scraper" 
           style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; 
                  font-weight: 600; font-size: 15px;">
          View & Download Leads →
        </a>
        
        <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; margin-bottom: 0;">
          Order ID: {order_id[:8]}...
        </p>
      </div>
    </div>
    """
    
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"Billion Verifier <{GMAIL_USER}>"
        msg['To'] = user_email
        
        msg.attach(MIMEText(html_content, 'html'))
        
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, user_email, msg.as_string())
        
        log(f"Sent scraping completion email to {user_email}", "success")
        return True
        
    except Exception as e:
        log(f"Failed to send email: {e}", "error")
        return False


def get_active_order(db):
    """
    Get the oldest active order that has been sent to Vayne.
    Only checks orders with vayne_order_id IS NOT NULL and status indicating active processing.
    'pending', 'initialization', 'scraping', and 'segmenting' mean order was created with Vayne but not yet completed.
    These are the possible responses from Vayne's order creation API and status updates.
    
    Orders with these statuses are NOT considered active (terminal states):
    - completed: Order finished successfully
    - failed: Order failed with an error
    - cancelled: User cancelled the order
    - deleted: User deleted the order
    """
    result = db.execute(
        text("""
            SELECT * FROM vayne_orders 
            WHERE vayne_order_id IS NOT NULL 
            AND status IN ('pending', 'initialization', 'scraping', 'segmenting')
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
    """
    Mark an order as failed with a user-facing failure reason.
    If credits were already charged, refund them to the user.
    """
    try:
        result = db.execute(
            text("""
                UPDATE vayne_orders
                SET status = 'failed', failure_reason = :reason
                WHERE id = :order_id
                RETURNING credits_charged, user_id
            """),
            {"order_id": str(order_id), "reason": error_reason}
        )
        row = result.fetchone()

        if row and row.credits_charged and row.credits_charged > 0:
            db.execute(
                text("UPDATE users SET credits = credits + :amt WHERE id = :uid"),
                {"amt": row.credits_charged, "uid": str(row.user_id)}
            )
            db.execute(
                text("UPDATE vayne_orders SET credits_charged = 0 WHERE id = :oid"),
                {"oid": str(order_id)}
            )
            log(f"Refunded {row.credits_charged} credits to user {row.user_id}", "info")

        db.commit()
        log(f"Order {order_id} marked as failed: {error_reason}", "error")
        return True
    except Exception as e:
        db.rollback()
        log(f"Failed to mark order {order_id} as failed: {e}", "error")
        raise


async def wait_for_active_order_completion(db, active_order):
    """
    Wait for an active order to complete by polling its status.
    Uses the order's own id (UUID) for tracking, not vayne_order_id.
    When status becomes "completed", triggers enrichment before returning.
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
            log(f"Active order {order_id} completed", "success")
            
            # Send completion notification email
            try:
                user_result = db.execute(
                    text("""
                        SELECT u.email, vo.targeting, vo.leads_found 
                        FROM users u 
                        JOIN vayne_orders vo ON u.id = vo.user_id 
                        WHERE vo.id = :order_id
                    """),
                    {"order_id": str(order_id)}
                )
                user_row = user_result.fetchone()
                if user_row:
                    send_scraping_completion_email(
                        user_email=user_row[0],
                        order_id=str(order_id),
                        results={
                            "leads_found": user_row[2] or 0,
                        },
                        targeting=user_row[1]
                    )
            except Exception as email_error:
                log(f"Failed to send notification email: {email_error}", "error")
                # Don't fail the job for email errors
            
            # Note: Enrichment is now a separate workflow - users must manually create enrichment jobs
            # from the completed scrape CSV file via the upload interface
            
            # Allow next scraping order to process (this happens automatically in main loop)
            log(f"Proceeding to next queued order", "success")
            return True
        elif status == "failed":
            log(f"Active order {order_id} failed, proceeding to next queued order", "error")
            return True  # Treat failed as "done" so we can process next order
        elif status == "cancelled":
            log(f"Active order {order_id} was cancelled, proceeding to next queued order", "info")
            return True  # Treat cancelled as "done" so we can process next order
        elif status == "deleted":
            log(f"Active order {order_id} was deleted, proceeding to next queued order", "info")
            return True  # Treat deleted as "done" so we can process next order
        elif status is None:
            log(f"Active order {order_id} not found in database, proceeding", "wait")
            return True  # Order doesn't exist, proceed
        
        # Status is still active (initialization, scraping, segmenting), wait and check again
        # n8n workflow will update status to "completed" when done
        log(f"Active order {order_id} status: {status}, waiting {ACTIVE_CHECK_INTERVAL}s...", "wait")
        await asyncio.sleep(ACTIVE_CHECK_INTERVAL)


async def process_queued_order(order_row):
    """
    Process a queued order with full validation:
    1. Check per-client daily limit
    2. Select API key with available daily capacity
    3. Push user LinkedIn cookie on selected key
    4. Validate URL to get estimated_leads
    5. Check user credits against estimated_leads
    6. Deduct credits and create the scraping order
    7. On any failure: mark failed with reason and refund if needed
    """
    if isinstance(order_row.id, UUID):
        order_id = order_row.id
    else:
        order_id = UUID(str(order_row.id))

    db = SessionLocal()

    try:
        log(f"Processing queued order {order_id}", "info")

        from app.services.vayne_client import get_vayne_clients
        from app.core.config import ADMIN_EMAIL

        # -----------------------------------------------------------------
        # Step 0: Per-client daily limit check (15k leads / 24h)
        # -----------------------------------------------------------------
        user_result = db.execute(
            text("SELECT email FROM users WHERE id = :user_id"),
            {"user_id": str(order_row.user_id)}
        )
        user_row = user_result.fetchone()
        is_admin = user_row and user_row.email == ADMIN_EMAIL

        if not is_admin:
            daily_limit = settings.VAYNE_PER_CLIENT_DAILY_LIMIT
            usage_result = db.execute(
                text("""
                    SELECT COALESCE(SUM(estimated_leads), 0) as used
                    FROM vayne_orders
                    WHERE user_id = :uid
                    AND status != 'failed'
                    AND created_at >= NOW() - INTERVAL '24 hours'
                """),
                {"uid": str(order_row.user_id)}
            )
            daily_used = int(usage_result.fetchone().used)
            if daily_used >= daily_limit:
                mark_order_failed(
                    db, order_id,
                    f"Daily scraping limit reached. You can scrape up to {daily_limit:,} profiles per day to protect your account. Please try again later."
                )
                return False
            log(f"Daily usage: {daily_used:,}/{daily_limit:,} profiles", "info")

        vayne_clients = get_vayne_clients()
        if not vayne_clients:
            mark_order_failed(db, order_id, "No scraping API keys configured. Please contact support.")
            return False

        # -----------------------------------------------------------------
        # Step 1: LinkedIn cookie check
        # -----------------------------------------------------------------
        user_cookie = (order_row.linkedin_cookie or "").strip()
        if not user_cookie:
            mark_order_failed(
                db, order_id,
                "Please provide a valid LinkedIn session cookie to start scraping."
            )
            return False

        # -----------------------------------------------------------------
        # Step 2: Select API key with daily capacity + push cookie + validate URL
        # We iterate through keys trying to find one that works.
        # -----------------------------------------------------------------
        selected_client = None
        estimated_leads = 0

        for idx, client in enumerate(vayne_clients):
            try:
                credits_info = client.get_credits()
                daily_remaining = credits_info.get("daily_limit_leads", 0)
                log(f"Key {idx}: daily_limit_leads={daily_remaining}", "info")

                if daily_remaining <= 0:
                    log(f"Key {idx}: no daily capacity remaining, skipping", "info")
                    continue

                # Push user cookie on this key
                try:
                    client.update_linkedin_session(user_cookie)
                    log(f"LinkedIn cookie pushed on key {idx}", "success")
                except Exception as cookie_err:
                    log(f"Cookie push failed on key {idx}: {cookie_err}", "error")
                    continue

                # Validate URL on this key to get estimated_leads
                try:
                    url_check = client.validate_url(order_row.sales_nav_url)
                    est = url_check.get("total") or 0
                    url_type = url_check.get("type")

                    if not est or not url_type:
                        mark_order_failed(
                            db, order_id,
                            "Invalid Sales Navigator URL. Please check the URL and try again."
                        )
                        return False

                    if est > daily_remaining:
                        log(f"Key {idx}: estimated {est} leads exceeds daily remaining {daily_remaining}, trying next key", "info")
                        continue

                    estimated_leads = est
                    selected_client = client
                    log(f"Selected key {idx}: ~{estimated_leads} estimated leads (type: {url_type})", "success")
                    break
                except Exception as url_err:
                    error_str = str(url_err).lower()
                    if "unauthorized" in error_str or "invalid" in error_str or "expired" in error_str:
                        log(f"Key {idx}: cookie auth rejected during URL validation, trying next key", "info")
                        continue
                    mark_order_failed(
                        db, order_id,
                        "Failed to validate the Sales Navigator URL. Please check the URL and try again."
                    )
                    log(f"URL validation exception on key {idx}: {url_err}", "error")
                    return False

            except Exception as key_err:
                log(f"Key {idx}: failed to check credits: {key_err}", "error")
                continue

        if not selected_client:
            mark_order_failed(
                db, order_id,
                "All scraping accounts have reached their daily limit. Please try again tomorrow."
            )
            return False

        # Store estimated_leads on the order
        db.execute(
            text("UPDATE vayne_orders SET estimated_leads = :est WHERE id = :oid"),
            {"est": estimated_leads, "oid": str(order_id)}
        )
        db.commit()

        # -----------------------------------------------------------------
        # Step 3: Credit check
        # -----------------------------------------------------------------
        user_result = db.execute(
            text("SELECT email, credits FROM users WHERE id = :user_id"),
            {"user_id": str(order_row.user_id)}
        )
        user = user_result.fetchone()

        if not user:
            mark_order_failed(db, order_id, "User account not found.")
            return False

        is_admin = user.email == ADMIN_EMAIL
        if not is_admin and estimated_leads > 0 and user.credits < estimated_leads:
            mark_order_failed(
                db, order_id,
                f"Insufficient credits. You have {user.credits:,} credits but this job requires ~{estimated_leads:,}. Please top up your account."
            )
            return False

        # -----------------------------------------------------------------
        # Step 4: Deduct credits (before creating the scraping order)
        # -----------------------------------------------------------------
        if not is_admin and estimated_leads > 0:
            db.execute(
                text("UPDATE users SET credits = GREATEST(0, credits - :amount) WHERE id = :user_id"),
                {"amount": estimated_leads, "user_id": str(order_row.user_id)}
            )
            db.execute(
                text("UPDATE vayne_orders SET credits_charged = :amount WHERE id = :order_id"),
                {"amount": estimated_leads, "order_id": str(order_id)}
            )
            db.commit()
            log(f"Charged {estimated_leads} credits to {user.email} (had {user.credits})", "success")
        else:
            log(f"Admin user or 0 estimated leads - skipping credit deduction", "info")

        # -----------------------------------------------------------------
        # Step 5: Create the scraping order (using selected key)
        # -----------------------------------------------------------------
        try:
            log(f"Creating scraping order for order {order_id}", "info")

            base_name = order_row.targeting or "Untitled Order"
            unique_name = f"{base_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            vayne_response = selected_client.create_order(
                url=order_row.sales_nav_url,
                name=unique_name,
                limit=None,
                email_enrichment=False,
                saved_search=False,
                secondary_webhook="",
                export_format="simple",
            )

            vayne_order = vayne_response.get("order", {})
            vayne_order_id = vayne_order.get("id")
            if not vayne_order_id:
                mark_order_failed(db, order_id, "Scraping service failed to create the order. Please try again.")
                return False

            vayne_order_id_str = str(vayne_order_id)
            order_name = vayne_order.get("name")

            scraping_status = vayne_order.get("status", "initialization")
            if scraping_status in ("initialization", "pending", "scraping", "segmenting"):
                db_status = scraping_status
            else:
                db_status = "initialization"

            update_order_status(
                db,
                order_id,
                status=db_status,
                vayne_order_id=vayne_order_id_str,
                name=order_name
            )

            log(f"Order {order_id} sent to scraping service (ID: {vayne_order_id_str}, status: {db_status})", "success")
            return True

        except Exception as e:
            log(f"Failed to create scraping order for {order_id}: {e}", "error")
            mark_order_failed(db, order_id, "Failed to start the scraping job. Please try again later.")
            return False

    except Exception as e:
        log(f"Error processing queued order {order_id}: {e}", "error")
        try:
            mark_order_failed(db, order_id, "An unexpected error occurred while processing your order.")
        except Exception:
            pass
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
