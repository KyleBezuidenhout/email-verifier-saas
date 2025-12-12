"""
Vayne API Endpoints (Sales Nav Scraper)

Backend proxy for Vayne API calls to:
- Secure API keys
- Centralize logic
- Control credits
- Store order history
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta
import io
import csv
import boto3
import redis
import logging
import asyncio
import httpx

from app.db.session import get_db
from app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Constants for stuck order detection
STUCK_ORDER_THRESHOLD_HOURS = 24  # Orders older than this with pending/processing status are considered stuck
from app.models.user import User
from app.models.vayne_order import VayneOrder
from app.models.job import Job
from app.models.lead import Lead
from app.services.permutation import generate_email_permutations, normalize_domain
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.schemas.vayne import (
    VayneAuthStatusResponse,
    VayneAuthUpdateRequest,
    VayneAuthUpdateResponse,
    VayneCreditsResponse,
    VayneUrlCheckRequest,
    VayneUrlCheckResponse,
    VayneOrderCreateRequest,
    VayneOrderCreateResponse,
    VayneOrderResponse,
    VayneOrderListResponse,
    VayneWebhookPayload,
    VayneWebhookBody,
    VayneWebhookRequest,
    VayneExportInfo,
    VayneExportsInfo,
)
from app.services.vayne_client import get_vayne_client
from app.services.vayne_enrichment import create_enrichment_job_from_order, create_placeholder_enrichment_job
from app.core.config import settings

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Initialize Redis client for order queue and webhook locking
redis_client = redis.from_url(settings.REDIS_URL)

router = APIRouter()

# ============================================
# REDIS-BASED SEQUENTIAL PROCESSING LOCK
# ============================================
# Ensures webhooks are processed one at a time to avoid race conditions
WEBHOOK_LOCK_KEY = "vayne:webhook:lock"
WEBHOOK_LOCK_TIMEOUT = 300  # 5 minutes max processing time per webhook


async def acquire_webhook_lock(order_id: str, timeout: int = WEBHOOK_LOCK_TIMEOUT) -> bool:
    """
    Acquire a Redis lock for processing a webhook.
    Returns True if lock acquired, False if another process is handling it.
    """
    lock_key = f"{WEBHOOK_LOCK_KEY}:{order_id}"
    try:
        # Try to set lock with expiration (NX = only if not exists)
        acquired = redis_client.set(
            lock_key,
            datetime.utcnow().isoformat(),
            ex=timeout,
            nx=True
        )
        return bool(acquired)
    except Exception as e:
        logger.error(f"Failed to acquire webhook lock for order {order_id}: {e}")
        return False


def release_webhook_lock(order_id: str):
    """Release the Redis lock for a webhook."""
    lock_key = f"{WEBHOOK_LOCK_KEY}:{order_id}"
    try:
        redis_client.delete(lock_key)
    except Exception as e:
        logger.warning(f"Failed to release webhook lock for order {order_id}: {e}")


async def process_webhook_sequentially(order_id: str, process_func):
    """
    Process a webhook with sequential locking.
    If lock cannot be acquired, waits briefly and retries once.
    """
    # Try to acquire lock
    if await acquire_webhook_lock(order_id):
        try:
            # Process the webhook
            return await process_func()
        finally:
            # Always release lock
            release_webhook_lock(order_id)
    else:
        # Lock already held - another process is handling this order
        logger.info(f"Webhook for order {order_id} is already being processed by another handler")
        # Wait a moment and check if processing completed
        await asyncio.sleep(1)
        # If still locked after wait, return success (assume other handler succeeded)
        if not await acquire_webhook_lock(order_id, timeout=1):
            return {"status": "ok", "message": "Webhook already being processed"}
        else:
            # Lock released, process it now
            try:
                return await process_func()
            finally:
                release_webhook_lock(order_id)


@router.get("/auth", response_model=VayneAuthStatusResponse)
async def get_auth_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get LinkedIn authentication status for current user."""
    # Check if user has a stored LinkedIn cookie
    latest_order = db.query(VayneOrder).filter(
        VayneOrder.user_id == current_user.id,
        VayneOrder.linkedin_cookie.isnot(None)
    ).order_by(desc(VayneOrder.created_at)).first()
    
    if not latest_order or not latest_order.linkedin_cookie:
        return VayneAuthStatusResponse(is_connected=False)
    
    # Check with Vayne API if cookie is still valid
    try:
        vayne_client = get_vayne_client()
        auth_check = await vayne_client.check_authentication(latest_order.linkedin_cookie)
        
        # Adjust based on actual Vayne API response structure
        is_connected = auth_check.get("is_connected", False)
        linkedin_email = auth_check.get("linkedin_email")
        
        return VayneAuthStatusResponse(
            is_connected=is_connected,
            linkedin_email=linkedin_email
        )
    except Exception as e:
        # If check fails, assume not connected
        return VayneAuthStatusResponse(is_connected=False)


