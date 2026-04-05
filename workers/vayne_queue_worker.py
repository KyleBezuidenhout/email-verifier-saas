#!/usr/bin/env python3
"""
Vayne Queue Worker — Slot-Based Concurrent Processing

Processes queued Vayne scraping orders with one job per API key (slot).
Supports N concurrent jobs where N = number of configured API keys.

Key design decisions:
  - Each API key is a "slot". A slot is busy when a vayne_orders row has
    api_key_slot = N and status in active states.
  - The DB is the source of truth for slot occupancy (survives restarts).
  - select_best_available_slot() picks the free slot with the most remaining
    daily capacity on Vayne's side (same pattern as MailTester get_best_key).
  - Credit deduction uses an atomic UPDATE ... WHERE credits >= amount.
  - Daily limit checks use SELECT ... FOR UPDATE to serialize per-user.
  - When all Vayne keys are daily-exhausted, orders stay queued (not failed)
    and an admin email is sent once per day.
  - Crash recovery on startup: detect and resume monitoring orphaned orders.
  - Stuck order timeout: orders active > 24h are failed with refund.
"""

import asyncio
import os
import sys
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any, List, Set, Tuple
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

workers_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(workers_dir, '..', 'backend')
sys.path.insert(0, backend_path)
sys.path.insert(0, workers_dir)

print(f"Python path: {sys.path}", flush=True)
print(f"Backend path: {backend_path}", flush=True)
print(f"Current directory: {os.getcwd()}", flush=True)

try:
    from app.core.config import settings
    from app.services.vayne_client import (
        get_vayne_client, get_vayne_clients, VayneClient,
        is_slot_healthy, mark_slot_unhealthy, should_send_daily_limit_alert,
    )
    from app.core.config import ADMIN_EMAIL
    from app.models.vayne_order import VayneOrder
    from app.models.job import Job
    from app.models.user import User
    import redis
    print("Successfully imported app modules", flush=True)
except ImportError as e:
    print(f"Import error: {e}", flush=True)
    print(f"Looking for app in: {backend_path}", flush=True)
    if os.path.exists(backend_path):
        print(f"Backend directory exists: {os.listdir(backend_path)}", flush=True)
    raise

from email_utils import send_job_failure_email, send_admin_daily_limit_email, send_daily_limit_reached_email

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


def _check_credit_usage_alert(user_id: str, user_email: str, plan: str, credits_remaining: float):
    """Send 90% credit usage alert once per billing cycle for paid plan users."""
    if plan == "trial" or plan == "custom":
        return
    from app.core.plans import PLAN_CREDITS
    monthly_credits = PLAN_CREDITS.get((plan, "monthly"), 0)
    yearly_credits = PLAN_CREDITS.get((plan, "yearly"), 0)
    plan_credits = max(monthly_credits, yearly_credits) or monthly_credits
    if plan_credits <= 0:
        return

    credits_used = plan_credits - credits_remaining
    if credits_used < 0:
        credits_used = 0
    usage_pct = credits_used / plan_credits
    if usage_pct < 0.9:
        return

    alert_key = f"credit_alert:90pct:{user_id}"
    already_sent = redis_client.set(alert_key, "1", nx=True, ex=86400 * 35)
    if not already_sent:
        return

    try:
        from email_utils import send_credit_usage_alert
        send_credit_usage_alert(user_email, plan, credits_used, plan_credits)
        log(f"Sent 90% credit usage alert to {user_email}")
    except Exception as e:
        log(f"Failed to send credit usage alert to {user_email}: {e}", "error")


QUEUE_POLL_INTERVAL = settings.VAYNE_QUEUE_WORKER_POLL_INTERVAL          # 30 seconds
ACTIVE_CHECK_INTERVAL = settings.VAYNE_QUEUE_WORKER_ACTIVE_CHECK_INTERVAL  # 60 seconds
STUCK_ORDER_TIMEOUT_HOURS = 24
STUCK_CHECK_INTERVAL_MINUTES = 30

GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
APP_URL = os.getenv("APP_URL", "https://www.billionverifier.io")

