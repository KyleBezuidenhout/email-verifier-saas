#!/usr/bin/env python3
"""
Google Maps Scraper Worker

Background worker that processes Google Maps scraper orders and webhooks:
- Listens to Redis queue "google-maps-scraper-queue" for new orders
- Listens to Redis queue "google-maps-webhook-queue" for webhook payloads
- Polls every 5 minutes to recover stuck jobs

Architecture:
- Worker starts Apify runs and creates city_jobs rows
- Apify sends webhooks to backend
- Backend pushes webhooks to Redis queue
- Worker processes webhooks and updates city_jobs
- Worker finalizes order when all cities complete
"""

import os
import sys
import time
import json
import base64
import logging
import asyncio
import csv
import io
from typing import List, Tuple, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timedelta

import redis
import httpx
import boto3
from sqlalchemy import create_engine, text, func
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.models.local_scraper_order import LocalScraperOrder
from app.models.local_scraper_city_job import LocalScraperCityJob

# Configure logging - ensure unbuffered output for Railway
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True
)
logger = logging.getLogger(__name__)

# ============================================
# CONNECTIONS
# ============================================

# Redis connection
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# PostgreSQL connection
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Queue names
JOB_QUEUE = "google-maps-scraper-queue"
WEBHOOK_QUEUE = "google-maps-webhook-queue"

# Apify configuration
APIFY_BASE_URL = "https://api.apify.com/v2"
APIFY_ACTOR_ID = "compass~crawler-google-places"
MAX_CONCURRENT_RUNS = 20  # 20 concurrent x 4GB = 80GB (within 128GB limit)

# Recovery check interval
RECOVERY_CHECK_INTERVAL = 300  # 5 minutes
last_recovery_check = time.time()


# ============================================
# RETRY LOGIC
# ============================================

# Non-retryable errors (permanent failures - don't waste money)
NON_RETRYABLE_PATTERNS = [
    "location not found",
    "place not found",
    "no results found",
    "invalid location",
    "could not find",
    "zero results",
    "not a valid",
]

# Retryable errors (transient - worth retrying)
RETRYABLE_PATTERNS = [
    "rate limit",
    "429",
    "timeout",
    "timed out",
    "connection",
    "network",
    "502",
    "503",
    "504",
    "temporarily unavailable",
    "internal error",
]

def is_retryable_error(status_message: str) -> bool:
    """Determine if an error is worth retrying (costs money to retry)"""
    msg_lower = (status_message or "").lower()
    
    # Check non-retryable first
    for pattern in NON_RETRYABLE_PATTERNS:
        if pattern in msg_lower:
            return False
    
    # Check retryable patterns
    for pattern in RETRYABLE_PATTERNS:
        if pattern in msg_lower:
            return True
    
    # Default: don't retry unknown errors (safer for cost)
    return False


# ============================================
# APIFY API HELPERS
# ============================================

def get_apify_headers() -> Dict[str, str]:
    """Get authorization headers for Apify API."""
    return {
        "Authorization": f"Bearer {settings.APIFY_API_TOKEN}",
        "Content-Type": "application/json"
    }


def build_input_payload(
    search_term: str,
    city: str,
    max_results: Optional[int] = None,
    skip_closed: bool = True,
    website_filter: str = "withWebsite",
    max_reviews: int = 0,
    max_images: int = 0,
    language: str = "en"
) -> Dict[str, Any]:
    """
    Build the input payload for a single city scrape.
    Uses user-configurable Apify settings.
    """
    location_query = f"{city}, United States"
    
    payload = {
        "searchStringsArray": [search_term],
        "locationQuery": location_query,
        "language": language,
        "maxReviews": max_reviews,
        "maxImages": max_images,
        "maxQuestions": 0,
        "skipClosedPlaces": skip_closed,
        "website": website_filter,
        "scrapeContacts": False,
        "scrapeDirectories": False,
        "includeWebResults": False
    }
    
    # Only set maxCrawledPlacesPerSearch if user specified a limit
    if max_results is not None and max_results > 0:
        payload["maxCrawledPlacesPerSearch"] = max_results
    
    return payload