@router.patch("/auth", response_model=VayneAuthUpdateResponse)
async def update_auth(
    auth_data: VayneAuthUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update LinkedIn session cookie for current user (direct API approach - no queuing)."""
    try:
        vayne_client = get_vayne_client()
        result = await vayne_client.update_authentication(auth_data.linkedin_cookie)
        
        return VayneAuthUpdateResponse(message=result.get("message", "LinkedIn authentication updated successfully"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update authentication: {str(e)}"
        )


@router.get("/credits", response_model=VayneCreditsResponse)
async def get_credits(
    current_user: User = Depends(get_current_user)
):
    """Get available credits and usage limits."""
    try:
        vayne_client = get_vayne_client()
        # Add timeout to prevent hanging (10 seconds)
        credits_data = await asyncio.wait_for(
            vayne_client.get_credits(),
            timeout=10.0
        )
        
        # Map Vayne API response to our schema
        # Vayne API returns: credit_available, daily_limit_leads, daily_limit_accounts, enrichment_credits
        return VayneCreditsResponse(
            available_credits=credits_data.get("credit_available", 0),
            leads_scraped_today=0,  # Not provided by Vayne API, would need separate tracking
            daily_limit=credits_data.get("daily_limit_leads", 0),
            subscription_plan=credits_data.get("subscription_plan"),
            subscription_expires_at=credits_data.get("subscription_expires_at"),
        )
    except asyncio.TimeoutError:
        logger.error("Timeout fetching credits from Vayne API")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timeout fetching credits. Please try again."
        )
    except Exception as e:
        logger.error(f"Failed to fetch credits: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch credits: {str(e)}"
        )


@router.post("/url-check", response_model=VayneUrlCheckResponse)
async def check_url(
    url_data: VayneUrlCheckRequest,
    current_user: User = Depends(get_current_user)
):
    """Validate Sales Navigator URL and get estimated results."""
    try:
        vayne_client = get_vayne_client()
        check_result = await vayne_client.check_url(url_data.sales_nav_url)
        
        # Client now returns: { "is_valid": bool, "estimated_results": int, "type": str, "error": str }
        return VayneUrlCheckResponse(
            is_valid=check_result.get("is_valid", False),
            estimated_results=check_result.get("estimated_results"),
            error=check_result.get("error"),
        )
    except Exception as e:
        return VayneUrlCheckResponse(
            is_valid=False,
            error=str(e)
        )


@router.post("/orders", response_model=VayneOrderCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_data: VayneOrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new scraping order.
    Order status is set to "processing" immediately.
    Webhook will handle completion and automatically trigger enrichment.
    """
    # Require cookie for each order
    if not order_data.linkedin_cookie or not order_data.linkedin_cookie.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LinkedIn session cookie is required for each scraping order."
        )
    
    try:
        vayne_client = get_vayne_client()
        
        # Step 1: Update LinkedIn session cookie with Vayne (required before URL check)
        try:
            cookie_response = await vayne_client.update_authentication(order_data.linkedin_cookie)
            logger.info(f"LinkedIn authentication updated for user {current_user.id}")
        except Exception as auth_error:
            error_msg = str(auth_error).lower()
            if "401" in error_msg or "unauthorized" in error_msg or "invalid" in error_msg or "expired" in error_msg:
                logger.warning(f"LinkedIn cookie authentication failed for user {current_user.id}: {auth_error}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="LinkedIn session cookie is invalid or expired. Please get a fresh li_at cookie from LinkedIn and try again."
                )
            raise
        
        # Step 2: Validate the Sales Navigator URL
        url_check = await vayne_client.check_url(order_data.sales_nav_url)
        
        if not url_check.get("is_valid", False) or url_check.get("estimated_results", 0) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=url_check.get("error", "The provided Sales Navigator URL is invalid or contains no results")
            )
        
        estimated_leads = url_check.get("estimated_results", 0)
        is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
        
        if not is_admin and current_user.credits < estimated_leads:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient credits. You have {current_user.credits} credits but this order requires approximately {estimated_leads} credits."
            )
        
        # Step 3: Create the scraping order with Vayne API
        vayne_order = await vayne_client.create_order(
            sales_nav_url=order_data.sales_nav_url,
            linkedin_cookie=order_data.linkedin_cookie
        )
        
        # Store order in database
        order = VayneOrder(
            user_id=current_user.id,
            sales_nav_url=order_data.sales_nav_url,
            export_format="advanced",  # Hardcoded per specification
            only_qualified=False,  # Hardcoded per specification
            linkedin_cookie=order_data.linkedin_cookie,
            status="processing",  # Set to processing immediately - webhook will update to completed
            vayne_order_id=str(vayne_order.get("id", "")),
            leads_found=estimated_leads,
            targeting=order_data.targeting,
        )
        db.add(order)
        
        # Deduct credits immediately (1 credit per lead)
        if not is_admin:
            current_user.credits -= estimated_leads
        
        db.commit()
        db.refresh(order)
        
        # Immediately create and queue placeholder enrichment job
        # This allows job queuing to start as soon as client clicks "start scraping"
        # Webhook will update the job with CSV data when scraping completes
        try:
            placeholder_job = await create_placeholder_enrichment_job(order, db)
            if placeholder_job:
                logger.info(f"✅ Created placeholder enrichment job {placeholder_job.id} for order {order.id}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to create placeholder enrichment job for order {order.id}: {e}")
            # Don't fail the order creation if job creation fails
        
        return VayneOrderCreateResponse(
            success=True,
            order_id=str(order.id),
            status="pending",
            message="Scraping order created successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create scraping order. Please try again."
        )


