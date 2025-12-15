# vayne.py
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import httpx
import redis
import boto3
import logging
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
)
from app.services.vayne_client import vayne_client
from app.core.config import settings

logger = logging.getLogger(__name__)


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
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
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
async def check_linkedin_auth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return vayne_client.check_linkedin_auth()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/auth", response_model=LinkedInAuthStatus)
async def update_linkedin_auth(
    payload: UpdateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return vayne_client.update_linkedin_session(payload.session_cookie)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/credits", response_model=CreditsResponse)
async def get_credits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return vayne_client.get_credits()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/validate-url", response_model=UrlValidationResponse)
async def validate_url(
    payload: UrlValidationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return vayne_client.validate_url(payload.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/url-check", response_model=UrlValidationResponse)
async def url_check(payload: UrlCheckRequest):
    try:
        logger.info(f"URL check requested for: {payload.sales_nav_url}")
        result = vayne_client.validate_url(payload.sales_nav_url)
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
        logger.error(f"URL check failed: {str(e)}")
        return {
            "is_valid": False,  # Use 'is_valid' to match frontend VayneUrlCheck type
            "url": payload.sales_nav_url,
            "error": str(e),
            "suggestion": "Please check the URL and try again"
        }


def charge_credits(db: Session, user: User, amount: int):
    if amount <= 0:
        return
    if is_admin_user(user):
        return
    if user.credits < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credits. Needed {amount}, you have {user.credits}",
        )
    from sqlalchemy import text
    db.execute(
        text("UPDATE users SET credits = GREATEST(0, credits - :amt) WHERE id = :uid"),
        {"amt": amount, "uid": str(user.id)},
    )
    db.commit()

@router.post("/orders", response_model=CreateOrderResponse)
async def create_order(
    payload: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new Vayne order"""
    try:
        # Step 1: Update LinkedIn session with Vayne API using the provided cookie
        logger.info(f"Updating LinkedIn session for user {current_user.id}")
        try:
            vayne_client.update_linkedin_session(payload.linkedin_cookie)
            logger.info("LinkedIn session updated successfully")
        except Exception as auth_error:
            logger.error(f"Failed to update LinkedIn session: {str(auth_error)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"LinkedIn authentication failed: {str(auth_error)}"
            )
        
        # Step 2: Create order with Vayne API
        logger.info(f"Creating Vayne order for URL: {payload.sales_nav_url}")
        try:
            vayne_response = vayne_client.create_order(
                url=payload.sales_nav_url,
                name=payload.targeting or "Untitled Order",
                limit=None,  # No limit
                email_enrichment=False,
                saved_search=False,
                secondary_webhook="",
                export_format="simple",
            )
            logger.info(f"Vayne order created: {vayne_response}")
        except Exception as vayne_error:
            error_msg = str(vayne_error)
            logger.error(f"Failed to create Vayne order: {error_msg}")
            # Pass through Vayne's error message (e.g., insufficient credits)
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Extract the vayne_order_id from response
        # Vayne API returns: { "order": { "id": 123, ... } }
        vayne_order_data = vayne_response.get("order", {})
        vayne_order_id = str(vayne_order_data.get("id", ""))
        
        if not vayne_order_id:
            logger.error(f"No order ID in Vayne response: {vayne_response}")
            raise HTTPException(status_code=400, detail="Failed to get order ID from Vayne")
        
        # Step 3: Create order in our database
        order = VayneOrder(
            user_id=current_user.id,
            vayne_order_id=vayne_order_id,
            status="processing",
            url=payload.sales_nav_url,
            targeting=payload.targeting or "Untitled Order",
        )
        
        db.add(order)
        db.commit()
        db.refresh(order)
        
        logger.info(f"Order created successfully: {order.id} (Vayne ID: {vayne_order_id})")
        
        return {
            "success": True,
            "order_id": str(order.id),
            "status": order.status,
            "message": f"Order created successfully. Vayne order ID: {vayne_order_id}",
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders")
async def list_orders(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all orders for current user from database (no Vayne API polling)"""
    try:
        query = db.query(VayneOrder).filter(VayneOrder.user_id == current_user.id)
        
        if status:
            query = query.filter(VayneOrder.status == status)
        
        # Get total count
        total = query.count()
        
        # Get paginated results, newest first
        orders = query.order_by(VayneOrder.created_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "orders": [
                {
                    "id": str(order.id),
                    "user_id": str(order.user_id),
                    "vayne_order_id": order.vayne_order_id,
                    "status": order.status,
                    "targeting": getattr(order, 'targeting', None),
                    "leads_found": getattr(order, 'leads_found', 0) or 0,
                    "leads_qualified": getattr(order, 'leads_qualified', 0) or 0,
                    "progress_percentage": getattr(order, 'progress_percentage', 0) or 0,
                    "file_url": getattr(order, 'file_url', None),
                    "created_at": order.created_at.isoformat() if order.created_at else None,
                    "completed_at": order.completed_at.isoformat() if order.completed_at else None,
                }
                for order in orders
            ],
            "total": total,
        }
    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/{order_id}", response_model=OrderStatusResponse)
async def get_order(
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
        logger.error(f"Error getting order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/orders/{order_id}")
async def delete_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an order from database"""
    try:
        order = db.query(VayneOrder).filter(
            VayneOrder.id == order_id,
            VayneOrder.user_id == current_user.id
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        db.delete(order)
        db.commit()
        
        return {"message": "Order deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/{order_id}/download")
async def download_order_csv(
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
        
        # Get file_url (set by n8n when order completes)
        file_url = getattr(order, 'file_url', None)
        if not file_url:
            raise HTTPException(status_code=404, detail="CSV file not available yet. Please try again later.")
        
        # Fetch CSV from the file_url
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(file_url)
                response.raise_for_status()
                csv_content = response.content
        except Exception as e:
            logger.error(f"Failed to fetch CSV from file_url: {str(e)}")
            raise HTTPException(status_code=404, detail="Failed to download CSV file. Please try again later.")
        
        # Generate filename
        targeting = getattr(order, 'targeting', None) or 'export'
        # Sanitize filename
        safe_targeting = "".join(c for c in targeting if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
        if not safe_targeting:
            safe_targeting = "export"
        filename = f"{safe_targeting}_{str(order_id)[:8]}.csv"
        
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
        logger.error(f"Error downloading order CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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
        logger.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


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
        leads_found = body.get("leads_found")
        leads_qualified = body.get("leads_qualified")
        
        if not csv_data:
            raise HTTPException(status_code=400, detail="Missing csv_data")
        
        # Store CSV in R2
        csv_file_path = f"vayne-orders/{order.id}/export.csv"
        logger.info(f"Storing CSV in R2 at: {csv_file_path}")
        
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path,
            Body=csv_data,
            ContentType="text/csv"
        )
        
        # Update order status and metadata in postgres
        order.status = "completed"
        if not order.completed_at:
            order.completed_at = datetime.utcnow()
        
        # Update csv_file_path (using setattr to handle potential missing column)
        if hasattr(order, 'csv_file_path'):
            order.csv_file_path = csv_file_path
        
        # Update leads counts if provided
        if leads_found is not None:
            order.leads_found = leads_found
        if leads_qualified is not None:
            order.leads_qualified = leads_qualified
        
        db.commit()
        db.refresh(order)
        
        logger.info(f"CSV stored in R2 successfully")
        return {
            "status": "success",
            "message": "CSV processed and stored",
            "order_id": str(order.id),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"N8N callback error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
