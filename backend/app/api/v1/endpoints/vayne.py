from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import httpx

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


router = APIRouter()

# In-memory cache to store file_url temporarily (NOT in database)
# Key format: f"{order_id}_{user_id}" -> {"file_url": "...", "timestamp": "..."}
_download_cache: dict[str, dict[str, str]] = {}


def is_admin_user(user: User) -> bool:
    return user.email == ADMIN_EMAIL or getattr(user, "is_admin", False)


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


@router.post("/orders/{order_id}/request-download")
async def request_csv_download(
    order_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Send vayne_order_id and user_id to n8n webhook to fetch file_url.
    No database validation - order_id is the vayne_order_id from frontend UI.
    Returns immediately; frontend should poll status endpoint for file_url.
    """
    try:
        # order_id is already the vayne_order_id from the frontend UI
        # No need to validate or query database - if it's in the UI, it's valid
        
        # Send POST request to n8n webhook
        n8n_webhook_url = "https://n8n.meetautom8.com/webhook/8357f8da-83cf-4f0f-8269-ef2fafee48eb"
        payload = {
            "order_id": order_id,  # This is already the vayne_order_id
            "user_id": str(current_user.id)
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(n8n_webhook_url, json=payload)
                response.raise_for_status()
        except Exception as e:
            # Log error but don't fail the request - n8n will handle it
            # The frontend will poll and handle timeout
            pass
        
        return {
            "status": "success",
            "message": "Download request sent to n8n. Please wait for file to be ready."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook/n8n-csv-callback")
async def n8n_csv_callback(request: Request):
    """
    Receive order_id, user_id, and file_url from n8n workflow.
    Stores file_url in temporary in-memory cache (NOT in database).
    """
    try:
        payload = await request.json()
        
        order_id = payload.get("order_id")
        user_id = payload.get("user_id")
        file_url = payload.get("file_url")
        
        if not order_id or not user_id or not file_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required fields: order_id, user_id, or file_url"
            )
        
        # Store in cache with key format: order_id_user_id
        cache_key = f"{order_id}_{user_id}"
        _download_cache[cache_key] = {
            "file_url": file_url,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process webhook callback: {str(e)}"
        )


@router.get("/orders/{order_id}/download-status")
async def get_download_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Check if file_url is available for this order.
    Returns file_url from temporary cache if available.
    No database validation - order_id is the vayne_order_id from frontend UI.
    """
    try:
        # order_id is already the vayne_order_id from the frontend UI
        # No need to validate or query database
        
        # Check cache using order_id (vayne_order_id) and user_id
        cache_key = f"{order_id}_{current_user.id}"
        
        if cache_key in _download_cache:
            cache_entry = _download_cache[cache_key]
            file_url = cache_entry.get("file_url")
            
            # Optionally clean up cache entry after returning (one-time use)
            del _download_cache[cache_key]
            
            return {
                "status": "ready",
                "file_url": file_url
            }
        else:
            return {
                "status": "pending"
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