async def start_apify_run(
    client: httpx.AsyncClient,
    input_payload: Dict[str, Any],
    webhook_url: str,
    order_id: str,
    city_index: int,
    webhook_secret: str,
    memory_mbytes: int = 4096
) -> Dict[str, Any]:
    """Start an Apify run with webhook configuration."""
    webhooks = [{
        "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
        "requestUrl": webhook_url,
        "payloadTemplate": f'{{"orderId": "{order_id}", "cityIndex": {city_index}, "secret": "{webhook_secret}", "resource": {{{{resource}}}}, "eventType": "{{{{eventType}}}}"}}',
        "shouldInterpolateStrings": True
    }]
    
    url = f"{APIFY_BASE_URL}/acts/{APIFY_ACTOR_ID}/runs"
    webhooks_json = json.dumps(webhooks)
    webhooks_base64 = base64.b64encode(webhooks_json.encode('utf-8')).decode('utf-8')
    params = {
        "memory": memory_mbytes,
        "webhooks": webhooks_base64
    }
    
    response = await client.post(
        url,
        headers=get_apify_headers(),
        params=params,
        json=input_payload,
        timeout=30.0
    )
    
    if response.status_code >= 400:
        logger.error(f"Apify API error {response.status_code}: {response.text}")
    
    response.raise_for_status()
    result = response.json()
    
    return result.get("data", {})


async def get_apify_run_status(run_id: str) -> Optional[Dict[str, Any]]:
    """Get the current status of an Apify run."""
    try:
        url = f"{APIFY_BASE_URL}/actor-runs/{run_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=get_apify_headers())
            if response.status_code == 200:
                return response.json().get("data", {})
            return None
    except Exception as e:
        logger.error(f"Error getting run status for {run_id}: {e}")
        return None


async def get_dataset_items(dataset_id: str) -> List[Dict[str, Any]]:
    """Fetch items from an Apify dataset."""
    url = f"{APIFY_BASE_URL}/datasets/{dataset_id}/items"
    params = {"offset": 0, "limit": 10000, "format": "json"}
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, headers=get_apify_headers(), params=params)
        response.raise_for_status()
        return response.json()


def extract_output_fields(place: Dict[str, Any]) -> Dict[str, Any]:
    """Extract the fields we need from an Apify place result."""
    location = place.get("location", {}) or {}
    
    return {
        "placeId": place.get("placeId", ""),
        "title": place.get("title", ""),
        "website": place.get("website", ""),
        "phone": place.get("phone", ""),
        "address": place.get("address", ""),
        "city": place.get("city", ""),
        "state": place.get("state", ""),
        "postalCode": place.get("postalCode", ""),
        "totalScore": place.get("totalScore"),
        "reviewsCount": place.get("reviewsCount", 0),
        "categoryName": place.get("categoryName", ""),
        "latitude": location.get("lat"),
        "longitude": location.get("lng"),
    }


# ============================================
# ORDER PROCESSING (NEW ORDERS)
# ============================================

def get_cities_for_order(db, order: LocalScraperOrder) -> List[Tuple[str, str]]:
    """Get list of (state, city) tuples for an order."""
    cities_with_state = []
    
    if order.scrape_mode == "single_city":
        state = order.states[0] if order.states else ""
        cities_with_state = [(state, order.city)]
    else:
        for state in (order.states or []):
            result = db.execute(text("""
                SELECT city FROM google_maps_cities WHERE state = :state ORDER BY city
            """), {"state": state})
            state_cities = [row[0] for row in result.fetchall()]
            
            for city in state_cities:
                cities_with_state.append((state, city))
    
    return cities_with_state


