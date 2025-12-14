from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import httpx
import redis
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
    CreateOrderRequest,
    OrderStatusResponse,
)
from app.services.vayne_client import vayne_client
from app.core.config import settings


router = APIRouter()

# Initialize Redis connection for job queue
redis_client = redis.from_url(settings.REDIS_URL)

# Enrichment queue name
ENRICHMENT_QUEUE = "enrichment-job-creation"


def is_admin_user(user: User) -> bool:
    return user.email == ADMIN_EMAIL or getattr(user, "is_admin", False)







# TEST: Simple endpoint to verify router is working
@router.get("/test-route-registration")
async def test_route_registration():
    """Test endpoint to verify routes are being registered"""
    return {"message": "Router is working", "routes_registered": True}


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


@router.post("/webhook/n8n-csv-callback")
async def n8n_csv_callback(request: Request, db: Session = Depends(get_db)):
    """
    Receive callback from n8n workflow when scraping is completed.
    
    n8n workflow should have already updated the postgres database with:
    - All scrape outputs/leads
    - Status set to "completed"
    
    This webhook will:
    1. Verify the order exists and is marked as completed
    2. Create an enrichment job from the completed scraping order
    3. Queue the enrichment job for processing
    
    The enrichment worker will then process the job and it will appear
    in the "enrich" job history page.
    """
    try:
        payload = await request.json()
        
        # n8n should send the vayne_order_id (the order ID from Vayne's system)
        vayne_order_id = payload.get("order_id") or payload.get("vayne_order_id")
        user_id = payload.get("user_id")
        
        if not vayne_order_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required field: order_id or vayne_order_id"
            )
        
        # Find the order by vayne_order_id
        order = db.query(VayneOrder).filter(
            VayneOrder.vayne_order_id == str(vayne_order_id)
        ).first()
        
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order with vayne_order_id {vayne_order_id} not found"
            )
        
        # Verify the order is marked as completed (n8n should have updated this)
        if order.status != "completed":
            # If n8n hasn't updated it yet, update it now
            order.status = "completed"
            if not order.completed_at:
                order.completed_at = datetime.utcnow()
            db.commit()
        
        # Get user for job creation
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User not found for order"
            )
        
        # Check if CSV file path is available (n8n should have set this)
        csv_file_path = getattr(order, 'csv_file_path', None)
        if not csv_file_path:
            # If n8n provides file_url in payload, note it but don't fail
            # The enrichment worker expects CSV to be in R2
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order CSV file path not found. Ensure n8n workflow has stored the CSV in R2 and set csv_file_path."
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
                        "message": f"Enrichment job {existing_job.id} already exists and has been queued",
                        "job_id": str(existing_job.id)
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
                    "job_id": str(existing_job.id)
                }
        
        # Create new enrichment job
        # The enrichment job will read CSV from R2 and process it
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
        
        # Queue the enrichment job
        try:
            job_id_str = str(job.id)
            redis_client.lpush(ENRICHMENT_QUEUE, job_id_str)
            return {
                "status": "success",
                "message": f"Enrichment job {job.id} created and queued successfully",
                "job_id": str(job.id)
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to queue enrichment job: {str(e)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process webhook callback: {str(e)}"
        )