VAYNE_ACTIVE_STATUSES = ('pending', 'initialization', 'scraping', 'segmenting')


def log(message: str, level: str = "info"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = {"success": "[OK]", "error": "[ERR]", "wait": "[WAIT]"}.get(level, "[INFO]")
    print(f"[{timestamp}] {prefix} {message}", flush=True)


# ---------------------------------------------------------------------------
# Email helpers
# ---------------------------------------------------------------------------

def _generate_reset_token(user_id: str) -> str:
    """Generate a signed JWT for the daily-limit reset email link (24h expiry)."""
    from jose import jwt as _jwt
    from datetime import timedelta
    payload = {
        "sub": user_id,
        "purpose": "reset_daily_limit",
        "exp": datetime.utcnow() + timedelta(hours=24),
    }
    return _jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _send_daily_limit_user_email(db, user_id, user_email: str, job_name: str, estimated_leads: int):
    """Send the daily-limit-reached email to the user with a reset link."""
    try:
        token = _generate_reset_token(str(user_id))
        reset_url = f"{APP_URL}/reset-daily-limit?token={token}"
        send_daily_limit_reached_email(user_email, job_name, estimated_leads, reset_url)
    except Exception as e:
        log(f"Failed to send daily limit email to {user_email}: {e}", "error")


def send_scraping_completion_email(user_email: str, order_id: str, results: dict, targeting: str = None) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        log("Gmail credentials not configured - skipping email notification", "info")
        return False

    job_name = targeting or f"Order {order_id[:8]}"
    leads_found = results.get("leads_found", 0)

    subject = f"Scraping complete: {leads_found} leads found"

    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; padding: 40px 20px;">
      <div style="background-color: #141414; border: 1px solid #222; border-radius: 12px; padding: 32px;">
        <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #0099FF;">Your Scraping Job is Complete!</h2>
        <p style="color: #999; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">Great news! Your scraping job "<strong style="color: #ccc;">{job_name}</strong>" has finished.</p>
        <div style="background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px 0; color: #ffffff; font-size: 16px;">Results Summary</h3>
          <p style="margin: 0; padding: 8px 0; color: #999;">Leads found: <strong style="color: #ccc;">{leads_found}</strong></p>
        </div>
        <a href="{APP_URL}/sales-nav-scraper"
           style="display: inline-block; background-color: transparent; color: #0099FF; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; border: 1px solid #0099FF;">
          View &amp; Download Leads
        </a>
        <p style="color: #555; font-size: 12px; margin-top: 24px; margin-bottom: 0;">
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


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_active_slots(db) -> Dict[int, Any]:
    """Return {slot_idx: order_row} for currently active orders."""
    result = db.execute(text("""
        SELECT * FROM vayne_orders
        WHERE api_key_slot IS NOT NULL
        AND status IN :statuses
    """.replace(":statuses", f"({','.join(repr(s) for s in VAYNE_ACTIVE_STATUSES)})")))
    rows = result.fetchall()
    slots = {}
    for row in rows:
        if row.api_key_slot is not None:
            slots[row.api_key_slot] = row
    return slots


def get_queued_orders(db, limit: int = 10):
    """Get the oldest queued orders (FIFO)."""
    result = db.execute(text("""
        SELECT * FROM vayne_orders
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT :lim
    """), {"lim": limit})
    return result.fetchall()


def check_order_status(db, order_id: UUID) -> Optional[str]:
    result = db.execute(
        text("SELECT status FROM vayne_orders WHERE id = :order_id"),
        {"order_id": str(order_id)}
    )
    row = result.fetchone()
    return row.status if row else None


def update_order_status(db, order_id: UUID, status: Optional[str] = None,
                        vayne_order_id: Optional[str] = None, name: Optional[str] = None):
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
            text(f"UPDATE vayne_orders SET {set_clause} WHERE id = :order_id"),
            {"order_id": str(order_id), **update_params}
        )
        db.commit()
        return result.rowcount > 0
    except Exception as e:
        db.rollback()
        log(f"Failed to update order {order_id} status: {e}", "error")
        raise


