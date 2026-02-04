#!/usr/bin/env python3
"""
Google Maps Scraper Worker

Background worker that processes Google Maps scraper orders:
- Listens to Redis queue "google-maps-scraper-queue" for new orders
- Fetches order details and builds city list
- Starts Apify runs in batches of 100 (concurrency limit)
- Updates order status - webhooks handle results

Architecture:
- Worker starts Apify runs
- Apify sends webhooks to backend when runs complete
- Backend webhook handler processes results and finalizes order
"""

import os
import sys
import time
import json
import base64
import logging
import asyncio
from typing import List, Tuple, Dict, Any
from uuid import UUID
from datetime import datetime

import redis
import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.models.local_scraper_order import LocalScraperOrder

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

# Queue name
GOOGLE_MAPS_SCRAPER_QUEUE = "google-maps-scraper-queue"

# Apify configuration
APIFY_BASE_URL = "https://api.apify.com/v2"
APIFY_ACTOR_ID = "compass~crawler-google-places"
MAX_CONCURRENT_RUNS = 20  # 20 concurrent x 4GB = 80GB (within 128GB limit)


# ============================================
# APIFY API HELPERS
# ============================================

def get_apify_headers() -> Dict[str, str]:
    """Get authorization headers for Apify API."""
    return {
        "Authorization": f"Bearer {settings.APIFY_API_TOKEN}",
        "Content-Type": "application/json"
    }


def build_input_payload(search_term: str, city: str) -> Dict[str, Any]:
    """
    Build the input payload for a single city scrape.
    
    Uses locationQuery format: "City, United States" (per Apify recommendation)
    No results cap - scrapes all places, filtered by skipClosedPlaces and website filters.
    """
    location_query = f"{city}, United States"
    
    return {
        "searchStringsArray": [search_term],
        "locationQuery": location_query,
        "language": "en",
        # No maxCrawledPlacesPerSearch - scrape ALL results
        "maxReviews": 0,
        "maxImages": 0,
        "maxQuestions": 0,
        "skipClosedPlaces": True,  # Filter out closed businesses
        "website": "withWebsite",  # Only businesses with websites
        "scrapeContacts": False,
        "scrapeDirectories": False,
        "includeWebResults": False
    }


async def start_apify_run(
    client: httpx.AsyncClient,
    input_payload: Dict[str, Any],
    webhook_url: str,
    order_id: str,
    city_index: int,
    webhook_secret: str,
    memory_mbytes: int = 4096
) -> Dict[str, Any]:
    """
    Start an Apify run with webhook configuration.
    
    The webhook will be called when the run finishes (SUCCEEDED, FAILED, ABORTED, TIMED-OUT).
    """
    # Construct webhook configuration
    # Note: shouldInterpolateStrings is needed for {{eventType}} inside quotes to be replaced
    webhooks = [{
        "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
        "requestUrl": webhook_url,
        "payloadTemplate": f'{{"orderId": "{order_id}", "cityIndex": {city_index}, "secret": "{webhook_secret}", "resource": {{{{resource}}}}, "eventType": "{{{{eventType}}}}"}}',
        "shouldInterpolateStrings": True
    }]
    
    url = f"{APIFY_BASE_URL}/acts/{APIFY_ACTOR_ID}/runs"
    # Webhooks must be passed as a query parameter (base64-encoded JSON), not in the body
    # Per Apify docs: https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks
    webhooks_json = json.dumps(webhooks)
    webhooks_base64 = base64.b64encode(webhooks_json.encode('utf-8')).decode('utf-8')
    params = {
        "memory": memory_mbytes,
        "webhooks": webhooks_base64
    }
    
    # Body contains only the actor input
    body = input_payload
    
    response = await client.post(
        url,
        headers=get_apify_headers(),
        params=params,
        json=body,
        timeout=30.0
    )
    
    # Log error details before raising
    if response.status_code >= 400:
        logger.error(f"Apify API error {response.status_code}: {response.text}")
    
    response.raise_for_status()
    result = response.json()
    
    return result.get("data", {})


async def check_apify_health() -> bool:
    """Check if Apify API is accessible and token is valid."""
    if not settings.APIFY_API_TOKEN:
        logger.warning("APIFY_API_TOKEN not configured")
        return False
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{APIFY_BASE_URL}/users/me",
                headers=get_apify_headers(),
                timeout=10.0
            )
            
            if response.status_code == 200:
                user_data = response.json().get("data", {})
                username = user_data.get("username", "unknown")
                logger.info(f"✅ Apify API connected (user: {username})")
                return True
            elif response.status_code == 401:
                logger.error("❌ Invalid Apify API token")
                return False
            else:
                logger.warning(f"⚠️ Apify API returned status {response.status_code}")
                return False
    except Exception as e:
        logger.error(f"❌ Could not connect to Apify API: {str(e)}")
        return False


# ============================================
# ORDER PROCESSING
# ============================================