async def process_order(order_id: str) -> bool:
    """
    Process a new Google Maps scraper order:
    1. Create city_job rows for each city
    2. Start initial batch of Apify runs
    """
    db = SessionLocal()
    
    try:
        try:
            order_uuid = UUID(order_id)
        except ValueError:
            logger.error(f"Invalid order ID format: {order_id}")
            return False
        
        order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_uuid).first()
        if not order:
            logger.error(f"Order {order_id} not found")
            return False
        
        if order.status not in ['queued', 'pending']:
            logger.warning(f"Order {order_id} has status '{order.status}', skipping")
            return False
        
        logger.info(f"🔄 Processing Google Maps scraper order {order_id}")
        logger.info(f"   Mode: {order.scrape_mode}, States: {order.states}")
        logger.info(f"   Search term: {order.search_term}")
        
        # Get cities to scrape
        cities_with_state = get_cities_for_order(db, order)
        
        if not cities_with_state:
            logger.error(f"No cities found for order {order_id}")
            order.status = "failed"
            order.error_message = "No cities found for selected states"
            db.commit()
            return False
        
        num_cities = len(cities_with_state)
        logger.info(f"   Total cities to scrape: {num_cities}")
        
        webhook_url = order.webhook_url
        if not webhook_url:
            logger.error(f"Order {order_id} has no webhook URL")
            order.status = "failed"
            order.error_message = "No webhook URL configured"
            db.commit()
            return False
        
        # Update order status
        order.status = "processing"
        order.started_at = datetime.utcnow()
        order.total_cities = num_cities
        db.commit()
        
        # Create city_job rows for ALL cities
        for i, (state, city) in enumerate(cities_with_state):
            city_job = LocalScraperCityJob(
                order_id=order.id,
                city_index=i,
                city=city,
                state=state,
                status="pending"
            )
            db.add(city_job)
        
        db.commit()
        logger.info(f"📋 Created {num_cities} city_job rows")
        
        # Start initial batch of MAX_CONCURRENT_RUNS jobs
        initial_batch_size = min(MAX_CONCURRENT_RUNS, num_cities)
        
        logger.info(f"🚀 Starting initial batch of {initial_batch_size} jobs")
        
        successful_runs = 0
        failed_runs = 0
        
        async with httpx.AsyncClient() as client:
            for i in range(initial_batch_size):
                state, city = cities_with_state[i]
                
                # Build input with user's Apify settings
                input_payload = build_input_payload(
                    search_term=order.search_term,
                    city=city,
                    max_results=order.max_results_per_city,
                    skip_closed=order.skip_closed_places if order.skip_closed_places is not None else True,
                    website_filter=order.website_filter or "withWebsite",
                    max_reviews=order.max_reviews or 0,
                    max_images=order.max_images or 0,
                    language=order.language or "en"
                )
                
                try:
                    run_data = await start_apify_run(
                        client=client,
                        input_payload=input_payload,
                        webhook_url=webhook_url,
                        order_id=str(order.id),
                        city_index=i,
                        webhook_secret=order.webhook_secret
                    )
                    
                    run_id = run_data.get("id")
                    logger.info(f"✅ Started run {run_id} for {city}, {state}")
                    
                    # Update city_job row
                    db.query(LocalScraperCityJob).filter(
                        LocalScraperCityJob.order_id == order.id,
                        LocalScraperCityJob.city_index == i
                    ).update({
                        "run_id": run_id,
                        "status": "running",
                        "updated_at": datetime.utcnow()
                    })
                    
                    successful_runs += 1
                    
                except Exception as e:
                    logger.error(f"Failed to start run for city {city}, {state}: {e}")
                    
                    db.query(LocalScraperCityJob).filter(
                        LocalScraperCityJob.order_id == order.id,
                        LocalScraperCityJob.city_index == i
                    ).update({
                        "status": "failed",
                        "error": str(e),
                        "updated_at": datetime.utcnow()
                    })
                    
                    failed_runs += 1
        
        db.commit()
        
        # Log performance report
        pending_count = num_cities - initial_batch_size
        logger.info("=" * 60)
        logger.info("SCRAPE JOB INITIATED")
        logger.info("=" * 60)
        logger.info(f"Order ID: {order_id}")
        logger.info(f"Total Cities: {num_cities}")
        logger.info(f"Initial Batch Started: {successful_runs}")
        logger.info(f"Initial Batch Failed: {failed_runs}")
        logger.info(f"Pending (rolling queue): {pending_count}")
        logger.info("=" * 60)
        
        if successful_runs == 0 and initial_batch_size > 0:
            order.status = "failed"
            order.error_message = "All initial Apify runs failed to start"
            db.commit()
        
        return successful_runs > 0
        
    except Exception as e:
        logger.error(f"❌ Error processing order {order_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
            order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == UUID(order_id)).first()
            if order:
                order.status = "failed"
                order.error_message = str(e)
                db.commit()
        except:
            pass
        return False
    finally:
        db.close()