def mark_order_failed(db, order_id: UUID, error_reason: str):
    """Mark order failed, refund credits if charged, and email the client."""
    try:
        result = db.execute(text("""
            UPDATE vayne_orders
            SET status = 'failed', failure_reason = :reason
            WHERE id = :order_id
            RETURNING credits_charged, user_id
        """), {"order_id": str(order_id), "reason": error_reason})
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

        # Send failure email to the client
        try:
            user_info = db.execute(text("""
                SELECT u.email, vo.targeting
                FROM users u
                JOIN vayne_orders vo ON u.id = vo.user_id
                WHERE vo.id = :oid
            """), {"oid": str(order_id)}).fetchone()
            if user_info:
                send_job_failure_email(
                    user_email=user_info[0],
                    job_type="Sales Nav Scraping",
                    job_name=user_info[1] or "Untitled Order",
                    failure_reason=error_reason,
                    job_id=str(order_id),
                )
        except Exception as email_err:
            log(f"Failed to send failure email: {email_err}", "error")

        return True
    except Exception as e:
        db.rollback()
        log(f"Failed to mark order {order_id} as failed: {e}", "error")
        raise


def update_heartbeat(db, order_id: UUID):
    """Update the heartbeat timestamp for crash recovery tracking."""
    try:
        db.execute(text(
            "UPDATE vayne_orders SET last_heartbeat = NOW() WHERE id = :oid"
        ), {"oid": str(order_id)})
        db.commit()
    except Exception:
        db.rollback()


# ---------------------------------------------------------------------------
# Crash recovery
# ---------------------------------------------------------------------------

def fail_stuck_vayne_orders(db):
    """Fail orders stuck in active states for over STUCK_ORDER_TIMEOUT_HOURS."""
    result = db.execute(text(f"""
        UPDATE vayne_orders
        SET status = 'failed',
            failure_reason = 'Order timed out after {STUCK_ORDER_TIMEOUT_HOURS} hours without completing. Please retry.'
        WHERE status IN {repr(VAYNE_ACTIVE_STATUSES)}
        AND vayne_order_id IS NOT NULL
        AND created_at < NOW() - INTERVAL '{STUCK_ORDER_TIMEOUT_HOURS} hours'
        RETURNING id, user_id, credits_charged
    """))
    stuck_orders = result.fetchall()

    for order in stuck_orders:
        order_id = order.id
        if order.credits_charged and order.credits_charged > 0:
            db.execute(
                text("UPDATE users SET credits = credits + :amt WHERE id = :uid"),
                {"amt": order.credits_charged, "uid": str(order.user_id)}
            )
            db.execute(
                text("UPDATE vayne_orders SET credits_charged = 0 WHERE id = :oid"),
                {"oid": str(order_id)}
            )
            log(f"Refunded {order.credits_charged} credits for stuck order {order_id}", "info")

        # Send failure email
        try:
            user_info = db.execute(text("""
                SELECT u.email, vo.targeting
                FROM users u JOIN vayne_orders vo ON u.id = vo.user_id
                WHERE vo.id = :oid
            """), {"oid": str(order_id)}).fetchone()
            if user_info:
                send_job_failure_email(
                    user_email=user_info[0],
                    job_type="Sales Nav Scraping",
                    job_name=user_info[1] or "Untitled Order",
                    failure_reason=f"Order timed out after {STUCK_ORDER_TIMEOUT_HOURS} hours without completing.",
                    job_id=str(order_id),
                )
        except Exception:
            pass

        log(f"Timed out stuck order {order_id}", "error")

    if stuck_orders:
        db.commit()
        log(f"Failed {len(stuck_orders)} stuck order(s)", "info")


# ---------------------------------------------------------------------------
# URL normalization
# ---------------------------------------------------------------------------

def normalize_sales_nav_url(url: str) -> str:
    url = url.strip()
    if not url:
        return url
    if url.startswith("https://www.linkedin.com"):
        return url
    if url.startswith("http://"):
        return url.replace("http://", "https://www.", 1)
    if url.startswith("https://") and not url.startswith("https://www."):
        return url.replace("https://", "https://www.", 1)
    if url.startswith("www."):
        return f"https://{url}"
    if url.startswith("linkedin.com"):
        return f"https://www.{url}"
    return url