def get_cities_for_order(db, order: LocalScraperOrder) -> List[Tuple[str, str]]:
    """
    Get list of (state, city) tuples for an order.
    
    For single_city mode: Returns the single city
    For full_state mode: Queries database for all cities in selected states
    """
    cities_with_state = []
    
    if order.scrape_mode == "single_city":
        # Single city mode - just one city
        state = order.states[0] if order.states else ""
        cities_with_state = [(state, order.city)]
    else:
        # Full state mode - get all cities from all selected states
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
    Process a single Google Maps scraper order:
    1. Fetch order from database
    2. Build city list
    3. Start Apify runs in batches
    4. Update order status
    """
    db = SessionLocal()
    
    try:
        # Parse order ID
        try:
            order_uuid = UUID(order_id)
        except ValueError:
            logger.error(f"Invalid order ID format: {order_id}")
            return False
        
        # Fetch order
        order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_uuid).first()
        if not order:
            logger.error(f"Order {order_id} not found")
            return False
        
        # Check order state
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
        
        # Get webhook URL from order
        webhook_url = order.webhook_url
        if not webhook_url:
            logger.error(f"Order {order_id} has no webhook URL")
            order.status = "failed"
            order.error_message = "No webhook URL configured"
            db.commit()
            return False
        
        # Update status to processing
        order.status = "processing"
        order.started_at = datetime.utcnow()
        order.total_cities = num_cities
        db.commit()
        
        # Initialize ALL cities as "pending" in apify_run_ids
        # This allows the webhook handler to start new jobs as others complete
        apify_runs = []
        for i, (state, city) in enumerate(cities_with_state):
            apify_runs.append({
                "state": state,
                "city": city,
                "city_index": i,
                "run_id": None,
                "status": "pending",
                "retry_count": 0
            })
        
        # Save initial state with all cities as pending
        order.apify_run_ids = apify_runs
        db.commit()
        
        logger.info(f"📋 Initialized {num_cities} cities as pending")
        
        # Start only the first MAX_CONCURRENT_RUNS (20) jobs
        # Webhook handler will start more as these complete (rolling queue)
        initial_batch_size = min(MAX_CONCURRENT_RUNS, num_cities)
        initial_batch = cities_with_state[:initial_batch_size]
        
        logger.info(f"🚀 Starting initial batch of {initial_batch_size} jobs (rolling queue will maintain {MAX_CONCURRENT_RUNS} concurrent)")
        
        successful_runs = 0
        failed_runs = 0
        
        async with httpx.AsyncClient() as client:
            # Create tasks for initial batch only
            tasks = []
            for i, (state, city) in enumerate(initial_batch):
                input_payload = build_input_payload(
                    search_term=order.search_term,
                    city=city
                )
                
                tasks.append(
                    start_apify_run(
                        client=client,
                        input_payload=input_payload,
                        webhook_url=webhook_url,
                        order_id=str(order.id),
                        city_index=i,
                        webhook_secret=order.webhook_secret
                    )
                )
            
            # Execute initial batch concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results for initial batch
            for i, result in enumerate(results):
                state, city = initial_batch[i]
                
                if isinstance(result, Exception):
                    logger.error(f"Failed to start run for city {city}, {state}: {result}")
                    apify_runs[i]["status"] = "failed"
                    apify_runs[i]["error"] = str(result)
                    failed_runs += 1
                else:
                    run_id = result.get("id")
                    logger.info(f"✅ Started run {run_id} for {city}, {state}")
                    apify_runs[i]["run_id"] = run_id
                    apify_runs[i]["status"] = "running"
                    successful_runs += 1
        
        # Update order with initial batch results
        order.apify_run_ids = apify_runs
        db.commit()
        
        # Calculate pending count
        pending_count = num_cities - initial_batch_size
        
        # ============================================
        # PERFORMANCE REPORT - Job Initiated
        # ============================================
        logger.info("=" * 60)
        logger.info("SCRAPE JOB INITIATED - PERFORMANCE REPORT")
        logger.info("=" * 60)
        logger.info(f"Order ID: {order_id}")
        logger.info(f"Search Term: {order.search_term}")
        logger.info(f"States: {order.states}")
        logger.info(f"Total Cities: {num_cities}")
        logger.info(f"Concurrent Limit: {MAX_CONCURRENT_RUNS}")
        logger.info(f"Memory per Job: 4096 MB")
        logger.info("-" * 60)
        logger.info(f"Initial Batch Started: {successful_runs}")
        logger.info(f"Initial Batch Failed: {failed_runs}")
        logger.info(f"Pending (rolling queue): {pending_count}")
        logger.info("-" * 60)
        
        # Log any failed cities in initial batch
        if failed_runs > 0:
            logger.info("FAILED CITIES (Initial Batch):")
            for run_info in apify_runs[:initial_batch_size]:
                if run_info.get('status') == 'failed':
                    city = run_info.get('city', 'unknown')
                    state = run_info.get('state', 'unknown')
                    error = run_info.get('error', 'Unknown error')
                    logger.error(f"  - {city}, {state}: {error}")
        
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
# MAIN WORKER LOOP
# ============================================

def main():
    """Main worker loop - polls queue and processes orders."""
    logger.info(f"🚀 Google Maps Scraper worker starting...")
    logger.info(f"📋 Listening to queue: {GOOGLE_MAPS_SCRAPER_QUEUE}")
    logger.info(f"⚙️ Max concurrent Apify runs per batch: {MAX_CONCURRENT_RUNS}")
    
    # Check Apify health on startup
    is_healthy = asyncio.run(check_apify_health())
    if not is_healthy:
        logger.warning("⚠️ Apify API not accessible - orders may fail")
    
    while True:
        try:
            # Poll queue (blocking pop with timeout)
            order_data = redis_client.brpop(GOOGLE_MAPS_SCRAPER_QUEUE, timeout=5)
            
            if order_data:
                # brpop returns tuple: (queue_name, order_id)
                order_id = order_data[1]
                
                logger.info(f"📥 Received order {order_id} from queue")
                
                # Process order
                success = asyncio.run(process_order(order_id))
                
                if success:
                    logger.info(f"✅ Successfully started Apify runs for order {order_id}")
                else:
                    logger.error(f"❌ Failed to process order {order_id}")
            
            # Small sleep to prevent tight loop
            time.sleep(0.1)
            
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down Google Maps scraper worker...")
            break
        except Exception as e:
            logger.error(f"❌ Error in worker loop: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(1)  # Wait before retrying


if __name__ == "__main__":
    main()
