"""
Google Maps Scraper API Endpoints

Provides endpoints for Google Maps scraping using Apify compass/crawler-google-places actor.
Supports single city and full state (concurrent) scraping modes.

This is completely separate from the Sales Nav, Enrichment, and Verification features.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, text, func
from typing import Optional
from datetime import datetime
from decimal import Decimal
import logging
import json
import csv
import io
import boto3
import redis

from app.db.session import get_db
from app.models.user import User
from app.models.local_scraper_order import LocalScraperOrder
from app.models.local_scraper_city_job import LocalScraperCityJob
from app.api.dependencies import get_current_user
from app.schemas.google_maps_scraper import (
    GoogleMapsScraperOrderCreate,
    GoogleMapsScraperOrderResponse,
    GoogleMapsScraperOrderListResponse,
    GoogleMapsScraperHealthResponse,
    GoogleMapsScraperStatusResponse,
    CostEstimateRequest,
    CostEstimateResponse,
    StateListResponse,
    CityListResponse,
    GoogleMapsScraperPreviewResponse,
)
from app.services.apify_service import apify_service
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def find_cached_results(db: Session, city: str, state: str, search_term: str) -> Optional[LocalScraperCityJob]:
    """
    Find existing completed results for exact city+state+search_term match.
    Returns the most recent completed city job with results, or None if no cache hit.
    """
    return db.query(LocalScraperCityJob).filter(
        func.lower(LocalScraperCityJob.city) == city.lower().strip(),
        func.lower(LocalScraperCityJob.state) == state.lower().strip(),
        func.lower(LocalScraperCityJob.search_term) == search_term.lower().strip(),
        LocalScraperCityJob.status == "completed",
        LocalScraperCityJob.results_count > 0
    ).order_by(desc(LocalScraperCityJob.updated_at)).first()

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Initialize Redis client for job queue
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)

# Queue name for Google Maps scraper jobs
GOOGLE_MAPS_SCRAPER_QUEUE = "google-maps-scraper-queue"


def order_to_response(order: LocalScraperOrder) -> dict:
    """Convert a LocalScraperOrder to a response dict"""
    # Handle states - could be JSON list or legacy string
    states = order.states if isinstance(order.states, list) else [order.states] if order.states else []
    
    return {
        "id": str(order.id),
        "user_id": str(order.user_id),
        "status": order.status,
        "scrape_mode": order.scrape_mode or "single_city",
        "states": states,
        "city": order.city,
        "search_term": order.search_term or "",
        "job_name": order.job_name or "",
        "total_cities": order.total_cities or 1,
        "completed_cities": order.completed_cities or 0,
        "progress_percentage": order.progress_percentage or 0,
        "results_count": order.results_count or 0,
        "estimated_cost": float(order.estimated_cost or 0),
        "actual_cost": float(order.actual_cost) if order.actual_cost else None,
        "file_url": order.file_url,
        "created_at": order.created_at,
        "completed_at": order.completed_at,
        "error_message": order.error_message,
        # Apify settings
        "max_results_per_city": order.max_results_per_city,
        "skip_closed_places": order.skip_closed_places if order.skip_closed_places is not None else True,
        "website_filter": order.website_filter or "withWebsite",
        "scrape_reviews": order.scrape_reviews if order.scrape_reviews is not None else False,
        "max_reviews": order.max_reviews or 0,
        "scrape_images": order.scrape_images if order.scrape_images is not None else False,
        "max_images": order.max_images or 0,
        "language": order.language or "en",
    }


@router.get("/health", response_model=GoogleMapsScraperHealthResponse)
async def check_health():
    """Check if Apify API is accessible and API key is valid"""
    is_healthy = await apify_service.check_health()
    
    if not settings.APIFY_API_TOKEN:
        return GoogleMapsScraperHealthResponse(
            apify_api="disconnected",
            message="APIFY_API_TOKEN not configured. Please set the environment variable."
        )
    
    return GoogleMapsScraperHealthResponse(
        apify_api="connected" if is_healthy else "disconnected",
        message="Apify API connected" if is_healthy else "Could not connect to Apify API. Please check your API token."
    )


@router.get("/states", response_model=StateListResponse)
def list_states(db: Session = Depends(get_db)):
    """Get list of available US states for scraping"""
    try:
        result = db.execute(text("""
            SELECT DISTINCT state FROM google_maps_cities ORDER BY state
        """))
        states = [row[0] for row in result.fetchall()]
        
        if not states:
            # Return default US states if table is empty
            states = [
                "Alabama", "Alaska", "Arizona", "Arkansas", "California",
                "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
                "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
                "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
                "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
                "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
                "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
                "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
                "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
                "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
            ]
        
        return StateListResponse(states=states)
    except Exception as e:
        logger.error(f"Error listing states: {e}")
        raise HTTPException(status_code=500, detail="Error. Please try again later.")


@router.get("/cities/{state}", response_model=CityListResponse)
def list_cities(
    state: str,
    db: Session = Depends(get_db)
):
    """Get list of cities for a specific state"""
    try:
        result = db.execute(text("""
            SELECT city FROM google_maps_cities WHERE state = :state ORDER BY city
        """), {"state": state})
        cities = [row[0] for row in result.fetchall()]
        
        return CityListResponse(
            state=state,
            cities=cities,
            count=len(cities)
        )
    except Exception as e:
        logger.error(f"Error listing cities for {state}: {e}")
        raise HTTPException(status_code=500, detail="Error. Please try again later.")


@router.post("/estimate", response_model=CostEstimateResponse)
def estimate_cost(
    payload: CostEstimateRequest,
    db: Session = Depends(get_db),
):
    """
    Estimate the cost of a scrape job.
    
    - Single city: ~$0.80
    - Full state: num_cities * $0.80
    """
    try:
        if payload.scrape_mode == "single_city":
            num_cities = 1
        else:
            # Count cities across all selected states
            num_cities = 0
            for state in payload.states:
                result = db.execute(text("""
                    SELECT COUNT(*) FROM google_maps_cities WHERE state = :state
                """), {"state": state})
                num_cities += result.scalar() or 0
            
            if num_cities == 0:
                num_cities = 1  # Fallback
        
        cost_per_city = 0.80  # ~$0.80 per city (200 results * $0.004)
        estimated_cost = num_cities * cost_per_city
        
        return CostEstimateResponse(
            num_cities=num_cities,
            estimated_cost=estimated_cost,
            cost_per_city=cost_per_city
        )
    except Exception as e:
        logger.error(f"Error estimating cost: {e}")
        raise HTTPException(status_code=500, detail="Error. Please try again later.")


@router.post("/orders", response_model=GoogleMapsScraperOrderResponse)
def create_order(
    payload: GoogleMapsScraperOrderCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new Google Maps scraper order.
    
    Orders are queued and processed by a dedicated worker.
    The worker starts Apify runs and handles results via webhooks.
    
    If use_cache=True, checks for existing results and returns cached data instantly.
    
    Note: Multi-state selection (more than 1 state) requires admin privileges.
    """
    try:
        # Validate inputs
        if not payload.search_term.strip():
            raise HTTPException(status_code=400, detail="Search term is required")
        
        if not payload.states or len(payload.states) == 0:
            raise HTTPException(status_code=400, detail="At least one state is required")
        
        if payload.scrape_mode == "single_city" and not payload.city:
            raise HTTPException(status_code=400, detail="City is required for single city mode")
        
        # Build list of cities to scrape
        cities_with_state = []
        if payload.scrape_mode == "single_city":
            cities_with_state = [(payload.states[0], payload.city)]
        else:
            # Get cities across all selected states
            for state in payload.states:
                result = db.execute(text("""
                    SELECT city FROM google_maps_cities WHERE state = :state ORDER BY city
                """), {"state": state})
                state_cities = [row[0] for row in result.fetchall()]
                for city in state_cities:
                    cities_with_state.append((state, city))
        
        num_cities = len(cities_with_state)
        
        if num_cities == 0:
            raise HTTPException(
                status_code=400, 
                detail=f"No cities found for selected states. Please seed the google_maps_cities table."
            )
        
        estimated_cost = apify_service.estimate_cost(num_cities)
        webhook_secret = apify_service.generate_webhook_secret()
        
        # Build webhook URL for worker to use
        # Force HTTPS since Railway terminates SSL at load balancer
        base_url = str(request.base_url).rstrip('/')
        if base_url.startswith("http://") and "localhost" not in base_url and "127.0.0.1" not in base_url:
            base_url = base_url.replace("http://", "https://", 1)
        webhook_url = f"{base_url}/api/v1/webhooks/apify"
        
        logger.info(f"📝 Creating Google Maps scraper order for user {current_user.id}")
        logger.info(f"   Mode: {payload.scrape_mode}, States: {payload.states}, Cities: {num_cities}")
        logger.info(f"   Search term: {payload.search_term}")
        logger.info(f"   Use cache: {payload.use_cache}")
        logger.info(f"   Estimated cost: ${estimated_cost:.2f}")
        
        # Create order in database with status "queued"
        order = LocalScraperOrder(
            user_id=current_user.id,
            status="queued",
            job_name=payload.job_name.strip(),
            scrape_mode=payload.scrape_mode,
            states=payload.states,  # Store as JSON list
            city=payload.city if payload.scrape_mode == "single_city" else None,
            search_term=payload.search_term.strip(),
            total_cities=num_cities,
            completed_cities=0,
            progress_percentage=0,
            estimated_cost=Decimal(str(estimated_cost)),
            webhook_secret=webhook_secret,
            webhook_url=webhook_url,  # Store for worker to use
            apify_run_ids=[],  # Legacy field - new orders use city_jobs table
            # Apify settings from payload
            max_results_per_city=payload.max_results_per_city,
            skip_closed_places=payload.skip_closed_places,
            website_filter=payload.website_filter,
            scrape_reviews=payload.scrape_reviews,
            max_reviews=payload.max_reviews,
            scrape_images=payload.scrape_images,
            max_images=payload.max_images,
            language=payload.language,
        )
        
        db.add(order)
        db.commit()
        db.refresh(order)
        
        logger.info(f"✅ Order created: {order.id}")
        
        # Handle caching if enabled
        cached_count = 0
        pending_count = 0
        total_cached_results = 0
        
        if payload.use_cache:
            # Check cache for each city and create city_jobs
            search_term = payload.search_term.strip()
            
            for i, (state, city) in enumerate(cities_with_state):
                cached_job = find_cached_results(db, city, state, search_term)
                
                if cached_job:
                    # Cache hit - create city_job with cached results
                    city_job = LocalScraperCityJob(
                        order_id=order.id,
                        city_index=i,
                        city=city,
                        state=state,
                        search_term=search_term,
                        status="cached",
                        results=cached_job.results,
                        results_count=cached_job.results_count,
                    )
                    db.add(city_job)
                    cached_count += 1
                    total_cached_results += cached_job.results_count
                    logger.info(f"   💾 Cache hit: {city}, {state} ({cached_job.results_count} results)")
                else:
                    # Cache miss - create pending city_job for worker
                    city_job = LocalScraperCityJob(
                        order_id=order.id,
                        city_index=i,
                        city=city,
                        state=state,
                        search_term=search_term,
                        status="pending",
                    )
                    db.add(city_job)
                    pending_count += 1
            
            db.commit()
            
            # Update order progress based on cache hits
            order.completed_cities = cached_count
            order.results_count = total_cached_results
            order.progress_percentage = int((cached_count / num_cities) * 100)
            
            logger.info(f"   📊 Cache results: {cached_count} cached, {pending_count} pending")
            
            if pending_count == 0:
                # All cities were cached - mark order complete
                order.status = "completed"
                order.completed_at = datetime.utcnow()
                logger.info(f"   ✅ Order fully served from cache!")
            else:
                # Some cities need scraping - queue for worker
                order.status = "processing"
                try:
                    redis_client.lpush(GOOGLE_MAPS_SCRAPER_QUEUE, str(order.id))
                    queue_length = redis_client.llen(GOOGLE_MAPS_SCRAPER_QUEUE)
                    logger.info(f"📤 Queued order {order.id} to {GOOGLE_MAPS_SCRAPER_QUEUE} (queue length: {queue_length})")
                except Exception as e:
                    logger.error(f"❌ Failed to queue order {order.id}: {e}")
            
            db.commit()
        else:
            # No caching - queue order for processing by worker (original behavior)
            try:
                redis_client.lpush(GOOGLE_MAPS_SCRAPER_QUEUE, str(order.id))
                queue_length = redis_client.llen(GOOGLE_MAPS_SCRAPER_QUEUE)
                logger.info(f"📤 Queued order {order.id} to {GOOGLE_MAPS_SCRAPER_QUEUE} (queue length: {queue_length})")
            except Exception as e:
                logger.error(f"❌ Failed to queue order {order.id}: {e}")
                # Don't fail the request - order is created, worker can pick it up later
        
        return order_to_response(order)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {e}")
        raise HTTPException(status_code=500, detail="Error. Please try again later.")


