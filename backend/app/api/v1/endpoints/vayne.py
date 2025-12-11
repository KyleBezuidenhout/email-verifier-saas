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
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Constants for stuck order detection
STUCK_ORDER_THRESHOLD_HOURS = 24  # Orders older than this with pending/processing status are considered stuck

from app.db.session import get_db
from app.models.user import User
from app.models.vayne_order import VayneOrder
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
)
from app.services.vayne_client import get_vayne_client
from app.core.config import settings

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

router = APIRouter()


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
        credits_data = await vayne_client.get_credits()
        
        # Map Vayne API response to our schema
        # Vayne API returns: credit_available, daily_limit_leads, daily_limit_accounts, enrichment_credits
        return VayneCreditsResponse(
            available_credits=credits_data.get("credit_available", 0),
            leads_scraped_today=0,  # Not provided by Vayne API, would need separate tracking
            daily_limit=credits_data.get("daily_limit_leads", 0),
            subscription_plan=credits_data.get("subscription_plan"),
            subscription_expires_at=credits_data.get("subscription_expires_at"),
        )
    except Exception as e:
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
    """Create a new scraping order with direct API calls (no queuing)."""
    # Require cookie for each order
    if not order_data.linkedin_cookie or not order_data.linkedin_cookie.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LinkedIn session cookie is required for each scraping order."
        )
    
    try:
        vayne_client = get_vayne_client()
        
        # Step 1: Update LinkedIn session cookie with Vayne
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
        
        # Step 3: Create the scraping order with ADVANCED format (hardcoded per specification)
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
            status="pending",
            vayne_order_id=str(vayne_order.get("id", "")),
            leads_found=estimated_leads,
        )
        db.add(order)
        
        # Deduct credits immediately (1 credit per lead)
        if not is_admin:
            current_user.credits -= estimated_leads
        
        db.commit()
        db.refresh(order)
        
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
    )