# ============================================
# WEBHOOK PROCESSING
# ============================================

async def process_webhook(payload: Dict[str, Any]) -> None:
    """
    Process a webhook payload from the queue.
    Updates city_job row and starts next pending job.
    """
    order_id = payload.get("orderId")
    city_index = payload.get("cityIndex")
    event_type = payload.get("eventType")
    resource = payload.get("resource", {})
    webhook_url = payload.get("webhookUrl")
    
    logger.info(f"🔄 Processing webhook: order={order_id}, city={city_index}, event={event_type}")
    
    db = SessionLocal()
    try:
        order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_id).first()
        if not order:
            logger.error(f"Order {order_id} not found")
            return
        
        # Check if this order uses new schema (city_jobs table)
        city_job = db.query(LocalScraperCityJob).filter(
            LocalScraperCityJob.order_id == order.id,
            LocalScraperCityJob.city_index == city_index
        ).first()
        
        if city_job:
            # New schema - process with city_jobs table
            await process_webhook_new_schema(db, order, city_job, event_type, resource, webhook_url)
        else:
            # Legacy schema - process with apify_run_ids
            await process_webhook_legacy_schema(db, order, city_index, event_type, resource, webhook_url)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing webhook for order {order_id}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


async def process_webhook_new_schema(
    db, 
    order: LocalScraperOrder, 
    city_job: LocalScraperCityJob,
    event_type: str,
    resource: Dict[str, Any],
    webhook_url: str
) -> None:
    """Process webhook for orders using the new city_jobs table."""
    
    if event_type == "ACTOR.RUN.SUCCEEDED":
        dataset_id = resource.get("defaultDatasetId")
        
        if not dataset_id:
            city_job.status = "failed"
            city_job.error = "No dataset ID returned"
            city_job.updated_at = datetime.utcnow()
        else:
            try:
                items = await get_dataset_items(dataset_id)
                logger.info(f"✅ Fetched {len(items)} items from {city_job.city}, {city_job.state}")
                
                city_job.status = "completed"
                city_job.dataset_id = dataset_id
                city_job.results_count = len(items)
                city_job.results = [extract_output_fields(item) for item in items]
                city_job.updated_at = datetime.utcnow()
                
            except Exception as e:
                logger.error(f"Failed to fetch dataset {dataset_id}: {e}")
                city_job.status = "failed"
                city_job.error = str(e)
                city_job.updated_at = datetime.utcnow()
        
        db.commit()
        
    elif event_type in ["ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"]:
        status_message = resource.get("statusMessage", "")
        
        # Check if error is retryable
        if is_retryable_error(status_message) and city_job.retry_count < 3:
            # Wait 3 seconds before retry
            await asyncio.sleep(3)
            
            # Retry the job
            city_job.retry_count += 1
            logger.info(f"🔄 Retrying {city_job.city}, {city_job.state} (attempt {city_job.retry_count}/3)")
            
            try:
                input_payload = build_input_payload(
                    search_term=order.search_term,
                    city=city_job.city,
                    max_results=order.max_results_per_city,
                    skip_closed=order.skip_closed_places if order.skip_closed_places is not None else True,
                    website_filter=order.website_filter or "withWebsite",
                    max_reviews=order.max_reviews or 0,
                    max_images=order.max_images or 0,
                    language=order.language or "en"
                )
                
                async with httpx.AsyncClient() as client:
                    run_data = await start_apify_run(
                        client=client,
                        input_payload=input_payload,
                        webhook_url=webhook_url,
                        order_id=str(order.id),
                        city_index=city_job.city_index,
                        webhook_secret=order.webhook_secret
                    )
                
                city_job.run_id = run_data.get("id")
                city_job.status = "running"
                city_job.error = None
                city_job.updated_at = datetime.utcnow()
                logger.info(f"✅ Retry started: run {city_job.run_id}")
                
            except Exception as e:
                logger.error(f"Failed to retry {city_job.city}: {e}")
                city_job.status = "failed"
                city_job.error = str(e)
                city_job.updated_at = datetime.utcnow()
        else:
            # Non-retryable or max retries reached
            city_job.status = "failed"
            city_job.error = status_message or "Job failed"
            city_job.updated_at = datetime.utcnow()
            logger.warning(f"❌ {city_job.city}, {city_job.state} failed (not retrying): {status_message}")
        
        db.commit()
    
    # Check progress and start next job
    await check_progress_and_continue(db, order, webhook_url)