# ---------------------------------------------------------------------------
# Slot selection — pick free slot with most Vayne daily capacity remaining
# ---------------------------------------------------------------------------

_LOW_CAPACITY_THRESHOLD = 10_000


def _should_send_low_capacity_alert() -> bool:
    """Return True if we haven't sent a low-capacity admin alert today."""
    import redis as _redis
    r = _redis.from_url(settings.REDIS_URL, decode_responses=True)
    today = time.strftime("%Y-%m-%d")
    key = f"vayne:low_capacity_alert:{today}"
    if r.get(key):
        return False
    r.set(key, "1", ex=86400)
    return True


def _check_all_slots_low_capacity(vayne_clients: List[VayneClient]) -> None:
    """If every Vayne API key has < 10k daily leads remaining, alert admin once per day."""
    all_low = True
    capacities = []
    for idx, client in enumerate(vayne_clients):
        try:
            credits_info = client.get_credits()
            remaining = credits_info.get("daily_limit_leads", 0)
            capacities.append(remaining)
            if remaining >= _LOW_CAPACITY_THRESHOLD:
                all_low = False
                break
        except Exception:
            capacities.append(0)

    if all_low and capacities and _should_send_low_capacity_alert():
        detail_parts = [f"Slot {i}: {c:,} leads remaining" for i, c in enumerate(capacities)]
        send_admin_daily_limit_email(
            service="Vayne Sales Nav Scraper (Low Capacity)",
            detail=(
                f"All {len(vayne_clients)} Vayne API key account(s) have less than "
                f"{_LOW_CAPACITY_THRESHOLD:,} daily leads remaining.\n\n"
                + "\n".join(detail_parts)
            ),
        )
        log(f"Sent low-capacity admin alert: {capacities}", "info")


def select_best_available_slot(
    vayne_clients: List[VayneClient],
    busy_slots: Set[int],
) -> Optional[Tuple[int, VayneClient, int]]:
    """Pick the healthy free slot whose Vayne account has the most daily capacity.

    Returns (slot_idx, client, daily_remaining) or None.
    """
    best: Optional[Tuple[int, VayneClient]] = None
    best_remaining = -1

    for idx, client in enumerate(vayne_clients):
        if idx in busy_slots:
            continue
        if not is_slot_healthy(idx):
            log(f"Slot {idx}: marked unhealthy, skipping", "info")
            continue
        try:
            credits_info = client.get_credits()
            remaining = credits_info.get("daily_limit_leads", 0)
            log(f"Slot {idx}: daily_limit_leads={remaining}", "info")
            if remaining > best_remaining:
                best_remaining = remaining
                best = (idx, client)
        except Exception as e:
            log(f"Slot {idx}: failed to check credits: {e}", "error")
            mark_slot_unhealthy(idx, ttl=300)
            continue

    if best and best_remaining > 0:
        return (best[0], best[1], best_remaining)
    return None


# ---------------------------------------------------------------------------
# Process a single queued order on a specific slot
# ---------------------------------------------------------------------------