async def _sync_order_with_vayne(order: VayneOrder, db: Session) -> bool:
    """Sync a single order with Vayne API. Returns True if updated."""
    # Sync if order has vayne_order_id and is not already completed/failed
    if not order.vayne_order_id or order.status == "failed":
        return False
    
    # Also sync if status is "processing" and might be ready to complete
    if order.status == "completed":
        # Already completed - no need to sync
        return False
    
    try:
        vayne_client = get_vayne_client()
        vayne_order = await vayne_client.get_order(order.vayne_order_id)
        
        # vayne_client.get_order() already maps scraping_status to status
        vayne_status = vayne_order.get("status", order.status)
        
        # Update order if status changed or if we have new data
        needs_update = False
        
        # If Vayne says "finished", verify export is available before marking as completed
        if vayne_status == "completed":
            # Try to verify export is available (use quick check, not full retry)
            try:
                # Quick check if export is ready (don't wait with full retry)
                file_url = await vayne_client.check_export_ready(order.vayne_order_id, order.export_format)
                if file_url:
                    # Export is ready - mark as completed
                    new_status = "completed"
                    if order.status != "completed":
                        order.status = "completed"
                        needs_update = True
                    if not order.completed_at:
                        order.completed_at = datetime.utcnow()
                        needs_update = True
                    print(f"✅ Order {order.id} export verified via sync - marking as completed")
                else:
                    # Export not ready yet - keep as processing
                    print(f"⏳ Order {order.id} export not ready yet via sync. Keeping status as processing.")
                    new_status = "processing"
                    if order.status != "processing":
                        order.status = "processing"
                        needs_update = True
            except Exception as export_error:
                # Export check failed - keep as processing
                print(f"⏳ Order {order.id} export check failed via sync: {export_error}. Keeping status as processing.")
                new_status = "processing"
                if order.status != "processing":
                    order.status = "processing"
                    needs_update = True
        else:
            # For other statuses, use Vayne's status directly
            new_status = vayne_status
            if new_status != order.status:
                order.status = new_status
                needs_update = True
        
        # Update progress (vayne_client already calculates this)
        new_progress = vayne_order.get("progress_percentage", order.progress_percentage)
        if new_progress != order.progress_percentage:
            order.progress_percentage = new_progress
            needs_update = True
        
        # Update leads_found (vayne_client already maps this)
        new_leads_found = vayne_order.get("leads_found", order.leads_found)
        if new_leads_found != order.leads_found:
            order.leads_found = new_leads_found
            needs_update = True
        
        # Update leads_qualified
        new_leads_qualified = vayne_order.get("leads_qualified", order.leads_qualified)
        if new_leads_qualified != order.leads_qualified:
            order.leads_qualified = new_leads_qualified
            needs_update = True
        
        if needs_update:
            db.commit()
            db.refresh(order)
            print(f"✅ Synced order {order.id} with Vayne API: status={new_status}, progress={new_progress}%, leads={new_leads_found}")
            return True
        return False
    except Exception as e:
        # Don't fail the request if sync fails - just log it
        print(f"⚠️ Failed to sync order {order.id} with Vayne API: {e}")
        return False