async def process_webhook_legacy_schema(
    db,
    order: LocalScraperOrder,
    city_index: int,
    event_type: str,
    resource: Dict[str, Any],
    webhook_url: str
) -> None:
    """Process webhook for legacy orders using apify_run_ids JSON column."""
    from sqlalchemy.orm.attributes import flag_modified
    
    apify_runs = order.apify_run_ids or []
    if city_index >= len(apify_runs):
        logger.error(f"City index {city_index} out of range for order {order.id}")
        return
    
    run_info = apify_runs[city_index]
    city = run_info.get("city", "unknown")
    state = run_info.get("state", "unknown")
    
    if event_type == "ACTOR.RUN.SUCCEEDED":
        dataset_id = resource.get("defaultDatasetId")
        
        if not dataset_id:
            run_info["status"] = "failed"
            run_info["error"] = "No dataset ID returned"
        else:
            try:
                items = await get_dataset_items(dataset_id)
                logger.info(f"✅ Fetched {len(items)} items from {city}, {state} (legacy)")
                
                run_info["status"] = "completed"
                run_info["dataset_id"] = dataset_id
                run_info["results_count"] = len(items)
                run_info["results"] = [extract_output_fields(item) for item in items]
                
            except Exception as e:
                logger.error(f"Failed to fetch dataset {dataset_id}: {e}")
                run_info["status"] = "failed"
                run_info["error"] = str(e)
        
    elif event_type in ["ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"]:
        status_message = resource.get("statusMessage", "")
        retry_count = run_info.get("retry_count", 0)
        
        if is_retryable_error(status_message) and retry_count < 3:
            await asyncio.sleep(3)
            
            run_info["retry_count"] = retry_count + 1
            logger.info(f"🔄 Retrying {city}, {state} (attempt {run_info['retry_count']}/3) (legacy)")
            
            try:
                input_payload = build_input_payload(
                    search_term=order.search_term,
                    city=city
                )
                
                async with httpx.AsyncClient() as client:
                    run_data = await start_apify_run(
                        client=client,
                        input_payload=input_payload,
                        webhook_url=webhook_url,
                        order_id=str(order.id),
                        city_index=city_index,
                        webhook_secret=order.webhook_secret
                    )
                
                run_info["run_id"] = run_data.get("id")
                run_info["status"] = "running"
                run_info.pop("error", None)
                
            except Exception as e:
                run_info["status"] = "failed"
                run_info["error"] = str(e)
        else:
            run_info["status"] = "failed"
            run_info["error"] = status_message or "Job failed"
    
    apify_runs[city_index] = run_info
    order.apify_run_ids = apify_runs
    flag_modified(order, "apify_run_ids")
    
    # Update progress
    completed = sum(1 for r in apify_runs if r.get("status") in ["completed", "failed"])
    order.completed_cities = completed
    order.progress_percentage = int((completed / order.total_cities) * 100)
    
    db.commit()
    
    # Check if complete or start next
    if completed >= order.total_cities:
        await finalize_order_legacy(db, order)
    else:
        await start_next_pending_legacy(db, order, webhook_url)


async def check_progress_and_continue(db, order: LocalScraperOrder, webhook_url: str) -> None:
    """Check order progress and start next pending job or finalize."""
    
    # Count job statuses
    completed_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id,
        LocalScraperCityJob.status.in_(["completed", "failed"])
    ).count()
    
    total_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id
    ).count()
    
    running_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id,
        LocalScraperCityJob.status == "running"
    ).count()
    
    logger.info(f"📊 Progress: {completed_count}/{total_count} done, {running_count} running")
    
    if completed_count >= total_count:
        # All done - finalize order
        await finalize_order_new_schema(db, order)
    else:
        # Start next pending jobs
        await start_next_pending_jobs(db, order, webhook_url)