async def process_queued_order(order_row, slot_idx: int, client: VayneClient) -> str:
    """
    Process a queued order. Returns:
      "submitted" — order sent to Vayne (now in active state on this slot)
      "failed"    — order failed (slot is free)
      "requeue"   — order should stay queued (daily limits hit, not a failure)
    """
    if isinstance(order_row.id, UUID):
        order_id = order_row.id
    else:
        order_id = UUID(str(order_row.id))

    db = SessionLocal()
    try:
        log(f"[Slot {slot_idx}] Processing queued order {order_id}", "info")

        normalized_url = normalize_sales_nav_url(order_row.sales_nav_url)
        if normalized_url != order_row.sales_nav_url:
            log(f"Normalized URL: {order_row.sales_nav_url} -> {normalized_url}", "info")

        # --- Step 0: Per-client daily limit check (atomic with FOR UPDATE) ---
        user_result = db.execute(
            text("SELECT email, vayne_daily_usage_reset_at FROM users WHERE id = :user_id FOR UPDATE"),
            {"user_id": str(order_row.user_id)}
        )
        user_row = user_result.fetchone()
        is_admin = user_row and user_row.email == ADMIN_EMAIL
        user_reset_at = user_row.vayne_daily_usage_reset_at if user_row else None

        if not is_admin:
            daily_limit = settings.VAYNE_PER_CLIENT_DAILY_LIMIT
            usage_result = db.execute(text("""
                SELECT COALESCE(SUM(estimated_leads), 0) as used
                FROM vayne_orders
                WHERE user_id = :uid
                AND status != 'failed'
                AND created_at >= GREATEST(
                    NOW() - INTERVAL '24 hours',
                    COALESCE(:reset_at, '1970-01-01'::timestamptz)
                )
            """), {"uid": str(order_row.user_id), "reset_at": user_reset_at})
            daily_used = int(usage_result.fetchone().used)
            if daily_used >= daily_limit:
                db.commit()  # release FOR UPDATE lock
                mark_order_failed(
                    db, order_id,
                    f"Daily scraping limit reached. You can scrape up to {daily_limit:,} profiles per day. Please try again later."
                )
                job_name = getattr(order_row, 'targeting', None) or f"Order {str(order_id)[:8]}"
                est = getattr(order_row, 'estimated_leads', None) or 0
                _send_daily_limit_user_email(db, order_row.user_id, user_row.email, job_name, est)
                send_admin_daily_limit_email(
                    service="Vayne Sales Nav Scraper (Per-Client Limit)",
                    detail=f"User {order_row.user_id} ({user_row.email}) reached their daily limit of {daily_limit:,} leads."
                )
                return "failed"
            log(f"Daily usage: {daily_used:,}/{daily_limit:,} profiles", "info")

        db.commit()  # release FOR UPDATE lock

        # --- Step 1: LinkedIn cookie check ---
        user_cookie = (order_row.linkedin_cookie or "").strip()
        if not user_cookie:
            mark_order_failed(db, order_id, "Please provide a valid LinkedIn session cookie to start scraping.")
            return "failed"

        # --- Step 2: Push cookie + validate URL on the assigned slot ---
        try:
            client.update_linkedin_session(user_cookie)
            log(f"[Slot {slot_idx}] LinkedIn cookie pushed", "success")
        except Exception as cookie_err:
            error_str = str(cookie_err).lower()
            if "unauthorized" in error_str or "invalid" in error_str or "expired" in error_str:
                mark_order_failed(db, order_id, "Your LinkedIn session cookie was rejected. Please provide a valid li_at cookie and try again.")
            else:
                mark_order_failed(db, order_id, f"Failed to update LinkedIn session. Please try again later.")
                mark_slot_unhealthy(slot_idx, ttl=300)
            return "failed"

        try:
            url_check = client.validate_url(normalized_url)
            estimated_leads = url_check.get("total") or 0
            url_type = url_check.get("type")

            if not estimated_leads or not url_type:
                mark_order_failed(db, order_id, "Invalid Sales Navigator URL. Please check the URL and try again.")
                return "failed"

            credits_info = client.get_credits()
            daily_remaining = credits_info.get("daily_limit_leads", 0)
            if estimated_leads > daily_remaining:
                log(f"[Slot {slot_idx}] Estimated {estimated_leads} leads exceeds slot daily remaining {daily_remaining}", "info")
                # Persist estimated_leads so the dispatcher can skip this order
                # without re-pushing the cookie and re-validating the URL
                db.execute(text(
                    "UPDATE vayne_orders SET estimated_leads = :est WHERE id = :oid"
                ), {"est": estimated_leads, "oid": str(order_id)})
                db.commit()
                return "requeue"

            log(f"[Slot {slot_idx}] ~{estimated_leads} estimated leads (type: {url_type})", "success")

        except Exception as url_err:
            error_str = str(url_err).lower()
            if "unauthorized" in error_str or "invalid" in error_str or "expired" in error_str:
                mark_order_failed(db, order_id, "Your LinkedIn session cookie was rejected during URL validation. Please provide a valid li_at cookie.")
                return "failed"
            mark_order_failed(db, order_id, "Failed to validate the Sales Navigator URL. Please check the URL and try again.")
            log(f"URL validation exception on slot {slot_idx}: {url_err}", "error")
            return "failed"

        # --- Step 3: Reserve estimated_leads + daily limit atomic check ---
        db2 = SessionLocal()
        try:
            if not is_admin:
                db2.execute(
                    text("SELECT id FROM users WHERE id = :uid FOR UPDATE"),
                    {"uid": str(order_row.user_id)}
                )
                usage_result = db2.execute(text("""
                    SELECT COALESCE(SUM(estimated_leads), 0) as used
                    FROM vayne_orders
                    WHERE user_id = :uid AND status != 'failed'
                    AND created_at >= GREATEST(
                        NOW() - INTERVAL '24 hours',
                        COALESCE(:reset_at, '1970-01-01'::timestamptz)
                    )
                """), {"uid": str(order_row.user_id), "reset_at": user_reset_at})
                daily_used = int(usage_result.fetchone().used)
                if daily_used + estimated_leads > settings.VAYNE_PER_CLIENT_DAILY_LIMIT:
                    db2.commit()
                    job_name = getattr(order_row, 'targeting', None) or f"Order {str(order_id)[:8]}"
                    mark_order_failed(
                        db, order_id,
                        f"Daily scraping limit reached. This job requires ~{estimated_leads:,} leads but you only have {settings.VAYNE_PER_CLIENT_DAILY_LIMIT - daily_used:,} remaining today."
                    )
                    _send_daily_limit_user_email(db, order_row.user_id, user_row.email, job_name, estimated_leads)
                    return "failed"

            db2.execute(text(
                "UPDATE vayne_orders SET estimated_leads = :est, api_key_slot = :slot WHERE id = :oid"
            ), {"est": estimated_leads, "slot": slot_idx, "oid": str(order_id)})
            db2.commit()
        finally:
            db2.close()

        # --- Step 4: Atomic credit deduction ---
        user_result = db.execute(
            text("SELECT email, credits FROM users WHERE id = :user_id"),
            {"user_id": str(order_row.user_id)}
        )
        user = user_result.fetchone()
        if not user:
            mark_order_failed(db, order_id, "User account not found.")
            return "failed"

        is_admin = user.email == ADMIN_EMAIL
        if not is_admin and estimated_leads > 0:
            deduct_result = db.execute(text("""
                UPDATE users
                SET credits = credits - :amount
                WHERE id = :user_id AND credits >= :amount
                RETURNING credits
            """), {"amount": estimated_leads, "user_id": str(order_row.user_id)})
            deduct_row = deduct_result.fetchone()

            if deduct_row is None:
                db.rollback()
                current_credits = db.execute(
                    text("SELECT credits FROM users WHERE id = :uid"),
                    {"uid": str(order_row.user_id)}
                ).fetchone()
                credits_have = current_credits.credits if current_credits else 0
                mark_order_failed(
                    db, order_id,
                    f"Insufficient credits. You have {credits_have:,} credits but this job requires ~{estimated_leads:,}. Please top up your account."
                )
                return "failed"

            db.execute(text(
                "UPDATE vayne_orders SET credits_charged = :amount WHERE id = :order_id"
            ), {"amount": estimated_leads, "order_id": str(order_id)})
            db.commit()
            log(f"Charged {estimated_leads} credits to {user.email} (remaining: {deduct_row.credits})", "success")
        else:
            log(f"Admin user or 0 estimated leads - skipping credit deduction", "info")

        # --- Step 5: Create the scraping order ---
        try:
            base_name = order_row.targeting or "Untitled Order"
            unique_name = f"{base_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            vayne_response = client.create_order(
                url=normalized_url,
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
                return "failed"

            vayne_order_id_str = str(vayne_order_id)
            order_name = vayne_order.get("name")

            scraping_status = vayne_order.get("status", "initialization")
            if scraping_status not in VAYNE_ACTIVE_STATUSES:
                scraping_status = "initialization"

            update_order_status(db, order_id, status=scraping_status,
                                vayne_order_id=vayne_order_id_str, name=order_name)

            # Set initial heartbeat
            update_heartbeat(db, order_id)

            log(f"[Slot {slot_idx}] Order {order_id} sent to Vayne (ID: {vayne_order_id_str}, status: {scraping_status})", "success")
            return "submitted"

        except Exception as e:
            log(f"Failed to create scraping order for {order_id}: {e}", "error")
            mark_order_failed(db, order_id, "Failed to start the scraping job. Please try again later.")
            return "failed"

    except Exception as e:
        log(f"Error processing queued order {order_id}: {e}", "error")
        try:
            mark_order_failed(db, order_id, "An unexpected error occurred while processing your order.")
        except Exception:
            pass
        return "failed"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Monitor an active order on a slot until it reaches a terminal state