@router.get("/orders/{order_id}/status")
async def get_order_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get order status - matches specification format."""
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    order = db.query(VayneOrder).filter(
        VayneOrder.id == order_uuid,
        VayneOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Call Vayne API directly if we have a vayne_order_id
    if order.vayne_order_id:
        try:
            vayne_client = get_vayne_client()
            vayne_order = await vayne_client.get_order(order.vayne_order_id)
            
            # Get scraping_status directly from Vayne API
            scraping_status = vayne_order.get("scraping_status", "initialization")
            
            # Map Vayne scraping_status to our status values
            status_mapping = {
                "initialization": "pending",
                "scraping": "processing",
                "finished": "completed",
                "failed": "failed"
            }
            mapped_status = status_mapping.get(scraping_status, "pending")
            
            # Get scraped, total, matching from Vayne API
            scraped = vayne_order.get("scraped", 0)
            total = vayne_order.get("total", 0)
            matching = vayne_order.get("matching", 0)
            
            # Calculate progress percentage
            progress_percentage = int((scraped / total) * 100) if total > 0 else 0
            
            # Update database with latest status
            if mapped_status != order.status and order.status not in ["completed", "failed"]:
                order.status = mapped_status
                order.progress_percentage = progress_percentage
                order.leads_found = matching if matching > 0 else total
                order.leads_qualified = matching if order.only_qualified else matching
                if mapped_status == "completed" and not order.completed_at:
                    order.completed_at = datetime.utcnow()
                db.commit()
            
            return {
                "success": True,
                "order_id": str(order.id),
                "status": mapped_status,
                "scraped": scraped,
                "total": total,
                "matching": matching,
                "scraping_status": scraping_status,
                "progress_percentage": progress_percentage
            }
        except Exception as e:
            # If Vayne API call fails, use database values
            print(f"⚠️ Failed to get order from Vayne API: {e}")
    
    # Fallback to database values
    return {
        "success": True,
        "order_id": str(order.id),
        "status": order.status,
        "scraped": order.progress_percentage or 0,
        "total": order.leads_found or 0,
        "matching": order.leads_qualified or 0,
        "scraping_status": "initialization",
        "progress_percentage": order.progress_percentage or 0
    }


@router.get("/orders/{order_id}", response_model=VayneOrderResponse)
async def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get order status and details - always calls Vayne API directly for real-time status."""
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    order = db.query(VayneOrder).filter(
        VayneOrder.id == order_uuid,
        VayneOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Always call Vayne API directly if we have a vayne_order_id
    scraping_status = None
    vayne_progress = order.progress_percentage
    vayne_leads_found = order.leads_found
    exports_info = None
    
    if order.vayne_order_id:
        try:
            vayne_client = get_vayne_client()
            vayne_order = await vayne_client.get_order(order.vayne_order_id)
            
            # Get scraping_status directly from Vayne API
            scraping_status = vayne_order.get("scraping_status", "initialization")
            
            # Map Vayne statuses to our DB schema values: pending, processing, completed, failed
            status_mapping = {
                "initialization": "pending",
                "scraping": "processing",
                "finished": "completed",
                "failed": "failed"
            }
            mapped_status = status_mapping.get(scraping_status, "pending")
            
            # Update progress and leads from Vayne API
            vayne_progress = vayne_order.get("progress_percentage", order.progress_percentage)
            vayne_leads_found = vayne_order.get("leads_found", order.leads_found)
            
            # Extract exports information from Vayne API response
            vayne_exports = vayne_order.get("exports", {})
            if vayne_exports:
                simple_export = vayne_exports.get("simple", {})
                advanced_export = vayne_exports.get("advanced", {})
                
                # Only create exports_info if at least one export exists
                if simple_export or advanced_export:
                    exports_info = VayneExportsInfo(
                        simple=VayneExportInfo(
                            status=simple_export.get("status", ""),
                            file_url=simple_export.get("file_url")
                        ) if simple_export and simple_export.get("status") else None,
                        advanced=VayneExportInfo(
                            status=advanced_export.get("status", ""),
                            file_url=advanced_export.get("file_url")
                        ) if advanced_export and advanced_export.get("status") else None
                    )
            
            # Update database if status changed (but keep scraping_status for frontend)
            if mapped_status != order.status and order.status not in ["completed", "failed"]:
                order.status = mapped_status
                order.progress_percentage = vayne_progress
                order.leads_found = vayne_leads_found
                if mapped_status == "completed" and not order.completed_at:
                    order.completed_at = datetime.utcnow()
                db.commit()
        except Exception as e:
            # If Vayne API call fails, use database values
            print(f"⚠️ Failed to get order from Vayne API: {e}")
            scraping_status = None
    
    return VayneOrderResponse(
        id=str(order.id),
        status=order.status,
        scraping_status=scraping_status,  # Direct from Vayne API
        vayne_order_id=order.vayne_order_id,  # So frontend knows when worker has processed it
        sales_nav_url=order.sales_nav_url,
        export_format=order.export_format,
        only_qualified=order.only_qualified,
        leads_found=vayne_leads_found or order.leads_found,
        leads_qualified=order.leads_qualified,
        progress_percentage=vayne_progress or order.progress_percentage,
        estimated_completion=order.estimated_completion,
        created_at=order.created_at.isoformat(),
        completed_at=order.completed_at.isoformat() if order.completed_at else None,
        csv_file_path=order.csv_file_path,
        exports=exports_info,
    )


@router.post("/orders/{order_id}/export")
async def export_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export order results as CSV and store in R2. Only called when scraping is finished or completed."""
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    order = db.query(VayneOrder).filter(
        VayneOrder.id == order_uuid,
        VayneOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    if not order.vayne_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order has not been submitted to Vayne yet"
        )
    
    # First check database status - if already completed, we can proceed
    # If status is "processing" or "pending", we need to verify with Vayne API
    db_status = order.status
    scraping_status = None
    vayne_client = get_vayne_client()
    
    # Only call Vayne API if status is not "completed" in database
    if db_status != "completed":
        try:
            # Verify with Vayne API that scraping is finished
            vayne_order = await vayne_client.get_order(order.vayne_order_id)
            scraping_status = vayne_order.get("scraping_status", "initialization")
            
            # Only proceed if Vayne confirms status is "finished"
            if scraping_status != "finished":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Order scraping is not finished yet. Current status: {scraping_status}. Please wait for the scraping job to complete before exporting."
                )
        except HTTPException:
            raise
        except Exception as e:
            # If Vayne API call fails and status is not completed in DB, reject the request
            # This prevents calling export endpoint before job is ready
            error_msg = str(e)
            if "Max retries exceeded" in error_msg:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Unable to verify order status with Vayne API. The scraping job may still be in progress. Please wait for the job to finish (this can take up to 30 minutes for large jobs) and try again later. Current database status: {db_status}"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to check order status: {str(e)}. Please ensure the scraping job has finished before exporting."
            )
    else:
        # Status is "completed" in DB, so we can proceed
        # Optionally verify with Vayne API, but don't fail if it's unavailable
        try:
            vayne_order = await vayne_client.get_order(order.vayne_order_id)
            scraping_status = vayne_order.get("scraping_status", "finished")
        except Exception as e:
            # If Vayne API fails but DB says completed, log warning but proceed
            logger.warning(f"Failed to verify order {order.id} with Vayne API, but DB status is completed. Proceeding with export. Error: {e}")
            scraping_status = "finished"  # Assume finished if DB says completed
    
    # Helper function to extract exports info from Vayne response
    def get_exports_info(exports_data):
        if not exports_data:
            return None
        simple_export = exports_data.get("simple", {})
        advanced_export = exports_data.get("advanced", {})
        if simple_export or advanced_export:
            return VayneExportsInfo(
                simple=VayneExportInfo(
                    status=simple_export.get("status", ""),
                    file_url=simple_export.get("file_url")
                ) if simple_export and simple_export.get("status") else None,
                advanced=VayneExportInfo(
                    status=advanced_export.get("status", ""),
                    file_url=advanced_export.get("file_url")
                ) if advanced_export and advanced_export.get("status") else None
            )
        return None
    
    # Trigger export generation in Vayne API
    # This will generate the export and return the order with exports populated
    exports_from_vayne = {}
    try:
        export_response = await vayne_client.trigger_export(order.vayne_order_id, order.export_format or "advanced")
        vayne_order_with_exports = export_response.get("order", {})
        exports_from_vayne = vayne_order_with_exports.get("exports", {})
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger export in Vayne: {str(e)}. Export may not be ready yet, please try again in a few seconds."
        )
    
    # If CSV already stored, return success with exports info
    if order.csv_file_path:
        exports_info = get_exports_info(exports_from_vayne)
        return {
            "status": "success", 
            "message": "CSV already exported", 
            "csv_file_path": order.csv_file_path,
            "exports": exports_info.model_dump() if exports_info else None
        }
    
    # Export CSV from Vayne with retry logic (optional - only if we want to store in R2)
    # If exports are already available from trigger_export, we can return them immediately
    exports_info = get_exports_info(exports_from_vayne)
    
    # Try to download and store CSV in R2 (optional - exports URLs are already available)
    try:
        # Use retry-based export to wait for export to be ready
        csv_data = await vayne_client.export_order_with_retry(
            order.vayne_order_id, 
            order.export_format or "advanced",
            max_retries=5,
            initial_delay=2.0,
            max_delay=30.0
        )
        
        # Store CSV in R2
        csv_file_path = f"vayne-orders/{order.id}/export.csv"
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path,
            Body=csv_data,
            ContentType="text/csv"
        )
        
        # Update order with CSV file path
        order.csv_file_path = csv_file_path
        order.status = "completed"  # Mark as completed now that CSV is stored
        if not order.completed_at:
            order.completed_at = datetime.utcnow()
        db.commit()
        
        print(f"✅ Stored CSV for order {order.id} in R2: {csv_file_path}")
        
        return {
            "status": "success", 
            "message": "CSV exported and stored successfully", 
            "csv_file_path": csv_file_path,
            "exports": exports_info.model_dump() if exports_info else None
        }
    except Exception as e:
        # Even if download fails, return exports info if available from trigger_export
        logger.warning(f"Failed to download CSV for order {order.id}: {e}, but exports may be available")
        return {
            "status": "export_triggered",
            "message": f"Export triggered successfully. CSV download failed but export URLs are available in the response. Error: {str(e)}",
            "exports": exports_info.model_dump() if exports_info else None
        }


@router.get("/orders/{order_id}/export")
async def export_order_download(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download CSV file from R2 for an order (matches specification GET endpoint).
    Falls back to fetching from Vayne if CSV not yet stored in R2.
    Ensures client-specific (user_id) and job-specific (order_id) access control.
    """
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    # Client-specific and job-specific: Filter by both order_id and user_id
    order = db.query(VayneOrder).filter(
        VayneOrder.id == order_uuid,
        VayneOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    csv_data = None
    
    # If CSV is already stored in R2, download it
    if order.csv_file_path:
        try:
            response = s3_client.get_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=order.csv_file_path
            )
            csv_data = response['Body'].read()
        except Exception as e:
            logger.warning(f"Failed to download CSV from R2 for order {order.id} (user {current_user.id}): {e}")
            # Fall through to try fetching from Vayne
    
    # If CSV not in R2, try to fetch from Vayne and store it
    # This ensures job-specific access via order.vayne_order_id
    if not csv_data and order.vayne_order_id:
        try:
            vayne_client = get_vayne_client()
            
            # Check if export is ready in Vayne (job-specific via vayne_order_id)
            file_url = await vayne_client.check_export_ready(order.vayne_order_id, order.export_format or "advanced")
            
            if file_url:
                # Download CSV from Vayne
                async with httpx.AsyncClient() as client:
                    file_response = await client.get(file_url)
                    file_response.raise_for_status()
                    csv_data = file_response.content
                
                # Store CSV in R2 for future use (client and job specific path)
                try:
                    csv_file_path = f"vayne-orders/{order.id}/export.csv"
                    s3_client.put_object(
                        Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                        Key=csv_file_path,
                        Body=csv_data,
                        ContentType="text/csv"
                    )
                    order.csv_file_path = csv_file_path
                    if order.status != "completed":
                        order.status = "completed"
                    if not order.completed_at:
                        order.completed_at = datetime.utcnow()
                    db.commit()
                    logger.info(f"✅ Fetched and stored CSV for order {order.id} (user {current_user.id}) from Vayne")
                except Exception as storage_error:
                    logger.warning(f"⚠️ Failed to store CSV in R2 for order {order.id} (user {current_user.id}): {storage_error}")
                    # Still return the CSV data even if storage fails
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="CSV file not available for this order. The order may still be processing."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to fetch CSV from Vayne for order {order.id} (user {current_user.id}): {e}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="CSV file not available for this order. The order may still be processing."
            )
    
    if not csv_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CSV file not available for this order. The order may still be processing."
        )
    
    return StreamingResponse(
        io.BytesIO(csv_data),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=leads_export_{order_id}.csv"
        }
    )


