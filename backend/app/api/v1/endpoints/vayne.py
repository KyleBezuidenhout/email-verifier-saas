from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, Header
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
            detail="Invalid webhook token. Authentication failed."
        )
    
    logger.info("✅ Webhook token verified successfully")
    return True


router = APIRouter()

# Initialize Redis connection for job queue
redis_client = redis.from_url(settings.REDIS_URL)

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Enrichment queue name
ENRICHMENT_QUEUE = "enrichment-job-creation"


def is_admin_user(user: User) -> bool:
    return user.email == ADMIN_EMAIL or getattr(user, "is_admin", False)







# TEST: Simple endpoint to verify router is working
@router.get("/test-route-registration")
async def test_route_registration():
    """Test endpoint to verify routes are being registered"""
    logger.info("✅ Test route registration endpoint called - router is working!")
    print("✅ Vayne router test endpoint called - router is registered!")
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
    """
    Check/validate a LinkedIn Sales Navigator URL (no authentication required).
    
    Accepts: { "sales_nav_url": "https://www.linkedin.com/sales/search/..." }
    
    This endpoint validates a Sales Navigator search URL and returns:
    - Whether the URL is valid
    - The type of search (people, accounts, etc.)
    - Estimated number of results
    - Any filters detected in the URL
    
    Accessible at: POST /api/v1/vayne/url-check
    """
    try:
        logger.info(f"📋 URL check requested for: {payload.sales_nav_url}")
        result = vayne_client.validate_url(payload.sales_nav_url)
        logger.info(f"✅ URL check result: valid={result.get('valid')}, estimated_results={result.get('estimated_results')}")
        return result
    except Exception as e:
        logger.error(f"❌ URL check failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


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
    db.execute(
        "UPDATE users SET credits = GREATEST(0, credits - :amt) WHERE id = :uid",
        {"amt": amount, "uid": str(user.id)},
    )
    db.commit()


@router.post("/orders", response_model=OrderStatusResponse)
async def create_order(
    payload: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        # Validate URL to estimate leads and ensure validity
        validation = vayne_client.validate_url(str(payload.url))
        estimated = validation.get("estimated_results") or 0
        if estimated <= 0:
            estimated = 100  # fallback minimal charge to avoid abuse

        # Charge credits upfront based on estimated leads
        charge_credits(db, current_user, estimated)

        # Create order with Vayne
        order_resp = vayne_client.create_order(
            url=str(payload.url),
            export_format=payload.export_format,
            qualified_leads_only=payload.qualified_leads_only,
            webhook_url=None,
        )

        # Persist order
        vo = VayneOrder(
            user_id=current_user.id,
            vayne_order_id=order_resp.get("id"),
            status=order_resp.get("status"),
            url=order_resp.get("url"),
            export_format=payload.export_format,
            qualified_leads_only=payload.qualified_leads_only,
            estimated_leads=estimated,
            credits_charged=estimated,
        )
        db.add(vo)
        db.commit()

        return order_resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/{order_id}", response_model=OrderStatusResponse)
async def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = vayne_client.get_order(order_id)
        # Sync status to DB if we have it
        vo: Optional[VayneOrder] = (
            db.query(VayneOrder).filter(VayneOrder.vayne_order_id == order_id).first()
        )
        if vo:
            vo.status = data.get("status")
            vo.progress_percentage = data.get("progress_percentage")
            vo.leads_found = data.get("leads_found")
            vo.leads_qualified = data.get("leads_qualified")
            if data.get("status") == "completed":
                vo.completed_at = vo.completed_at or data.get("estimated_completion")
            db.commit()
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/orders/{order_id}/export")
async def export_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Block clients from downloading; only ben@superwave.io
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Download disabled. Please use Enrichment to process scraped leads.",
        )
    try:
        resp = vayne_client.export_order_csv(order_id)
        # Stream CSV back
        return resp.content
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
@router.post("/webhook/n8n-csv-callback")
async def n8n_csv_callback(
    request: Request, 
    db: Session = Depends(get_db),
    _: bool = Depends(verify_webhook_token)
):
    """
    Receive callback from n8n workflow when scraping is completed.
    
    Accepts data directly from n8n/Vayne:
    - file_url: URL where CSV file is stored (from Vayne)
    - order_id: vayne_order_id
    - user_id: user UUID
    - leads_found: number of leads (optional)
    - leads_qualified: number of qualified leads (optional)
    
    This webhook will:
    1. Download CSV from file_url
    2. Store CSV in R2 (Cloudflare)
    3. Update order status to "completed" in postgres
    4. Create enrichment job immediately
    5. Queue enrichment job for processing
    
    The enrichment worker will then process the job and it will appear
    in the "enrich" job history page.
    
    Accessible at both:
    - /api/v1/vayne/webhook
    - /api/v1/vayne/webhook/n8n-csv-callback
    """
    client_ip = request.client.host if request.client else "unknown"
    print(f"🔔 WEBHOOK CALLED! Path: {request.url.path}, IP: {client_ip}")
    logger.info(f"🔔 Webhook called from {client_ip} - Path: {request.url.path}")
    
    try:
        payload = await request.json()
        logger.info(f"📥 Webhook payload received: {list(payload.keys())}")
        
        # Get required fields
        vayne_order_id = payload.get("order_id") or payload.get("vayne_order_id")
        user_id = payload.get("user_id")
        file_url = payload.get("file_url")
        leads_found = payload.get("leads_found")
        leads_qualified = payload.get("leads_qualified")
        
        logger.info(f"📋 Webhook data - order_id: {vayne_order_id}, user_id: {user_id}, file_url: {file_url[:50] if file_url else None}...")
        
        if not vayne_order_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required field: order_id or vayne_order_id"
            )
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required field: user_id"
            )
        
        if not file_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required field: file_url"
            )
        
        # Verify user exists (but don't query VayneOrder to avoid schema issues)
        logger.info(f"🔍 Verifying user_id: {user_id}")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"❌ User not found with user_id: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with user_id {user_id} not found"
            )
        
        # Use data directly from payload - no need to query VayneOrder
        # This avoids database schema issues and works with cached data
        logger.info(f"✅ Using webhook data directly - no database query needed")
        
        # Download CSV from file_url
        logger.info(f"⬇️  Downloading CSV from: {file_url}")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                csv_response = await client.get(file_url)
                csv_response.raise_for_status()
                csv_bytes = csv_response.content
                logger.info(f"✅ CSV downloaded successfully ({len(csv_bytes)} bytes)")
        except Exception as e:
            logger.error(f"❌ Failed to download CSV: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to download CSV from file_url: {str(e)}"
            )
        
        # Store CSV in R2
        csv_file_path = f"vayne-orders/{order.id}/export.csv"
        logger.info(f"💾 Storing CSV in R2 at: {csv_file_path}")
        try:
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=csv_file_path,
                Body=csv_bytes,
                ContentType="text/csv"
            )
            logger.info(f"✅ CSV stored in R2 successfully")
        except Exception as e:
            logger.error(f"❌ Failed to store CSV in R2: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to store CSV in R2: {str(e)}"
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
        
        # Get user for job creation
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User not found for order"
            )
        
        # Check if enrichment job already exists for this order
        existing_job = db.query(Job).filter(
            Job.user_id == order.user_id,
            Job.source == "Sales Nav",
            Job.input_file_path == csv_file_path
        ).first()
        
        if existing_job:
            # Job already exists, queue it if it's pending
            if existing_job.status == "pending":
                try:
                    job_id_str = str(existing_job.id)
                    redis_client.lpush(ENRICHMENT_QUEUE, job_id_str)
                    return {
                        "status": "success",
                        "message": f"CSV stored, order updated, and enrichment job {existing_job.id} queued",
                        "job_id": str(existing_job.id),
                        "csv_file_path": csv_file_path
                    }
                except Exception as e:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to queue existing enrichment job: {str(e)}"
                    )
            else:
                return {
                    "status": "success",
                    "message": f"Enrichment job {existing_job.id} already exists with status {existing_job.status}",
                    "job_id": str(existing_job.id),
                    "csv_file_path": csv_file_path
                }
        
        # Create new enrichment job immediately
        job = Job(
            user_id=user.id,
            status="pending",
            job_type="enrichment",
            original_filename=f"sales-nav-{order.id}.csv",
            total_leads=0,  # Will be set by enrichment worker
            processed_leads=0,
            valid_emails_found=0,
            catchall_emails_found=0,
            cost_in_credits=0,
            source="Sales Nav",
            input_file_path=csv_file_path  # Path to CSV in R2
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        # Queue the enrichment job immediately
        try:
            job_id_str = str(job.id)
            logger.info(f"🚀 Queuing enrichment job {job.id} to Redis queue: {ENRICHMENT_QUEUE}")
            redis_client.lpush(ENRICHMENT_QUEUE, job_id_str)
            logger.info(f"✅ Webhook processing completed successfully - Job ID: {job.id}")
            return {
                "status": "success",
                "message": f"CSV downloaded and stored, order updated, and enrichment job {job.id} created and queued successfully",
                "job_id": str(job.id),
                "csv_file_path": csv_file_path,
                "order_status": "completed"
            }
        except Exception as e:
            logger.error(f"❌ Failed to queue enrichment job: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to queue enrichment job: {str(e)}"
            )
            
    except HTTPException as e:
        logger.error(f"❌ Webhook HTTP error: {e.status_code} - {e.detail}")
        raise
    except Exception as e:
        logger.exception(f"❌ Webhook processing failed with exception: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process webhook callback: {str(e)}"
        )



