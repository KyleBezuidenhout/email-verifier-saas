# vayne.py
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
import httpx
import re
import time
import redis
import boto3
import logging
from jose import jwt, JWTError
from uuid import UUID

from app.db.session import get_db
from app.models.user import User
from app.models.vayne_order import VayneOrder
from app.models.job import Job
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.schemas.vayne import (
    LinkedInAuthStatus,
    UpdateSessionRequest,
    CreditsResponse,
    UrlValidationRequest,
    UrlValidationResponse,
    UrlCheckRequest,
    CreateOrderRequest,
    CreateOrderResponse,
    OrderStatusResponse,
    ValidateCookieRequest,
    ValidateCookieResponse,
)
from app.services.vayne_client import (
    get_vayne_client,
    get_validation_client,
    acquire_validation_lock,
    release_validation_lock,
)
from app.core.config import settings

logger = logging.getLogger(__name__)


# Same regex the frontend uses. Rejects anything that isn't a Sales Navigator
# search / list / lead URL. The worker's validate_url call (which runs on a
# real scraping slot) is what actually determines estimated_leads later.
SALES_NAV_URL_REGEX = re.compile(
    r"^https?://(www\.)?linkedin\.com/sales/(search|lists|lead)",
    re.IGNORECASE,
)


def _validate_cookie_on_validation_slot(cookie: str) -> ValidateCookieResponse:
    """Run the serialized PATCH + wait + GET sequence on the dedicated validation slot.

    Returns a ValidateCookieResponse. Callers MUST treat `reason == "rejected"`
    as "the user's cookie is bad" and `reason == "unavailable"` as "we couldn't
    decide — tell the user to retry".

    The Redis mutex guarantees that while we're mid-sequence no other request
    can PATCH a different cookie onto the validation slot and corrupt our GET.
    The token-based release additionally protects against a stale TTL causing
    us to unlock someone else's newer acquisition.
    """
    cookie = (cookie or "").strip()
    if not cookie:
        return ValidateCookieResponse(valid=False, reason="rejected")

    if not (settings.VAYNE_VALIDATION_API_KEY or "").strip():
        logger.error("VAYNE_VALIDATION_API_KEY is not configured; cannot validate cookie")
        return ValidateCookieResponse(valid=False, reason="unavailable")

    lock_token = acquire_validation_lock()
    if not lock_token:
        logger.warning("Validation-slot mutex timeout; returning unavailable")
        return ValidateCookieResponse(valid=False, reason="unavailable")

    try:
        client = get_validation_client()

        # ---- PATCH ------------------------------------------------------
        try:
            client.update_linkedin_session(cookie)
        except httpx.HTTPStatusError as e:
            code = e.response.status_code if e.response is not None else None
            if code == 422:
                # Malformed cookie; Vayne rejected it outright.
                return ValidateCookieResponse(valid=False, reason="rejected")
            if code in (401, 403):
                logger.error(f"Validation slot auth failure on PATCH: {e}")
                return ValidateCookieResponse(valid=False, reason="unavailable")
            # 429 already exhausted by VayneClient._request backoff; 5xx/other.
            logger.error(f"Validation slot PATCH failed ({code}): {e}")
            return ValidateCookieResponse(valid=False, reason="unavailable")
        except Exception as e:
            logger.error(f"Validation slot PATCH network error: {e}")
            return ValidateCookieResponse(valid=False, reason="unavailable")

        # ---- Wait for Vayne's async LinkedIn-side check ----------------
        time.sleep(settings.VAYNE_AUTH_CHECK_INITIAL_WAIT_S)

        # ---- GET --------------------------------------------------------
        def _poll():
            try:
                return client.check_linkedin_auth()
            except Exception as e:
                logger.error(f"Validation slot GET failed: {e}")
                return None

        data = _poll()
        if data is None:
            return ValidateCookieResponse(valid=False, reason="unavailable")

        state = (data.get("linkedin_authentication") or "").lower()
        if state == "active":
            return ValidateCookieResponse(valid=True)

        if state == "checking":
            # One retry — Vayne's side sometimes takes a few seconds longer.
            time.sleep(settings.VAYNE_AUTH_CHECK_RETRY_WAIT_S)
            data = _poll()
            if data is None:
                return ValidateCookieResponse(valid=False, reason="unavailable")
            state = (data.get("linkedin_authentication") or "").lower()
            if state == "active":
                return ValidateCookieResponse(valid=True)
            if state == "checking":
                # Still indeterminate — do NOT default to "valid".
                return ValidateCookieResponse(valid=False, reason="unavailable")

        # Anything else ("invalid", "expired", "", ...) → rejected.
        return ValidateCookieResponse(valid=False, reason="rejected")
    finally:
        release_validation_lock(lock_token)