@router.get("/orders/{order_id}/csv")
async def download_csv(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download CSV file from R2 for an order (legacy endpoint)."""
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    order = db.query(VayneOrder).filter(
        VayneOrder.id == order_uuid,
        VayneOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    if not order.csv_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CSV file not available for this order"
        )
    
    try:
        # Download CSV from R2
        response = s3_client.get_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=order.csv_file_path
        )
        csv_data = response['Body'].read()
        
        return StreamingResponse(
            io.BytesIO(csv_data),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=sales-nav-leads-{order.id}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download CSV: {str(e)}"
        )


@router.get("/orders", response_model=VayneOrderListResponse)
async def get_order_history(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get order history for current user - loads from database only (no external API calls)."""
    query = db.query(VayneOrder).filter(VayneOrder.user_id == current_user.id)
    
    if status_filter and status_filter != "all":
        query = query.filter(VayneOrder.status == status_filter)
    
    total = query.count()
    orders = query.order_by(desc(VayneOrder.created_at)).offset(offset).limit(limit).all()
    
    # Build response from database only - no external API calls
    # Exports info is fetched on-demand when user clicks download
    # Status updates are handled by background worker and webhook
    # Active orders are polled via the status endpoint for real-time updates
    order_responses = []
    
    for order in orders:
        # Derive scraping_status from status for display
        # Only active orders need real-time scraping_status (handled by polling via status endpoint)
        scraping_status = None
        if order.status == "pending":
            scraping_status = "initialization"
        elif order.status == "processing":
            scraping_status = "scraping"
        elif order.status == "completed":
            scraping_status = "finished"
        elif order.status == "failed":
            scraping_status = "failed"
        
        order_responses.append(
            VayneOrderResponse(
                id=str(order.id),
                status=order.status,
                scraping_status=scraping_status,
                vayne_order_id=order.vayne_order_id,
                sales_nav_url=order.sales_nav_url,
                export_format=order.export_format,
                only_qualified=order.only_qualified,
                leads_found=order.leads_found,
                leads_qualified=order.leads_qualified,
                progress_percentage=order.progress_percentage,
                estimated_completion=order.estimated_completion,
                created_at=order.created_at.isoformat(),
                completed_at=order.completed_at.isoformat() if order.completed_at else None,
                csv_file_path=order.csv_file_path,
                exports=None,  # Exports fetched on-demand when downloading
            )
        )
    
    return VayneOrderListResponse(
        orders=order_responses,
        total=total
    )



# ============================================
# WEBHOOK ENDPOINT (Public, no auth required)
# ============================================
# Webhook URL to configure in Vayne dashboard:
# https://www.billionverifier.io/api/webhooks/vayne/orders
# Alternative: https://www.billionverifier.io/api/v1/vayne/webhook

@router.post("/webhook")
async def vayne_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Scalable webhook endpoint for Vayne API to receive completed scraping results.
    Processes webhooks sequentially (1 at a time) using Redis locks.
    Immediately downloads CSV from file_url and triggers enrichment job.
    
    This endpoint is public (no auth required) but validates payload structure.
    
    Expected payload format from Vayne:
    {
      "body": {
        "event": "order.completed",
        "order_id": 39119,
        "export_format": "simple",
        "file_url": "https://vayne-production-export.s3.eu-west-3.amazonaws.com/..."
      },
      ...
    }
    
    Configure webhook URL in Vayne dashboard API Settings:
    - Primary: https://www.billionverifier.io/api/webhooks/vayne/orders
    - Alternative: https://www.billionverifier.io/api/v1/vayne/webhook
    """
    try:
        # Log incoming webhook for debugging
        logger.info(f"📥 Vayne webhook received at {datetime.utcnow().isoformat()}")
        
        # Parse request body
        payload = await request.json()
        logger.info(f"📥 Webhook payload structure: {list(payload.keys())}")
        
        # Extract body (Vayne sends nested structure)
        body_data = payload.get("body", payload)  # Fallback to flat structure for compatibility
        
        # Extract event type and order ID
        event = body_data.get("event", "")
        vayne_order_id = str(body_data.get("order_id", ""))
        file_url = body_data.get("file_url")
        export_format = body_data.get("export_format", "simple")
        
        if not vayne_order_id:
            logger.warning(f"⚠️ Webhook received without order ID: {payload}")
            return {"status": "ok", "message": "No order ID provided (ignored)"}
        
        if event != "order.completed":
            logger.info(f"📥 Webhook received for event '{event}' (not order.completed) - ignoring")
            return {"status": "ok", "message": f"Event '{event}' ignored (only processing order.completed)"}
        
        if not file_url:
            logger.warning(f"⚠️ Webhook received for order {vayne_order_id} without file_url")
            return {"status": "ok", "message": "No file_url provided (ignored)"}
        
        logger.info(f"📥 Processing webhook for Vayne order ID: {vayne_order_id}, event: {event}")
        
        # Find order by Vayne's order_id (client-specific via user_id in order)
        order = db.query(VayneOrder).filter(
            VayneOrder.vayne_order_id == vayne_order_id
        ).first()
        
        if not order:
            logger.warning(f"⚠️ Webhook received for unknown order_id: {vayne_order_id}")
            return {"status": "ok", "message": "Order not found (ignored)"}
        
        # Process webhook sequentially using Redis lock
        async def process_webhook():
            """Inner function to process the webhook (called with lock)."""
            # Refresh order from DB to get latest state
            db.refresh(order)
            
            # Check if already processed
            if order.status == "completed" and order.csv_file_path:
                logger.info(f"✅ Order {order.id} already completed and processed - skipping")
                return {"status": "ok", "message": "Order already processed"}
            
            logger.info(f"🔄 Processing order {order.id} (Vayne ID: {vayne_order_id}) for user {order.user_id}")
            
            # Download CSV directly from file_url
            csv_data = None
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    logger.info(f"⬇️ Downloading CSV from {file_url[:80]}...")
                    file_response = await client.get(file_url)
                    file_response.raise_for_status()
                    csv_data = file_response.content
                    logger.info(f"✅ Downloaded CSV ({len(csv_data)} bytes) for order {order.id}")
            except Exception as e:
                logger.error(f"❌ Failed to download CSV from file_url for order {order.id}: {e}")
                db.rollback()
                return {"status": "error", "message": f"Failed to download CSV: {str(e)}"}
            
            # Store CSV in R2 (client-specific path: vayne-orders/{order.id}/export.csv)
            csv_file_path = f"vayne-orders/{order.id}/export.csv"
            try:
                s3_client.put_object(
                    Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                    Key=csv_file_path,
                    Body=csv_data,
                    ContentType="text/csv"
                )
                logger.info(f"✅ Stored CSV in R2: {csv_file_path}")
            except Exception as e:
                logger.error(f"❌ Failed to store CSV in R2 for order {order.id}: {e}")
                db.rollback()
                return {"status": "error", "message": f"Failed to store CSV: {str(e)}"}
            
            # Update order status to completed
            order.status = "completed"
            order.csv_file_path = csv_file_path
            order.completed_at = datetime.utcnow()
            order.export_format = export_format  # Update format if different
            
            # Update progress to 100%
            order.progress_percentage = 100
            
            db.commit()
            db.refresh(order)
            
            logger.info(f"✅ Order {order.id} marked as completed")
            
            # Immediately create enrichment job (client-specific via order.user_id)
            try:
                enrichment_job = await create_enrichment_job_from_order(order, db)
                if enrichment_job:
                    logger.info(f"✅ Automatically created enrichment job {enrichment_job.id} from scraping order {order.id} for user {order.user_id}")
                    return {
                        "status": "ok",
                        "message": "Webhook processed successfully",
                        "order_id": str(order.id),
                        "enrichment_job_id": str(enrichment_job.id)
                    }
                else:
                    logger.warning(f"⚠️ Failed to create enrichment job for order {order.id}")
                    return {
                        "status": "ok",
                        "message": "Order completed but enrichment job creation failed",
                        "order_id": str(order.id)
                    }
            except Exception as e:
                logger.error(f"❌ Error creating enrichment job for order {order.id}: {e}")
                import traceback
                traceback.print_exc()
                # Still return success since order is completed
                return {
                    "status": "ok",
                    "message": "Order completed but enrichment job creation failed",
                    "order_id": str(order.id),
                    "error": str(e)
                }
        
        # Process with sequential locking
        result = await process_webhook_sequentially(vayne_order_id, process_webhook)
        return result
        
    except Exception as e:
        logger.error(f"❌ Error processing webhook: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
        except:
            pass
        # Still return 200 to prevent Vayne from retrying
        return {"status": "error", "message": str(e)}


# ============================================
# ADMIN ENDPOINTS (For monitoring and troubleshooting)
# ============================================

@router.get("/admin/stuck-orders")
async def get_stuck_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get orders that may be stuck (pending/processing for too long).
    Only admins can access this endpoint.
    """
    # Check if user is admin
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Find orders that are stuck (pending/processing for more than STUCK_ORDER_THRESHOLD_HOURS)
    threshold_time = datetime.utcnow() - timedelta(hours=STUCK_ORDER_THRESHOLD_HOURS)
    
    stuck_orders = db.query(VayneOrder).filter(
        VayneOrder.status.in_(["pending", "processing"]),
        VayneOrder.created_at < threshold_time
    ).order_by(desc(VayneOrder.created_at)).all()
    
    return {
        "stuck_orders": [
            {
                "id": str(order.id),
                "vayne_order_id": order.vayne_order_id,
                "status": order.status,
                "progress_percentage": order.progress_percentage,
                "leads_found": order.leads_found,
                "created_at": order.created_at.isoformat(),
                "hours_stuck": round((datetime.utcnow() - order.created_at).total_seconds() / 3600, 1),
                "sales_nav_url": order.sales_nav_url[:100] + "..." if len(order.sales_nav_url) > 100 else order.sales_nav_url
            }
            for order in stuck_orders
        ],
        "total": len(stuck_orders),
        "threshold_hours": STUCK_ORDER_THRESHOLD_HOURS
    }


@router.post("/admin/sync-order/{order_id}")
async def admin_sync_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually sync an order with Vayne API and attempt export if finished.
    Only admins can access this endpoint.
    """
    # Check if user is admin
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    order = db.query(VayneOrder).filter(VayneOrder.id == order_uuid).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    if not order.vayne_order_id:
        return {
            "status": "error",
            "message": "Order has no Vayne order ID - cannot sync"
        }
    
    # Sync with Vayne API
    try:
        vayne_client = get_vayne_client()
        vayne_order = await vayne_client.get_order(order.vayne_order_id)
        
        scraping_status = vayne_order.get("scraping_status", "initialization")
        old_status = order.status
        
        # Update order fields
        order.progress_percentage = vayne_order.get("progress_percentage", order.progress_percentage)
        order.leads_found = vayne_order.get("leads_found", order.leads_found)
        
        # If finished, try to export
        if scraping_status == "finished":
            try:
                file_url = await vayne_client.check_export_ready(order.vayne_order_id, order.export_format)
                if file_url:
                    order.status = "completed"
                    if not order.completed_at:
                        order.completed_at = datetime.utcnow()
                    
                    # Try to download and store CSV
                    if not order.csv_file_path:
                        try:
                            csv_data = await vayne_client.export_order_with_retry(order.vayne_order_id, "advanced")
                            csv_file_path = f"vayne-orders/{order.id}/export.csv"
                            s3_client.put_object(
                                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                                Key=csv_file_path,
                                Body=csv_data,
                                ContentType="text/csv"
                            )
                            order.csv_file_path = csv_file_path
                            logger.info(f"✅ Stored CSV for order {order.id} via admin sync")
                        except Exception as export_error:
                            logger.warning(f"⚠️ Failed to store CSV for order {order.id}: {export_error}")
                else:
                    order.status = "processing"
            except Exception as export_error:
                order.status = "processing"
                logger.warning(f"⚠️ Export check failed for order {order.id}: {export_error}")
        elif scraping_status == "failed":
            order.status = "failed"
        elif scraping_status == "scraping":
            order.status = "processing"
        
        db.commit()
        db.refresh(order)
        
        return {
            "status": "success",
            "message": f"Order synced: {old_status} -> {order.status}",
            "order": {
                "id": str(order.id),
                "status": order.status,
                "scraping_status": scraping_status,
                "progress_percentage": order.progress_percentage,
                "leads_found": order.leads_found,
                "csv_file_path": order.csv_file_path
            }
        }
    except Exception as e:
        logger.error(f"❌ Failed to sync order {order_id}: {e}")
        return {
            "status": "error",
            "message": f"Sync failed: {str(e)}"
        }


@router.post("/admin/mark-failed/{order_id}")
async def admin_mark_order_failed(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually mark an order as failed (for stuck orders that cannot be recovered).
    Only admins can access this endpoint.
    """
    # Check if user is admin
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        order_uuid = UUID(order_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order ID format"
        )
    
    order = db.query(VayneOrder).filter(VayneOrder.id == order_uuid).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    old_status = order.status
    order.status = "failed"
    db.commit()
    
    logger.warning(f"⚠️ Order {order_id} manually marked as failed by admin {current_user.email}")
    
    return {
        "status": "success",
        "message": f"Order marked as failed: {old_status} -> failed",
        "order_id": str(order.id)
    }