async def start_next_pending_jobs(db, order: LocalScraperOrder, webhook_url: str) -> None:
    """Start next pending city jobs to maintain rolling queue."""
    
    running_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id,
        LocalScraperCityJob.status == "running"
    ).count()
    
    jobs_to_start = MAX_CONCURRENT_RUNS - running_count
    
    if jobs_to_start <= 0:
        return
    
    # Get next pending jobs
    pending_jobs = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id,
        LocalScraperCityJob.status == "pending"
    ).order_by(LocalScraperCityJob.city_index).limit(jobs_to_start).all()
    
    if not pending_jobs:
        return
    
    started_count = 0
    
    async with httpx.AsyncClient() as client:
        for job in pending_jobs:
            input_payload = build_input_payload(
                search_term=order.search_term,
                city=job.city,
                max_results=order.max_results_per_city,
                skip_closed=order.skip_closed_places if order.skip_closed_places is not None else True,
                website_filter=order.website_filter or "withWebsite",
                max_reviews=order.max_reviews or 0,
                max_images=order.max_images or 0,
                language=order.language or "en"
            )
            
            try:
                run_data = await start_apify_run(
                    client=client,
                    input_payload=input_payload,
                    webhook_url=webhook_url,
                    order_id=str(order.id),
                    city_index=job.city_index,
                    webhook_secret=order.webhook_secret
                )
                
                job.run_id = run_data.get("id")
                job.status = "running"
                job.updated_at = datetime.utcnow()
                
                logger.info(f"✅ Started run {job.run_id} for {job.city}, {job.state}")
                started_count += 1
                
            except Exception as e:
                logger.error(f"Failed to start run for {job.city}: {e}")
                job.status = "failed"
                job.error = str(e)
                job.updated_at = datetime.utcnow()
    
    db.commit()
    
    if started_count > 0:
        logger.info(f"📊 Rolling queue: started {started_count} new jobs")


async def start_next_pending_legacy(db, order: LocalScraperOrder, webhook_url: str) -> None:
    """Start next pending city for legacy orders using apify_run_ids."""
    from sqlalchemy.orm.attributes import flag_modified
    
    apify_runs = order.apify_run_ids or []
    running_count = sum(1 for r in apify_runs if r.get("status") == "running")
    
    started_count = 0
    
    async with httpx.AsyncClient() as client:
        while running_count < MAX_CONCURRENT_RUNS:
            pending_index = None
            for i, run_info in enumerate(apify_runs):
                if run_info.get("status") == "pending":
                    pending_index = i
                    break
            
            if pending_index is None:
                break
            
            run_info = apify_runs[pending_index]
            city = run_info.get("city")
            
            try:
                input_payload = build_input_payload(
                    search_term=order.search_term,
                    city=city
                )
                
                run_data = await start_apify_run(
                    client=client,
                    input_payload=input_payload,
                    webhook_url=webhook_url,
                    order_id=str(order.id),
                    city_index=pending_index,
                    webhook_secret=order.webhook_secret
                )
                
                apify_runs[pending_index]["run_id"] = run_data.get("id")
                apify_runs[pending_index]["status"] = "running"
                running_count += 1
                started_count += 1
                
            except Exception as e:
                apify_runs[pending_index]["status"] = "failed"
                apify_runs[pending_index]["error"] = str(e)
    
    if started_count > 0:
        order.apify_run_ids = apify_runs
        flag_modified(order, "apify_run_ids")
        db.commit()
        logger.info(f"📊 Rolling queue (legacy): started {started_count} new jobs")


# ============================================
# ORDER FINALIZATION
# ============================================