# ---------------------------------------------------------------------------

async def monitor_slot(slot_idx: int, order_row):
    """Poll DB until the order completes/fails/cancels, then return (freeing the slot)."""
    if isinstance(order_row.id, UUID):
        order_id = order_row.id
    else:
        order_id = UUID(str(order_row.id))

    vayne_order_id = order_row.vayne_order_id
    log(f"[Slot {slot_idx}] Monitoring order {order_id} (Vayne ID: {vayne_order_id})", "wait")

    db = SessionLocal()
    try:
        while True:
            status = check_order_status(db, order_id)

            if status == "completed":
                log(f"[Slot {slot_idx}] Order {order_id} completed", "success")
                try:
                    row = db.execute(text("""
                        SELECT u.email, vo.targeting, vo.estimated_leads,
                               u.id as user_id, u.plan, u.credits
                        FROM users u
                        JOIN vayne_orders vo ON u.id = vo.user_id
                        WHERE vo.id = :order_id
                    """), {"order_id": str(order_id)}).fetchone()
                    if row:
                        send_scraping_completion_email(
                            user_email=row[0],
                            order_id=str(order_id),
                            results={"leads_found": row[2] or 0},
                            targeting=row[1],
                        )
                        _check_credit_usage_alert(str(row[3]), row[0], row[4] or "trial", float(row[5] or 0))
                except Exception as email_error:
                    log(f"Failed to send notification email: {email_error}", "error")
                return

            if status in ("failed", "cancelled", "deleted", None):
                label = status or "not found"
                log(f"[Slot {slot_idx}] Order {order_id} {label}, freeing slot", "info")
                return

            # Still active — update heartbeat and wait
            update_heartbeat(db, order_id)
            log(f"[Slot {slot_idx}] Order {order_id} status: {status}, waiting {ACTIVE_CHECK_INTERVAL}s...", "wait")
            await asyncio.sleep(ACTIVE_CHECK_INTERVAL)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Full slot lifecycle: assign -> process -> monitor