def verify_webhook_token(x_webhook_token: Optional[str] = Header(None, alias="X-Webhook-Token")):
    """
    Verify webhook authentication token.
    Webhooks must include X-Webhook-Token header with the secret token.
    """
    if not settings.WEBHOOK_SECRET_TOKEN:
        # If no token is configured, allow access (for development)
        logger.warning("⚠️  WEBHOOK_SECRET_TOKEN not set - webhook is unauthenticated!")
        return True
    
    if not x_webhook_token:
        logger.error("❌ Webhook request missing X-Webhook-Token header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Webhook-Token header. Webhook authentication required."
        )
    
    if x_webhook_token != settings.WEBHOOK_SECRET_TOKEN:
        logger.error(f"❌ Invalid webhook token provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook token"
        )
    
    return True


# Initialize router
router = APIRouter()

# Initialize Redis client
try:
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)
    redis_client.ping()
    logger.info("✅ Redis connected successfully")
except Exception as e:
    logger.warning(f"⚠️  Redis connection failed: {str(e)}")
    redis_client = None


# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)


def is_admin_user(user: User) -> bool:
    """Check if user is admin"""
    return user.email == ADMIN_EMAIL


# TEST: Verify router is registered
@router.get("/test-route-registration")
async def test_route_registration():
    """Test endpoint to verify vayne router is registered"""
    logger.info("✅ Test route registration endpoint called - router is working!")
    return {
        "message": "Router is working",
        "routes_registered": True,
        "webhook_routes": [
            "/api/v1/vayne/webhook",
            "/api/v1/vayne/webhook/n8n-csv-callback"
        ]
    }

# TEST: Verify webhook endpoint exists
@router.get("/test-webhook-exists")
async def test_webhook_exists():
    """Test endpoint to verify webhook routes are registered"""
    print("✅ Webhook test endpoint called!")
    return {
        "webhook_endpoints_exist": True,
        "endpoints": [
            "POST /api/v1/vayne/webhook",
            "POST /api/v1/vayne/webhook/n8n-csv-callback"
        ]
    }


@router.get("/auth", response_model=LinkedInAuthStatus)
def check_linkedin_auth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Read status off the dedicated validation slot, never a scraping slot, so
    # we don't race with active scraping jobs that already seated a different
    # cookie. Mutex so we don't read mid-PATCH from another caller.
    lock_token = acquire_validation_lock()
    if not lock_token:
        raise HTTPException(status_code=503, detail="Validation busy. Please try again.")
    try:
        return get_validation_client().check_linkedin_auth()
    except Exception as e:
        logger.error(f"check_linkedin_auth failed: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")
    finally:
        release_validation_lock(lock_token)