async def finalize_order_new_schema(db, order: LocalScraperOrder) -> None:
    """Finalize an order using the new city_jobs table."""
    
    logger.info(f"🏁 Finalizing order {order.id}")
    
    # Get all completed city jobs
    completed_jobs = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id,
        LocalScraperCityJob.status == "completed"
    ).all()
    
    # Collect and deduplicate results by placeId
    all_results = {}
    for job in completed_jobs:
        for place in (job.results or []):
            place_id = place.get("placeId")
            if place_id and place_id not in all_results:
                all_results[place_id] = place
    
    results_list = list(all_results.values())
    order.results_count = len(results_list)
    
    # Count stats
    failed_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id,
        LocalScraperCityJob.status == "failed"
    ).count()
    
    total_count = db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id
    ).count()
    
    logger.info(f"Order {order.id} finalized: {len(results_list)} unique results from {total_count} cities ({failed_count} failed)")
    
    if results_list:
        # Create CSV
        csv_buffer = io.StringIO()
        fieldnames = [
            "placeId", "title", "website", "phone", "address",
            "city", "state", "postalCode", "totalScore", "reviewsCount",
            "categoryName", "latitude", "longitude"
        ]
        writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results_list)
        
        csv_bytes = csv_buffer.getvalue().encode('utf-8')
        
        # Upload to R2
        csv_file_path = f"google-maps-scraper/{order.id}/results.csv"
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path,
            Body=csv_bytes,
            ContentType="text/csv"
        )
        
        order.file_url = f"{settings.CLOUDFLARE_R2_PUBLIC_URL}/{csv_file_path}"
        logger.info(f"Uploaded results to R2: {order.file_url}")
    
    # Set final status
    if failed_count > 0:
        order.error_message = f"{failed_count} of {total_count} cities failed"
    
    order.status = "completed"
    order.completed_at = datetime.utcnow()
    order.progress_percentage = 100
    order.completed_cities = total_count
    
    # Clear results from city_jobs to save space
    db.query(LocalScraperCityJob).filter(
        LocalScraperCityJob.order_id == order.id
    ).update({"results": []})
    
    db.commit()
    
    # Log final report
    logger.info("=" * 60)
    logger.info("SCRAPE JOB COMPLETED")
    logger.info("=" * 60)
    logger.info(f"Order ID: {order.id}")
    logger.info(f"Total Cities: {total_count}")
    logger.info(f"Successful: {total_count - failed_count}")
    logger.info(f"Failed: {failed_count}")
    logger.info(f"Unique Results: {len(results_list)}")
    logger.info("=" * 60)


async def finalize_order_legacy(db, order: LocalScraperOrder) -> None:
    """Finalize a legacy order using apify_run_ids."""
    from sqlalchemy.orm.attributes import flag_modified
    
    apify_runs = order.apify_run_ids or []
    
    # Collect and deduplicate results
    all_results = {}
    for run_info in apify_runs:
        for place in run_info.get("results", []):
            place_id = place.get("placeId")
            if place_id and place_id not in all_results:
                all_results[place_id] = place
    
    results_list = list(all_results.values())
    order.results_count = len(results_list)
    
    failed_cities = sum(1 for r in apify_runs if r.get("status") == "failed")
    
    if results_list:
        csv_buffer = io.StringIO()
        fieldnames = [
            "placeId", "title", "website", "phone", "address",
            "city", "state", "postalCode", "totalScore", "reviewsCount",
            "categoryName", "latitude", "longitude"
        ]
        writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results_list)
        
        csv_bytes = csv_buffer.getvalue().encode('utf-8')
        
        csv_file_path = f"google-maps-scraper/{order.id}/results.csv"
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=csv_file_path,
            Body=csv_bytes,
            ContentType="text/csv"
        )
        
        order.file_url = f"{settings.CLOUDFLARE_R2_PUBLIC_URL}/{csv_file_path}"
    
    if failed_cities > 0:
        order.error_message = f"{failed_cities} of {order.total_cities} cities failed"
    
    order.status = "completed"
    order.completed_at = datetime.utcnow()
    order.progress_percentage = 100
    
    # Clear results from apify_run_ids
    for run_info in apify_runs:
        run_info.pop("results", None)
    order.apify_run_ids = apify_runs
    flag_modified(order, "apify_run_ids")
    
    db.commit()
    
    logger.info(f"✅ Order {order.id} finalized (legacy): {len(results_list)} results")


# ============================================
# RECOVERY POLLING
# ============================================

