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
from datetime import datetime
import io
import csv
import redis

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
    VayneOrderDeleteResponse,
    VayneWebhookPayload,
)
from app.services.vayne_client import get_vayne_client
from app.core.config import settings

# Initialize Redis connection for queue
redis_client = redis.from_url(settings.REDIS_URL)

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
    """Update LinkedIn session cookie for current user."""
    try:
        vayne_client = get_vayne_client()
        result = await vayne_client.update_authentication(auth_data.li_at_cookie)
        
        # Client returns: { "linkedin_cookie": "...", "message": "..." }
        # Use the cookie from response or fallback to provided cookie
        stored_cookie = result.get("linkedin_cookie", auth_data.li_at_cookie)
        
        # Store cookie in latest order (or create a placeholder order)
        # In production, encrypt this cookie
        latest_order = db.query(VayneOrder).filter(
            VayneOrder.user_id == current_user.id
        ).order_by(desc(VayneOrder.created_at)).first()
        
        if latest_order:
            latest_order.linkedin_cookie = stored_cookie
        else:
            # Create a placeholder order to store the cookie
            placeholder = VayneOrder(
                user_id=current_user.id,
                sales_nav_url="",
                linkedin_cookie=stored_cookie,
                status="pending"
            )
            db.add(placeholder)
        
        db.commit()
        
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
    """Create a new scraping order - queues it for worker processing."""
    # Require cookie for each order
    if not order_data.li_at_cookie or not order_data.li_at_cookie.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LinkedIn session cookie (li_at) is required for each scraping order."
        )
    
    # Check credits (1 credit per lead estimated)
    try:
        vayne_client = get_vayne_client()
        url_check = await vayne_client.check_url(order_data.sales_nav_url)
        
        if not url_check.get("is_valid", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=url_check.get("error", "Invalid Sales Navigator URL")
            )
        
        estimated_leads = url_check.get("estimated_results", 0)
        is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
        
        if not is_admin and current_user.credits < estimated_leads:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient credits. You have {current_user.credits} credits but this order requires approximately {estimated_leads} credits."
            )
        
        # Create order record with "queued" status
        # Worker will update cookie, create Vayne order, and update status
        order = VayneOrder(
            user_id=current_user.id,
            sales_nav_url=order_data.sales_nav_url,
            export_format=order_data.export_format,
            only_qualified=order_data.only_qualified,
            linkedin_cookie=order_data.li_at_cookie,  # Store cookie for worker
            status="queued",  # Worker will process and update status
            leads_found=estimated_leads,
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        
        # Deduct credits immediately (1 credit per lead)
        if not is_admin:
            current_user.credits -= estimated_leads
            db.commit()
        
        # Queue order for worker processing
        try:
            queue_name = "vayne-order-queue"
            redis_client.lpush(queue_name, str(order.id))
            print(f"✅ Queued Vayne order {order.id} to Redis queue '{queue_name}'")
        except Exception as e:
            print(f"Failed to queue order: {e}")
            # Order is still created, but worker won't process it automatically
            # Could add retry logic or manual processing here
        
        return VayneOrderCreateResponse(
            order_id=str(order.id),
            message="Order queued for processing"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create order: {str(e)}"
        )


async def _sync_order_with_vayne(order: VayneOrder, db: Session) -> bool:
    """Sync a single order with Vayne API. Returns True if updated."""
    if not order.vayne_order_id or order.status not in ["pending", "processing", "queued"]:
        return False
    
    try:
        vayne_client = get_vayne_client()
        vayne_order = await vayne_client.get_order(order.vayne_order_id)
        
        # vayne_client.get_order() already maps scraping_status to status
        new_status = vayne_order.get("status", order.status)
        
        # Update order if status changed or if we have new data
        needs_update = False
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
        
        # Set completed_at if completed
        if new_status == "completed" and not order.completed_at:
            order.completed_at = datetime.utcnow()
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


@router.get("/orders/{order_id}", response_model=VayneOrderResponse)
async def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get order status and details."""
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
    
    # Sync with Vayne API if needed
    await _sync_order_with_vayne(order, db)
    
    return VayneOrderResponse(
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


@router.post("/orders/{order_id}/export")
async def export_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export order results as CSV. Admin-only for security."""
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
    
    if order.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is not completed yet"
        )
    
    # Only admin can download CSV (for security and credit control)
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSV download is only available to administrators. Use 'Enrich Leads' button to process leads."
        )
    
    try:
        vayne_client = get_vayne_client()
        csv_data = await vayne_client.export_order(order.vayne_order_id or str(order.id))
        
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
            detail=f"Failed to export order: {str(e)}"
        )


@router.delete("/orders/{order_id}", response_model=VayneOrderDeleteResponse, status_code=status.HTTP_200_OK)
async def delete_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an order from the user's order history. Note: Credits are not refunded."""
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
    
    # Delete the order (credits are not refunded - this is just removing from history)
    db.delete(order)
    db.commit()
    
    return VayneOrderDeleteResponse(status="ok", message="Order deleted successfully")


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
        if order.vayne_order_id and order.status in ["pending", "processing", "queued"]:
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

@router.post("/webhook")
async def vayne_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint for Vayne API to send order status updates.
    This endpoint is public (no auth required) but validates payload structure.
    Vayne may send nested order structure: { "order": { ... } } or flat structure.
    """
    try:
        # Parse request body (may be nested or flat)
        payload = await request.json()
        
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
            "finished": "completed",
            "failed": "failed"
        }
        new_status = status_mapping.get(scraping_status, order.status)
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