@router.get("/orders", response_model=GoogleMapsScraperOrderListResponse)
def list_orders(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all Google Maps scraper orders for the current user"""
    try:
        query = db.query(LocalScraperOrder).filter(LocalScraperOrder.user_id == current_user.id)
        
        if status_filter:
            query = query.filter(LocalScraperOrder.status == status_filter)
        
        # Get total count
        total = query.count()
        
        # Get paginated results, newest first
        orders = query.order_by(desc(LocalScraperOrder.created_at)).offset(offset).limit(limit).all()
        
        return GoogleMapsScraperOrderListResponse(
            orders=[order_to_response(order) for order in orders],
            total=total,
        )
    except Exception as e:
        logger.error(f"Error listing orders: {e}")
        raise HTTPException(status_code=500, detail="Error. Please try again later.")


@router.get("/orders/{order_id}", response_model=GoogleMapsScraperOrderResponse)
def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific Google Maps scraper order"""
    order = db.query(LocalScraperOrder).filter(
        LocalScraperOrder.id == order_id,
        LocalScraperOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return order_to_response(order)


@router.get("/orders/{order_id}/status", response_model=GoogleMapsScraperStatusResponse)
def get_order_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get real-time status for an order (for polling).
    For new orders, calculates progress from city_jobs table.
    For legacy orders, uses stored values.
    """
    order = db.query(LocalScraperOrder).filter(
        LocalScraperOrder.id == order_id,
        LocalScraperOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if this order uses the new city_jobs table
    city_jobs_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id
    ).count()
    
    if city_jobs_count > 0:
        # New schema: calculate progress from city_jobs table
        # Count completed (scraped) jobs
        completed_count = db.query(LocalScraperCityJob).filter(
            LocalScraperCityJob.order_id == order.id,
            LocalScraperCityJob.status.in_(["completed", "failed"])
        ).count()
        
        # Count cached jobs separately
        cached_count = db.query(LocalScraperCityJob).filter(
            LocalScraperCityJob.order_id == order.id,
            LocalScraperCityJob.status == "cached"
        ).count()
        
        # Total results from both completed and cached jobs
        total_results = db.query(func.sum(LocalScraperCityJob.results_count)).filter(
            LocalScraperCityJob.order_id == order.id,
            LocalScraperCityJob.status.in_(["completed", "cached"])
        ).scalar() or 0
        
        total_cities = city_jobs_count
        # Progress includes both cached and completed
        done_count = completed_count + cached_count
        progress = int((done_count / total_cities) * 100) if total_cities > 0 else 0
        
        return GoogleMapsScraperStatusResponse(
            order_id=str(order.id),
            status=order.status,
            total_cities=total_cities,
            completed_cities=done_count,
            cached_cities=cached_count,
            progress_percentage=progress,
            results_count=total_results,
            error_message=order.error_message,
        )
    else:
        # Legacy schema: use stored values from order
        return GoogleMapsScraperStatusResponse(
            order_id=str(order.id),
            status=order.status,
            total_cities=order.total_cities or 1,
            completed_cities=order.completed_cities or 0,
            cached_cities=0,
            progress_percentage=order.progress_percentage or 0,
            results_count=order.results_count or 0,
            error_message=order.error_message,
        )


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a Google Maps scraper order"""
    order = db.query(LocalScraperOrder).filter(
        LocalScraperOrder.id == order_id,
        LocalScraperOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # If still processing, try to abort Apify runs
    if order.status == "processing" and order.apify_run_ids:
        for run_info in order.apify_run_ids:
            run_id = run_info.get("run_id")
            if run_id and run_info.get("status") == "running":
                try:
                    apify_service.abort_run_sync(run_id)
                except Exception as e:
                    logger.warning(f"Failed to abort run {run_id}: {e}")
    
    # Soft delete by setting status
    order.status = "cancelled"
    order.completed_at = datetime.utcnow()
    db.commit()
    
    logger.info(f"Deleted order {order_id}")
    
    return {"message": "Order deleted successfully", "order_id": order_id}


@router.get("/orders/{order_id}/download")
def download_results(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download results CSV for a completed order"""
    order = db.query(LocalScraperOrder).filter(
        LocalScraperOrder.id == order_id,
        LocalScraperOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Order is not completed (status: {order.status})"
        )
    
    if not order.file_url:
        raise HTTPException(status_code=404, detail="Results file not found")
    
    try:
        # Extract key from URL
        csv_file_path = f"google-maps-scraper/{order.id}/results.csv"
        
        response = s3_client.get_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path
        )
        csv_content = response['Body'].read()
        
        # Generate filename
        safe_job_name = "".join(c for c in order.job_name if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
        if not safe_job_name:
            safe_job_name = "google_maps_results"
        
        # Add location context to filename
        location_part = ""
        if order.scrape_mode == "single_city" and order.city:
            location_part = f"_{order.city}"
        elif order.states:
            states_list = order.states if isinstance(order.states, list) else [order.states]
            if len(states_list) == 1:
                location_part = f"_{states_list[0]}"
            else:
                location_part = "_multi_state"
        
        filename = f"{safe_job_name}{location_part}_{str(order.id)[:8]}.csv"
        
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(csv_content)),
            }
        )
    except Exception as e:
        logger.error(f"Failed to download from R2: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to download results file")


@router.get("/orders/{order_id}/preview")
def preview_results(
    order_id: str,
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Preview first N rows of results for a completed order.
    """
    order = db.query(LocalScraperOrder).filter(
        LocalScraperOrder.id == order_id,
        LocalScraperOrder.user_id == current_user.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Order is not completed (status: {order.status})"
        )
    
    if not order.file_url:
        raise HTTPException(status_code=404, detail="Results file not found")
    
    try:
        csv_file_path = f"google-maps-scraper/{order.id}/results.csv"
        
        response = s3_client.get_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path
        )
        csv_content = response['Body'].read().decode('utf-8-sig')
        
        # Parse CSV and get first N rows
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        rows = []
        for i, row in enumerate(csv_reader):
            if i >= limit:
                break
            rows.append(dict(row))
        
        columns = list(rows[0].keys()) if rows else []
        
        return GoogleMapsScraperPreviewResponse(
            order_id=order_id,
            total_rows=order.results_count or 0,
            preview_count=len(rows),
            columns=columns,
            rows=rows,
        )
        
    except Exception as e:
        logger.error(f"Failed to preview from R2: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load results preview")
