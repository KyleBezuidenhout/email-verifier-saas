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
MAX_CONCURRENT_RUNS = 100  # Apify Scale plan limit is 128, stay safe at 100


# ============================================
# APIFY API HELPERS
# ============================================

def get_apify_headers() -> Dict[str, str]:
    """Get authorization headers for Apify API."""
    return {
        "Authorization": f"Bearer {settings.APIFY_API_TOKEN}",
        "Content-Type": "application/json"
    }


def build_input_payload(search_term: str, city: str, max_results: int = 200) -> Dict[str, Any]:
    """
    Build the input payload for a single city scrape.
    
    Uses locationQuery format: "City, United States" (per Apify recommendation)
    """
    location_query = f"{city}, United States"
    
    return {
        "searchStringsArray": [search_term],
        "locationQuery": location_query,
        "language": "en",
        "maxCrawledPlacesPerSearch": max_results,
        "maxReviews": 0,
        "maxImages": 0,
        "maxQuestions": 0,
        "skipClosedPlaces": True,
        "website": "withWebsite",
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
    webhooks = [{
        "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
        "requestUrl": webhook_url,
        "payloadTemplate": f'{{"orderId": "{order_id}", "cityIndex": {city_index}, "secret": "{webhook_secret}", "resource": {{{{resource}}}}, "eventType": "{{{{eventType}}}}"}}'
    }]
    
    url = f"{APIFY_BASE_URL}/acts/{APIFY_ACTOR_ID}/runs"
    # Webhooks must be passed as a query parameter (JSON-encoded), not in the body
    params = {
        "memory": memory_mbytes,
        "webhooks": json.dumps(webhooks)
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
        
        # Start Apify runs
        apify_runs = []
        
        async with httpx.AsyncClient() as client:
            # Process in batches of MAX_CONCURRENT_RUNS
            for batch_start in range(0, num_cities, MAX_CONCURRENT_RUNS):
                batch_cities = cities_with_state[batch_start:batch_start + MAX_CONCURRENT_RUNS]
                batch_end = batch_start + len(batch_cities)
                
                logger.info(f"🚀 Starting batch {batch_start + 1}-{batch_end} of {num_cities}")
                
                # Create tasks for this batch
                tasks = []
                for i, (state, city) in enumerate(batch_cities):
                    city_index = batch_start + i
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
                            city_index=city_index,
                            webhook_secret=order.webhook_secret
                        )
                    )
                
                # Execute batch concurrently
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Process results
                for i, result in enumerate(results):
                    city_index = batch_start + i
                    state, city = batch_cities[i]
                    
                    if isinstance(result, Exception):
                        logger.error(f"Failed to start run for city {city}, {state}: {result}")
                        apify_runs.append({
                            "state": state,
                            "city": city,
                            "city_index": city_index,
                            "run_id": None,
                            "status": "failed",
                            "error": str(result),
                            "retry_count": 0
                        })
                    else:
                        run_id = result.get("id")
                        logger.info(f"✅ Started run {run_id} for {city}, {state}")
                        apify_runs.append({
                            "state": state,
                            "city": city,
                            "city_index": city_index,
                            "run_id": run_id,
                            "status": "running",
                            "retry_count": 0
                        })
                
                # Update order with run info after each batch
                order.apify_run_ids = apify_runs
                db.commit()
                
                # Small delay between batches to avoid rate limiting
                if batch_end < num_cities:
                    await asyncio.sleep(1)
        
        # Final update
        successful_runs = sum(1 for r in apify_runs if r.get("run_id"))
        failed_runs = num_cities - successful_runs
        
        logger.info(f"✅ Started {successful_runs}/{num_cities} Apify runs for order {order_id}")
        
        if failed_runs > 0:
            logger.warning(f"⚠️ {failed_runs} runs failed to start")
        
        if successful_runs == 0:
            order.status = "failed"
            order.error_message = "All Apify runs failed to start"
        
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