async def recover_stuck_jobs() -> None:
    """
    Find and recover jobs stuck in 'running' state.
    Called every 5 minutes to handle webhooks that were lost.
    """
    logger.info("🔍 Running recovery check for stuck jobs...")
    
    db = SessionLocal()
    try:
        # Find city jobs stuck in 'running' for > 10 minutes
        stuck_threshold = datetime.utcnow() - timedelta(minutes=10)
        
        stuck_jobs = db.query(LocalScraperCityJob).filter(
            LocalScraperCityJob.status == "running",
            LocalScraperCityJob.updated_at < stuck_threshold
        ).all()
        
        if not stuck_jobs:
            logger.info("No stuck jobs found")
            return
        
        logger.info(f"Found {len(stuck_jobs)} potentially stuck jobs")
        
        for job in stuck_jobs:
            if not job.run_id:
                continue
            
            # Check actual status on Apify
            apify_status = await get_apify_run_status(job.run_id)
            
            if not apify_status:
                continue
            
            status = apify_status.get("status", "").upper()
            
            if status == "SUCCEEDED":
                logger.info(f"🔧 Recovering completed job: {job.city}, {job.state}")
                
                dataset_id = apify_status.get("defaultDatasetId")
                if dataset_id:
                    try:
                        items = await get_dataset_items(dataset_id)
                        job.status = "completed"
                        job.dataset_id = dataset_id
                        job.results_count = len(items)
                        job.results = [extract_output_fields(item) for item in items]
                        job.updated_at = datetime.utcnow()
                    except Exception as e:
                        job.status = "failed"
                        job.error = str(e)
                        job.updated_at = datetime.utcnow()
                else:
                    job.status = "failed"
                    job.error = "No dataset ID in recovery"
                    job.updated_at = datetime.utcnow()
                
            elif status in ["FAILED", "ABORTED", "TIMED-OUT"]:
                logger.info(f"🔧 Recovering failed job: {job.city}, {job.state}")
                job.status = "failed"
                job.error = apify_status.get("statusMessage", "Failed (recovered)")
                job.updated_at = datetime.utcnow()
        
        db.commit()
        
        # Check if any orders need finalization or continuation
        order_ids = set(job.order_id for job in stuck_jobs)
        for order_id in order_ids:
            order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_id).first()
            if order and order.status == "processing":
                await check_progress_and_continue(db, order, order.webhook_url)
        
    except Exception as e:
        logger.error(f"Error in recovery check: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


# ============================================
# MAIN WORKER LOOP
# ============================================

def main():
    """Main worker loop - polls queues and processes jobs/webhooks."""
    global last_recovery_check
    
    logger.info(f"🚀 Google Maps Scraper worker starting...")
    logger.info(f"📋 Job queue: {JOB_QUEUE}")
    logger.info(f"📋 Webhook queue: {WEBHOOK_QUEUE}")
    logger.info(f"⚙️ Max concurrent runs: {MAX_CONCURRENT_RUNS}")
    logger.info(f"⏰ Recovery check interval: {RECOVERY_CHECK_INTERVAL}s")
    
    while True:
        try:
            # Priority 1: Process webhooks (they're time-sensitive)
            webhook_data = redis_client.brpop(WEBHOOK_QUEUE, timeout=1)
            if webhook_data:
                payload = json.loads(webhook_data[1])
                asyncio.run(process_webhook(payload))
                continue
            
            # Priority 2: Process new orders
            job_data = redis_client.brpop(JOB_QUEUE, timeout=1)
            if job_data:
                order_id = job_data[1]
                logger.info(f"📥 Received order {order_id} from queue")
                success = asyncio.run(process_order(order_id))
                if success:
                    logger.info(f"✅ Successfully started order {order_id}")
                else:
                    logger.error(f"❌ Failed to process order {order_id}")
                continue
            
            # Priority 3: Recovery check (every 5 minutes)
            if time.time() - last_recovery_check > RECOVERY_CHECK_INTERVAL:
                asyncio.run(recover_stuck_jobs())
                last_recovery_check = time.time()
            
            # Small sleep to prevent tight loop
            time.sleep(0.1)
            
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down worker...")
            break
        except Exception as e:
            logger.error(f"❌ Error in worker loop: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(1)


if __name__ == "__main__":
    main()