# ---------------------------------------------------------------------------

async def process_and_monitor_slot(slot_idx: int, client: VayneClient, order_row):
    """Assign a queued order to a slot, process it, and monitor until done."""
    result = await process_queued_order(order_row, slot_idx, client)

    if result == "submitted":
        # Re-fetch the order to get the updated vayne_order_id
        db = SessionLocal()
        try:
            if isinstance(order_row.id, UUID):
                order_id = order_row.id
            else:
                order_id = UUID(str(order_row.id))
            updated = db.execute(
                text("SELECT * FROM vayne_orders WHERE id = :oid"),
                {"oid": str(order_id)}
            ).fetchone()
            if updated:
                await monitor_slot(slot_idx, updated)
        finally:
            db.close()


# ---------------------------------------------------------------------------
# Main dispatcher loop
# ---------------------------------------------------------------------------

async def main():
    log("Vayne Queue Worker starting (slot-based concurrency)...", "info")
    log(f"Queue poll interval: {QUEUE_POLL_INTERVAL}s", "info")
    log(f"Active order check interval: {ACTIVE_CHECK_INTERVAL}s", "info")

    vayne_clients = get_vayne_clients()
    num_slots = len(vayne_clients)
    log(f"Configured {num_slots} Vayne API key slot(s)", "info")

    if num_slots == 0:
        log("No Vayne API keys configured. Worker will idle.", "error")

    active_tasks: Dict[int, asyncio.Task] = {}
    last_stuck_check = time.time()

    # --- Startup crash recovery ---
    db = SessionLocal()
    try:
        log("Running startup crash recovery...", "info")
        fail_stuck_vayne_orders(db)

        active_slots = get_active_slots(db)
        for slot_idx, order in active_slots.items():
            if slot_idx < num_slots:
                log(f"[Slot {slot_idx}] Resuming monitoring for order {order.id}", "info")
                active_tasks[slot_idx] = asyncio.create_task(
                    monitor_slot(slot_idx, order)
                )
            else:
                log(f"[Slot {slot_idx}] Active order {order.id} on invalid slot (only {num_slots} keys), marking failed", "error")
                mark_order_failed(db, order.id if isinstance(order.id, UUID) else UUID(str(order.id)),
                                  "The scraping slot for this order is no longer available. Please retry.")
    finally:
        db.close()

    # --- Main loop ---
    while True:
        try:
            # Clean up completed tasks
            for slot_idx in list(active_tasks):
                if active_tasks[slot_idx].done():
                    try:
                        active_tasks[slot_idx].result()
                    except Exception as task_err:
                        log(f"[Slot {slot_idx}] Task error: {task_err}", "error")
                    del active_tasks[slot_idx]

            # Periodic stuck order check + low-capacity alert
            now = time.time()
            if now - last_stuck_check > STUCK_CHECK_INTERVAL_MINUTES * 60:
                db = SessionLocal()
                try:
                    fail_stuck_vayne_orders(db)
                finally:
                    db.close()
                try:
                    _check_all_slots_low_capacity(vayne_clients)
                except Exception as cap_err:
                    log(f"Low-capacity check error: {cap_err}", "error")
                last_stuck_check = now

            # Determine which slots are busy
            busy_slots = set(active_tasks.keys())
            free_slot_count = num_slots - len(busy_slots)

            if free_slot_count > 0:
                db = SessionLocal()
                try:
                    queued_orders = get_queued_orders(db, limit=free_slot_count)
                    best = None  # cached per poll cycle; invalidated when a slot becomes busy

                    for order in queued_orders:
                        if len(busy_slots) >= num_slots:
                            break

                        if best is None:
                            best = select_best_available_slot(vayne_clients, busy_slots)

                        if best is None:
                            log("No available slots with daily capacity. Orders stay queued.", "wait")
                            if should_send_daily_limit_alert():
                                send_admin_daily_limit_email(
                                    service="Vayne Sales Nav Scraper",
                                    detail=f"All {num_slots} Vayne API key(s) have exhausted their daily limits. "
                                           f"{len(queued_orders)} order(s) are waiting in the queue and will process when limits reset."
                                )
                            break

                        slot_idx, client, slot_capacity = best

                        if order.estimated_leads and order.estimated_leads > slot_capacity:
                            log(f"Order {order.id} needs ~{order.estimated_leads} leads "
                                f"but best slot only has {slot_capacity} remaining — skipping until limits reset", "wait")
                            continue

                        log(f"Assigning order {order.id} to slot {slot_idx}", "info")
                        active_tasks[slot_idx] = asyncio.create_task(
                            process_and_monitor_slot(slot_idx, client, order)
                        )
                        busy_slots.add(slot_idx)
                        best = None  # slot set changed — re-evaluate on next iteration
                finally:
                    db.close()

            await asyncio.sleep(QUEUE_POLL_INTERVAL)

        except KeyboardInterrupt:
            log("Worker shutting down...", "info")
            break
        except Exception as e:
            log(f"Error in main loop: {e}", "error")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(line_buffering=True)
        log("Initializing Vayne Queue Worker...", "info")
        asyncio.run(main())
    except Exception as e:
        print(f"FATAL ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
