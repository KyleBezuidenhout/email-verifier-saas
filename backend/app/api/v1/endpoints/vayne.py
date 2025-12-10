"""
Vayne API Endpoints (Sales Nav Scraper)

Backend proxy for Vayne API calls to:
- Secure API keys
- Centralize logic
- Control credits
- Store order history
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from uuid import UUID
from datetime import datetime
import io
import csv

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
)
from app.services.vayne_client import get_vayne_client
from app.core.config import settings

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
        
        # Store cookie in latest order (or create a placeholder order)
        # In production, encrypt this cookie
        latest_order = db.query(VayneOrder).filter(
            VayneOrder.user_id == current_user.id
        ).order_by(desc(VayneOrder.created_at)).first()
        
        if latest_order:
            latest_order.linkedin_cookie = auth_data.li_at_cookie
        else:
            # Create a placeholder order to store the cookie
            placeholder = VayneOrder(
                user_id=current_user.id,
                sales_nav_url="",
                linkedin_cookie=auth_data.li_at_cookie,
                status="pending"
            )
            db.add(placeholder)
        
        db.commit()
        
        return VayneAuthUpdateResponse(message="LinkedIn authentication updated successfully")
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
        return VayneCreditsResponse(
            available_credits=credits_data.get("available_credits", 0),
            leads_scraped_today=credits_data.get("leads_scraped_today", 0),
            daily_limit=credits_data.get("daily_limit", 0),
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
    """Create a new scraping order."""
    # Get LinkedIn cookie for this user
    latest_order = db.query(VayneOrder).filter(
        VayneOrder.user_id == current_user.id,
        VayneOrder.linkedin_cookie.isnot(None)
    ).order_by(desc(VayneOrder.created_at)).first()
    
    if not latest_order or not latest_order.linkedin_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LinkedIn authentication required. Please connect your LinkedIn account first."
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
        
        # Create order with Vayne API
        vayne_order = await vayne_client.create_order(
            sales_nav_url=order_data.sales_nav_url,
            export_format=order_data.export_format,
            only_qualified=order_data.only_qualified,
            li_at_cookie=latest_order.linkedin_cookie
        )
        
        # Store order in database
        order = VayneOrder(
            user_id=current_user.id,
            vayne_order_id=vayne_order.get("id") or str(vayne_order.get("order_id", "")),
            sales_nav_url=order_data.sales_nav_url,
            export_format=order_data.export_format,
            only_qualified=order_data.only_qualified,
            linkedin_cookie=latest_order.linkedin_cookie,
            status="pending"
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        
        # Deduct credits (1 credit per lead)
        if not is_admin:
            current_user.credits -= estimated_leads
            db.commit()
        
        return VayneOrderCreateResponse(
            order_id=str(order.id),
            message="Order created successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create order: {str(e)}"
        )


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
    
    # Sync with Vayne API if order is still processing
    if order.status in ["pending", "processing"] and order.vayne_order_id:
        try:
            vayne_client = get_vayne_client()
            vayne_order_data = await vayne_client.get_order(order.vayne_order_id)
            
            # Update order status from Vayne API
            order.status = vayne_order_data.get("status", order.status)
            order.leads_found = vayne_order_data.get("leads_found")
            order.leads_qualified = vayne_order_data.get("leads_qualified")
            order.progress_percentage = vayne_order_data.get("progress_percentage", 0)
            order.estimated_completion = vayne_order_data.get("estimated_completion")
            
            if order.status == "completed":
                order.completed_at = datetime.utcnow()
            
            db.commit()
            db.refresh(order)
        except Exception:
            # If sync fails, return stored data
            pass
    
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