@router.patch("/auth", response_model=LinkedInAuthStatus)
def update_linkedin_auth(
    payload: UpdateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Route cookie PATCH to the dedicated validation slot + mutex so concurrent
    # users can't clobber each other's session cookie on a real scraping slot.
    lock_token = acquire_validation_lock()
    if not lock_token:
        raise HTTPException(status_code=503, detail="Validation busy. Please try again.")
    try:
        return get_validation_client().update_linkedin_session(payload.session_cookie)
    except Exception as e:
        logger.error(f"update_linkedin_session failed: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")
    finally:
        release_validation_lock(lock_token)


@router.get("/config")
def get_vayne_config(current_user: User = Depends(get_current_user)):
    """Frontend feature flags for the Vayne scraper UI.

    Fetched once on scraper-page mount (inside the page's initialLoading
    spinner) so the UI knows whether to render the live cookie-validation
    affordances. Toggled via the VAYNE_COOKIE_VALIDATION_ENABLED env var
    as a kill switch when Vayne's PATCH rate limit is exhausted.
    """
    return {
        "cookie_validation_enabled": settings.VAYNE_COOKIE_VALIDATION_ENABLED,
    }


@router.post("/validate-cookie", response_model=ValidateCookieResponse)
def validate_cookie(
    payload: ValidateCookieRequest,
    current_user: User = Depends(get_current_user),
):
    """Live validation for the Save Cookie flow.

    Synchronous: PATCHes the submitted cookie onto the dedicated validation
    slot, waits for Vayne's async LinkedIn-side check, then GETs the status.
    The entire sequence is serialized via a Redis mutex so concurrent validation
    requests don't clobber each other.

    When VAYNE_COOKIE_VALIDATION_ENABLED is false the call short-circuits with
    reason="disabled". This is belt-and-suspenders: the frontend normally
    doesn't call this endpoint when the flag is off, but a stale tab might.
    """
    if not settings.VAYNE_COOKIE_VALIDATION_ENABLED:
        return ValidateCookieResponse(valid=True, reason="disabled")
    return _validate_cookie_on_validation_slot(payload.linkedin_cookie)


@router.get("/credits", response_model=CreditsResponse)
def get_credits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_vayne_client().get_credits()
    except Exception as e:
        logger.error(f"get_credits failed: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.get("/daily-usage")
def get_daily_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's scraping usage in the last 24 hours, respecting manual resets."""
    from app.core.config import settings as app_settings
    from datetime import timedelta

    reset_row = db.execute(
        text("SELECT vayne_daily_usage_reset_at FROM users WHERE id = :uid"),
        {"uid": str(current_user.id)},
    ).fetchone()
    reset_at = reset_row.vayne_daily_usage_reset_at if reset_row else None

    result = db.execute(
        text("""
            SELECT COALESCE(SUM(estimated_leads), 0) as used
            FROM vayne_orders
            WHERE user_id = :uid
            AND status != 'failed'
            AND created_at >= GREATEST(
                NOW() - INTERVAL '24 hours',
                COALESCE(:reset_at, '1970-01-01'::timestamptz)
            )
        """),
        {"uid": str(current_user.id), "reset_at": reset_at},
    )
    row = result.fetchone()
    used = int(row.used) if row else 0
    limit = app_settings.VAYNE_PER_CLIENT_DAILY_LIMIT

    oldest_result = db.execute(
        text("""
            SELECT MIN(created_at) as oldest
            FROM vayne_orders
            WHERE user_id = :uid
            AND status != 'failed'
            AND created_at >= GREATEST(
                NOW() - INTERVAL '24 hours',
                COALESCE(:reset_at, '1970-01-01'::timestamptz)
            )
        """),
        {"uid": str(current_user.id), "reset_at": reset_at},
    )
    oldest_row = oldest_result.fetchone()
    resets_at = None
    if oldest_row and oldest_row.oldest:
        resets_at = (oldest_row.oldest + timedelta(hours=24)).isoformat()

    return {
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "resets_at": resets_at,
    }


@router.post("/daily-usage/reset")
def reset_daily_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reset the current user's daily scraping limit by setting a reset timestamp."""
    db.execute(
        text("UPDATE users SET vayne_daily_usage_reset_at = NOW() WHERE id = :uid"),
        {"uid": str(current_user.id)},
    )
    db.commit()
    logger.info(f"User {current_user.id} reset their daily scraping limit")
    return {"success": True, "message": "Daily scraping limit has been reset."}


class ResetWithTokenRequest(BaseModel):
    token: str


@router.post("/daily-usage/reset-with-token")
def reset_daily_usage_with_token(
    payload: ResetWithTokenRequest,
    db: Session = Depends(get_db),
):
    """Reset daily scraping limit using a signed token (from email link, no auth required)."""
    try:
        decoded = jwt.decode(payload.token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError as e:
        detail = "This reset link has expired. Please request a new one." if "expired" in str(e).lower() else "Invalid reset link."
        raise HTTPException(status_code=400, detail=detail)

    if decoded.get("purpose") != "reset_daily_limit":
        raise HTTPException(status_code=400, detail="Invalid reset link.")

    user_id = decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid reset link.")

    result = db.execute(
        text("UPDATE users SET vayne_daily_usage_reset_at = NOW() WHERE id = :uid RETURNING id"),
        {"uid": user_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="User not found.")

    db.commit()
    logger.info(f"User {user_id} reset their daily scraping limit via email token")
    return {"success": True, "message": "Your daily scraping limit has been reset successfully."}


@router.post("/validate-url", response_model=UrlValidationResponse)
def validate_url(
    payload: UrlValidationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Legacy endpoint. Vayne requires a valid cookie to be seated on the slot
    # before validate_url succeeds, so we route to the validation slot under
    # the same mutex that governs cookie PATCHes — otherwise a concurrent
    # PATCH from another user could invalidate the seat mid-call.
    lock_token = acquire_validation_lock()
    if not lock_token:
        raise HTTPException(status_code=503, detail="Validation busy. Please try again.")
    try:
        return get_validation_client().validate_url(payload.url)
    except Exception as e:
        logger.error(f"validate_url failed: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")
    finally:
        release_validation_lock(lock_token)


@router.post("/url-check", response_model=UrlValidationResponse)
def url_check(payload: UrlCheckRequest):
    lock_token = acquire_validation_lock()
    if not lock_token:
        return {
            "is_valid": False,
            "url": payload.sales_nav_url,
            "error": "Validation busy. Please try again.",
            "suggestion": None,
        }
    try:
        logger.info(f"URL check requested for: {payload.sales_nav_url}")
        result = get_validation_client().validate_url(payload.sales_nav_url)
        logger.info(f"URL check result: {result}")
        # Determine validity by checking if we got meaningful results from Vayne API
        is_valid = result.get('total') is not None and result.get('type') is not None
        return {
            "is_valid": is_valid,  # Use 'is_valid' to match frontend VayneUrlCheck type
            "url": payload.sales_nav_url,
            "search_type": result.get('type'),
            "estimated_results": result.get('total'),
            "filters_detected": result.get('filters'),
            "error": None if is_valid else "Invalid URL or API error",
            "suggestion": None
        }
    except Exception as e:
        logger.error(f"URL check failed: {e}")
        return {
            "is_valid": False,
            "url": payload.sales_nav_url,
            "error": "Error. Please try again later.",
            "suggestion": "Please check the URL and try again"
        }
    finally:
        release_validation_lock(lock_token)


@router.post("/orders", response_model=CreateOrderResponse)
def create_order(
    payload: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new Vayne order (queued for processing).
    
    Orders are stored locally with status='queued' and processed sequentially
    by the queue worker. This prevents cookie conflicts when multiple orders
    are submitted back-to-back.
    
    The queue worker will:
    1. Pick up the oldest queued order when no active orders exist
    2. Update the LinkedIn cookie with Vayne API
    3. Create the scraping order with Vayne API
    4. Update the database with vayne_order_id and status
    """
    try:
        if not payload.sales_nav_url:
            raise HTTPException(status_code=400, detail="Sales Navigator URL is required")

        # Format-check URL with the same regex the frontend uses. We do NOT
        # call Vayne's validate_url here — estimated_leads is discovered later
        # by the queue worker (which has to push the cookie onto its own slot
        # anyway). Keeps this endpoint's latency budget down to the cookie
        # validation round-trip.
        if not SALES_NAV_URL_REGEX.search(payload.sales_nav_url.strip()):
            raise HTTPException(
                status_code=400,
                detail="Please provide a valid LinkedIn Sales Navigator URL (search, list, or lead).",
            )

        # Full live cookie validation. No caching — every order creation
        # treats the cookie as new, by explicit product decision. Belt-and-
        # suspenders alongside the client-side Save Cookie flow: prevents
        # orders from entering the queue with a stale / swapped-out cookie.
        cookie_for_validation = (payload.linkedin_cookie or "").strip()
        if not cookie_for_validation:
            raise HTTPException(
                status_code=400,
                detail="LinkedIn cookie is required. Please save a valid cookie first.",
            )

        # Kill switch: when VAYNE_COOKIE_VALIDATION_ENABLED is false we skip the
        # live validation entirely so orders can flow while Vayne's PATCH rate
        # limit is exhausted. Worker will catch bad cookies at scrape time.
        if settings.VAYNE_COOKIE_VALIDATION_ENABLED:
            validation = _validate_cookie_on_validation_slot(cookie_for_validation)
            if not validation.valid:
                if validation.reason == "rejected":
                    raise HTTPException(
                        status_code=400,
                        detail="Your LinkedIn session cookie was rejected. Please provide a valid LinkedIn cookie and try again.",
                    )
                # "unavailable" or any other indeterminate outcome
                raise HTTPException(
                    status_code=503,
                    detail="We couldn't validate your cookie right now. Please try again in a moment.",
                )

        logger.info(f"Creating queued order for user {current_user.id}")
        logger.info(f"   URL: {payload.sales_nav_url[:50]}...")
        logger.info(f"   Targeting: {payload.targeting or 'Untitled Order'}")

        targeting = payload.targeting.strip() if payload.targeting and payload.targeting.strip() else None
        
        order = VayneOrder(
            user_id=current_user.id,
            vayne_order_id=None,
            status="queued",
            sales_nav_url=payload.sales_nav_url,
            url=payload.sales_nav_url,
            linkedin_cookie=payload.linkedin_cookie or "",
            targeting=targeting,
            auto_enrich=True,
        )
        
        db.add(order)
        db.commit()
        db.refresh(order)

        if not order.targeting:
            order.targeting = str(order.id)
            db.commit()
            db.refresh(order)
        
        logger.info(f"✅ Order queued successfully - id: {order.id}, status: {order.status}")
        
        return {
            "success": True,
            "order_id": str(order.id),
            "vayne_order_id": "",
            "status": order.status,
            "message": "Order queued successfully. It will be processed when the scraper is available.",
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.get("/orders")
def list_orders(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all orders for current user from database with enrichment job info for unified pipeline."""
    try:
        from sqlalchemy.orm import aliased
        
        JobAlias = aliased(Job)
        
        query = db.query(VayneOrder, JobAlias).outerjoin(
            JobAlias, VayneOrder.enrichment_job_id == JobAlias.id
        ).filter(VayneOrder.user_id == current_user.id)
        
        if status:
            query = query.filter(VayneOrder.status == status)
        
        total = query.count()
        
        results = query.order_by(VayneOrder.created_at.desc()).offset(offset).limit(limit).all()
        
        order_list = []
        for order, enrich_job in results:
            enrich_total = enrich_job.total_leads if enrich_job else None
            enrich_processed = enrich_job.processed_leads if enrich_job else None
            enrich_progress = 0
            if enrich_total and enrich_total > 0 and enrich_processed:
                enrich_progress = round(enrich_processed / enrich_total * 100)
            
            display_completed_at = order.completed_at
            if enrich_job and enrich_job.completed_at:
                display_completed_at = enrich_job.completed_at
            
            order_list.append({
                "id": str(order.id),
                "user_id": str(order.user_id),
                "vayne_order_id": order.vayne_order_id,
                "status": order.status,
                "targeting": getattr(order, 'targeting', None),
                "leads_found": getattr(order, 'leads_found', 0) or 0,
                "leads_qualified": getattr(order, 'leads_qualified', 0) or 0,
                "progress_percentage": getattr(order, 'progress_percentage', 0) or 0,
                "file_url": getattr(order, 'file_url', None),
                "failure_reason": getattr(order, 'failure_reason', None),
                "credits_charged": getattr(order, 'credits_charged', 0) or 0,
                "created_at": order.created_at.isoformat() if order.created_at else None,
                "completed_at": display_completed_at.isoformat() if display_completed_at else None,
                "auto_enrich": getattr(order, 'auto_enrich', False),
                "enrichment_job_id": str(order.enrichment_job_id) if order.enrichment_job_id else None,
                "enrichment_status": enrich_job.status if enrich_job else None,
                "enrichment_total_leads": enrich_total or 0,
                "enrichment_processed_leads": enrich_processed or 0,
                "enrichment_valid_emails_found": enrich_job.valid_emails_found if enrich_job else 0,
                "enrichment_catchall_emails_found": enrich_job.catchall_emails_found if enrich_job else 0,
                "enrichment_progress_percentage": enrich_progress,
            })
        
        return {
            "orders": order_list,
            "total": total,
        }
    except Exception as e:
        logger.error(f"Error listing orders: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.get("/orders/{order_id}", response_model=OrderStatusResponse)
def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get order status from database"""
    try:
        order = db.query(VayneOrder).filter(
            VayneOrder.id == order_id,
            VayneOrder.user_id == current_user.id
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        return {
            "order_id": str(order.id),
            "status": order.status,
            "credits_used": order.credits_used,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting order: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.get("/orders/{order_id}/poll-status")
def poll_order_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Poll Vayne API for live order status (UI-only update, does NOT update database).
    This endpoint is for frontend polling to display real-time status without
    affecting the database status that the vayne queue worker relies on.
    """
    try:
        # Get order from database to find vayne_order_id
        order = db.query(VayneOrder).filter(
            VayneOrder.id == order_id,
            VayneOrder.user_id == current_user.id
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # If order is already completed or failed in DB, return that status
        if order.status in ["completed", "failed"]:
            return {
                "order_id": str(order.id),
                "vayne_order_id": order.vayne_order_id,
                "status": order.status,
                "scraping_status": "finished" if order.status == "completed" else "failed",
                "leads_found": getattr(order, 'leads_found', 0) or 0,
                "leads_qualified": getattr(order, 'leads_qualified', 0) or 0,
                "progress_percentage": 100 if order.status == "completed" else 0,
                "from_database": True,
            }
        
        # Poll Vayne API for live status
        if not order.vayne_order_id:
            logger.warning(f"Order {order_id} has no vayne_order_id")
            return {
                "order_id": str(order.id),
                "vayne_order_id": None,
                "status": order.status,
                "scraping_status": None,
                "leads_found": 0,
                "leads_qualified": 0,
                "progress_percentage": 0,
                "from_database": True,
            }
        
        try:
            vayne_response = get_vayne_client().get_order(order.vayne_order_id)
            logger.info(f"Vayne API poll response for order {order_id}: {vayne_response}")
            
            # Extract status from Vayne response
            vayne_order = vayne_response.get("order", vayne_response)
            scraping_status = vayne_order.get("status", "unknown")  # e.g. "initialization", "scraping", "finished", "failed"
            leads_found = vayne_order.get("leads_found", 0) or 0
            leads_qualified = vayne_order.get("leads_qualified", 0) or 0
            
            # Calculate progress percentage based on scraping_status
            progress_map = {
                "initialization": 10,
                "scraping": 50,
                "finished": 100,
                "failed": 0,
            }
            progress_percentage = progress_map.get(scraping_status, 25)
            
            # Map Vayne scraping_status to our internal status for UI display
            # NOTE: This is for UI display only - does NOT update database
            ui_status = order.status  # Keep existing DB status
            if scraping_status == "finished":
                ui_status = "completed"
            elif scraping_status == "failed":
                ui_status = "failed"
            elif scraping_status in ["initialization", "scraping"]:
                ui_status = "processing"
            
            return {
                "order_id": str(order.id),
                "vayne_order_id": order.vayne_order_id,
                "status": ui_status,  # Mapped status for UI
                "scraping_status": scraping_status,  # Raw Vayne status
                "leads_found": leads_found,
                "leads_qualified": leads_qualified,
                "progress_percentage": progress_percentage,
                "from_database": False,
            }
        except Exception as vayne_error:
            logger.error(f"Failed to poll API for order {order_id}: {vayne_error}")
            return {
                "order_id": str(order.id),
                "vayne_order_id": order.vayne_order_id,
                "status": order.status,
                "scraping_status": None,
                "leads_found": getattr(order, 'leads_found', 0) or 0,
                "leads_qualified": getattr(order, 'leads_qualified', 0) or 0,
                "progress_percentage": 0,
                "from_database": True,
                "error": "Error. Please try again later.",
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error polling order status: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark an order as deleted (soft delete).
    
    The order is not physically removed from the database - its status is 
    updated to 'deleted'. This ensures proper tracking for queue management
    and billing purposes.
    """
    try:
        order = db.query(VayneOrder).filter(
            VayneOrder.id == order_id,
            VayneOrder.user_id == current_user.id
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Update status to 'deleted' instead of physically deleting
        old_status = order.status
        order.status = "deleted"
        db.commit()
        
        logger.info(f"Order {order_id} marked as deleted (was: {old_status})")
        
        return {"message": "Order deleted successfully", "order_id": str(order_id)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting order: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cancel a scraping order.
    
    Sets the order status to 'cancelled'. This is useful for stopping
    queued orders before they are processed, or marking active orders
    as cancelled (note: active scraping jobs on Vayne cannot be stopped).
    """
    try:
        order = db.query(VayneOrder).filter(
            VayneOrder.id == order_id,
            VayneOrder.user_id == current_user.id
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Check if order can be cancelled
        if order.status in ("completed", "deleted", "cancelled"):
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot cancel order with status '{order.status}'"
            )
        
        old_status = order.status
        order.status = "cancelled"
        db.commit()
        
        logger.info(f"Order {order_id} cancelled (was: {old_status})")
        
        return {
            "message": "Order cancelled successfully",
            "order_id": str(order_id),
            "previous_status": old_status,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling order: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.get("/orders/{order_id}/download")
def download_order_csv(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download CSV file for a completed order"""
    try:
        order = db.query(VayneOrder).filter(
            VayneOrder.id == order_id,
            VayneOrder.user_id == current_user.id
        ).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        if order.status != "completed":
            raise HTTPException(status_code=400, detail="Order is not yet completed")
        
        csv_content = None
        
        # Try R2 first (n8n stores CSV here)
        r2_key = f"vayne-orders/{order.id}/export.csv"
        try:
            r2_response = s3_client.get_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=r2_key
            )
            csv_content = r2_response['Body'].read()
            logger.info(f"Downloaded CSV from R2: {r2_key}")
        except Exception:
            pass
        
        # Fall back to file_url if R2 didn't work
        if not csv_content:
            file_url = getattr(order, 'file_url', None)
            if not file_url:
                raise HTTPException(status_code=404, detail="CSV file not available yet. Please try again later.")
            try:
                response = httpx.get(file_url, timeout=60.0)
                response.raise_for_status()
                csv_content = response.content
            except Exception as e:
                logger.error(f"Failed to fetch CSV from file_url: {str(e)}")
                raise HTTPException(status_code=404, detail="Failed to download CSV file. Please try again later.")
        
        targeting = getattr(order, 'targeting', None) or ''
        safe_targeting = "".join(c for c in targeting if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
        base_name = safe_targeting.replace(' ', '_') if safe_targeting else str(order_id)[:8]
        filename = f"results-{base_name}.csv"
        
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(csv_content)),
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading order CSV: {e}")
        raise HTTPException(status_code=500, detail="Error. Please try again later.")


@router.post("/webhook")
async def webhook(
    request: Request,
    token_valid: bool = Depends(verify_webhook_token),
):
    """Generic webhook endpoint"""
    try:
        body = await request.json()
        logger.info(f"Webhook received: {body}")
        return {"status": "received"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.post("/webhook/n8n-csv-callback")
async def n8n_csv_callback(
    request: Request,
    token_valid: bool = Depends(verify_webhook_token),
    db: Session = Depends(get_db),
):
    """
    N8N CSV callback webhook
    Receives exported CSV data from N8N workflow
    """
    try:
        body = await request.json()
        logger.info(f"N8N callback received")
        
        # Extract vayne_order_id from body
        vayne_order_id = body.get("vayne_order_id")
        if not vayne_order_id:
            raise HTTPException(status_code=400, detail="Missing vayne_order_id")
        
        # Verify user exists
        user_id = body.get("user_id")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Use data directly from payload - no need to query VayneOrder
        # This avoids database schema issues and works with cached data
        logger.info(f"Using webhook data directly - no database query needed")
        
        # Query the order from the database
        order = db.query(VayneOrder).filter(VayneOrder.vayne_order_id == vayne_order_id).first()
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order with vayne_order_id {vayne_order_id} not found"
            )
        
        # Extract CSV data
        csv_data = body.get("csv_data")
        
        if not csv_data:
            raise HTTPException(status_code=400, detail="Missing csv_data")
        
        # Count actual leads from CSV rows (minus header)
        csv_lines = csv_data.strip().splitlines()
        actual_leads = max(0, len(csv_lines) - 1)
        logger.info(f"CSV contains {actual_leads} leads ({len(csv_lines)} lines including header)")
        
        # Store CSV in R2
        csv_file_path = f"vayne-orders/{order.id}/export.csv"
        logger.info(f"Storing CSV in R2 at: {csv_file_path}")
        
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path,
            Body=csv_data,
            ContentType="text/csv"
        )
        
        # Update order status and metadata
        order.status = "completed"
        if not order.completed_at:
            order.completed_at = datetime.utcnow()
        
        order.leads_found = actual_leads
        
        # Reconcile credits: refund difference between estimated and actual leads
        credits_charged = order.credits_charged or 0
        if credits_charged > 0 and actual_leads < credits_charged:
            refund_amount = credits_charged - actual_leads
            from sqlalchemy import text as sa_text
            db.execute(
                sa_text("UPDATE users SET credits = credits + :refund WHERE id = :uid"),
                {"refund": refund_amount, "uid": str(order.user_id)}
            )
            order.credits_charged = actual_leads
            logger.info(f"Reconciled credits: reserved {credits_charged}, actual {actual_leads}, refunded {refund_amount}")
        
        # Auto-create enrichment job if this is a unified pipeline order
        enrichment_job_id = None
        if getattr(order, 'auto_enrich', False) and not order.enrichment_job_id:
            try:
                user_plan = getattr(user, 'plan', 'trial') or 'trial'
                enrichment_job = Job(
                    user_id=order.user_id,
                    status="pending",
                    job_type="enrichment",
                    source="Sales Nav",
                    original_filename=f"sales-nav-{order.id}.csv",
                    job_name=order.targeting or str(order.id),
                    input_file_path=csv_file_path,
                    total_leads=0,
                    processed_leads=0,
                    valid_emails_found=0,
                    catchall_emails_found=0,
                    cost_in_credits=order.credits_charged or 0,
                    plan_at_creation=user_plan,
                )
                db.add(enrichment_job)
                db.flush()
                order.enrichment_job_id = enrichment_job.id
                enrichment_job_id = str(enrichment_job.id)
                logger.info(f"Created enrichment job {enrichment_job.id} for order {order.id} (credits_reserved={order.credits_charged})")
            except Exception as enrich_err:
                logger.error(f"Failed to create enrichment job for order {order.id}: {enrich_err}")
        
        db.commit()
        db.refresh(order)
        
        # Queue enrichment job to Redis (outside DB transaction for idempotency)
        if enrichment_job_id and redis_client:
            try:
                redis_client.rpush("enrichment-job-creation", enrichment_job_id)
                logger.info(f"Queued enrichment job {enrichment_job_id} to Redis")
            except Exception as redis_err:
                logger.error(f"Failed to queue enrichment job {enrichment_job_id} to Redis: {redis_err}")
        
        logger.info(f"CSV stored in R2 successfully, order {order.id} completed")
        return {
            "status": "success",
            "message": "CSV processed and stored",
            "order_id": str(order.id),
            "enrichment_job_id": enrichment_job_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"N8N callback error: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")