@router.post("/orders/{order_id}/export")
async def export_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export order results as CSV and store in R2. Called automatically when scraping finishes."""
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
    
    # Check if scraping is finished by calling Vayne API
    try:
        vayne_client = get_vayne_client()
        vayne_order = await vayne_client.get_order(order.vayne_order_id)
        scraping_status = vayne_order.get("scraping_status", "initialization")
        
        if scraping_status != "finished":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Order scraping is not finished yet. Current status: {scraping_status}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check order status: {str(e)}"
        )
    
    # If CSV already stored, return success
    if order.csv_file_path:
        return {"status": "success", "message": "CSV already exported", "csv_file_path": order.csv_file_path}
    
    # Export CSV from Vayne with retry logic (always use advanced format per specification)
    try:
        # Use retry-based export to wait for export to be ready
        csv_data = await vayne_client.export_order_with_retry(
            order.vayne_order_id, 
            "advanced",
            max_retries=5,
            initial_delay=2.0,
            max_delay=30.0
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export CSV from Vayne: {str(e)}. Export may not be ready yet, please try again in a few seconds."
        )
    
    # Store CSV in R2
    csv_file_path = f"vayne-orders/{order.id}/export.csv"
    try:
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
        
        return {"status": "success", "message": "CSV exported and stored successfully", "csv_file_path": csv_file_path}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store CSV in R2: {str(e)}"
        )


@router.get("/orders/{order_id}/export")
async def export_order_download(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download CSV file from R2 for an order (matches specification GET endpoint)."""
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
            detail="CSV file not available for this order. The order may still be processing."
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
                "Content-Disposition": f"attachment; filename=leads_export_{order_id}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export order. The order may still be processing."
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
    """Get order history for current user."""
    query = db.query(VayneOrder).filter(VayneOrder.user_id == current_user.id)
    
    if status_filter and status_filter != "all":
        query = query.filter(VayneOrder.status == status_filter)
    
    total = query.count()
    orders = query.order_by(desc(VayneOrder.created_at)).offset(offset).limit(limit).all()
    
    # Sync any pending/processing orders with Vayne API
    for order in orders:
        if order.vayne_order_id and order.status in ["pending", "processing"]:
            await _sync_order_with_vayne(order, db)
    
    return VayneOrderListResponse(
        orders=[
            VayneOrderResponse(
                id=str(order.id),
                status=order.status,
                sales_nav_url=order.sales_nav_url,
                export_format=order.export_format,
                only_qualified=order.only_qualified,
                leads_found=order.leads_found,
                leads_qualified=order.leads_qualified,
                progress_percentage=order.progress_percentage,
                estimated_completion=order.estimated_completion,
                created_at=order.created_at.isoformat(),
                completed_at=order.completed_at.isoformat() if order.completed_at else None,
            )
            for order in orders
        ],
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
    Webhook endpoint for Vayne API to send order status updates.
    This endpoint is public (no auth required) but validates payload structure.
    Vayne may send nested order structure: { "order": { ... } } or flat structure.
    
    Configure webhook URL in Vayne dashboard API Settings:
    - Primary: https://www.billionverifier.io/api/webhooks/vayne/orders
    - Alternative: https://www.billionverifier.io/api/v1/vayne/webhook
    """
    try:
        # Log incoming webhook for debugging
        print(f"📥 Vayne webhook received at {datetime.utcnow().isoformat()}")
        
        # Parse request body (may be nested or flat)
        payload = await request.json()
        print(f"📥 Webhook payload: {payload}")
        
        # Handle nested structure: { "order": { "id": 123, ... } }
        if "order" in payload:
            order_data = payload["order"]
        else:
            order_data = payload
        
        # Extract order ID (may be numeric)
        order_id = str(order_data.get("id", ""))
        
        if not order_id:
            print(f"⚠️ Webhook received without order ID: {payload}")
            return {"status": "ok", "message": "No order ID provided (ignored)"}
        
        print(f"📥 Processing webhook for Vayne order ID: {order_id}")
        
        # Find order by Vayne's order_id
        order = db.query(VayneOrder).filter(
            VayneOrder.vayne_order_id == order_id
        ).first()
        
        if not order:
            # Order not found - might be from a different system or deleted
            print(f"⚠️ Webhook received for unknown order_id: {order_id}")
            return {"status": "ok", "message": "Order not found (ignored)"}
        
        # Map scraping_status to our status values
        scraping_status = order_data.get("scraping_status", order.status)
        status_mapping = {
            "initialization": "pending",
            "scraping": "processing",
            "finished": "processing",  # Don't mark as completed yet - verify export first
            "failed": "failed"
        }
        new_status = status_mapping.get(scraping_status, order.status)
        
        # If Vayne says "finished", verify export is available before marking as completed
        if scraping_status == "finished" and order.vayne_order_id:
            try:
                vayne_client = get_vayne_client()
                # Quick check if export is ready (don't wait with full retry in webhook)
                file_url = await vayne_client.check_export_ready(order.vayne_order_id, order.export_format)
                if file_url:
                    # Export is ready - mark as completed
                    new_status = "completed"
                    order.completed_at = datetime.utcnow()
                    print(f"✅ Order {order_id} (Vayne ID: {order.vayne_order_id}) export verified via webhook - marking as completed")
                else:
                    # Export not ready yet - keep as processing, will be updated on next poll
                    print(f"⏳ Order {order_id} (Vayne ID: {order.vayne_order_id}) export not ready yet via webhook. Keeping status as processing.")
                    new_status = "processing"
            except Exception as export_error:
                # Export check failed - keep as processing
                print(f"⏳ Order {order_id} (Vayne ID: {order.vayne_order_id}) export check failed via webhook: {export_error}. Keeping status as processing.")
                new_status = "processing"
        
        order.status = new_status
        
        # Map progress percentage: (scraped / total) * 100
        scraped = order_data.get("scraped", 0)
        total = order_data.get("total", 0)
        if total > 0:
            order.progress_percentage = int((scraped / total) * 100)
        elif order_data.get("progress_percentage") is not None:
            order.progress_percentage = order_data.get("progress_percentage")
        
        # Map leads_found from matching or total
        if "matching" in order_data:
            order.leads_found = order_data.get("matching", 0)
            order.leads_qualified = order_data.get("matching", 0) if order.only_qualified else order_data.get("matching", 0)
        elif "total" in order_data:
            order.leads_found = order_data.get("total", 0)
        
        # Set completed_at if order is completed
        if new_status == "completed":
            order.completed_at = datetime.utcnow()
        elif new_status == "failed":
            # Store error message if available (log for now, could add error_message field later)
            error_msg = order_data.get("error") or order_data.get("error_message")
            if error_msg:
                print(f"Order {order_id} failed: {error_msg}")
        
        db.commit()
        db.refresh(order)
        
        print(f"✅ Webhook processed for order {order_id}: status={new_status}")
        return {"status": "ok", "message": "Webhook processed successfully"}
        
    except Exception as e:
        print(f"❌ Error processing webhook: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
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

