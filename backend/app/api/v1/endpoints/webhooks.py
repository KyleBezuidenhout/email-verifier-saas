"""
Webhook Endpoints

Handles incoming webhooks from external services like Apify.
Pushes webhook payloads to Redis queue for worker processing.
"""

from fastapi import APIRouter, HTTPException, Request
import logging
import json
import redis

from app.db.session import SessionLocal
from app.models.local_scraper_order import LocalScraperOrder
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Redis queue for webhook processing (handled by worker)
WEBHOOK_QUEUE = "google-maps-webhook-queue"

# Initialize Redis client
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


@router.post("/apify")
async def apify_webhook(request: Request):
    """
    Handle Apify webhook callbacks.
    
    Validates the webhook payload and pushes to Redis queue for worker processing.
    This keeps the backend lightweight - all heavy processing happens in the worker.
    
    Called when an Apify run completes (SUCCEEDED, FAILED, ABORTED, TIMED_OUT).
    """
    try:
        body = await request.json()
        
        # Extract data from webhook payload
        order_id = body.get("orderId")
        city_index = body.get("cityIndex")
        secret = body.get("secret")
        event_type = body.get("eventType")
        resource = body.get("resource", {})
        
        logger.info(f"📬 Apify webhook received: order={order_id}, city={city_index}, event={event_type}")
        
        # Handle case where template variables weren't interpolated (legacy orders)
        if event_type and event_type.startswith("{{"):
            resource_status = resource.get("status", "").upper() if isinstance(resource, dict) else ""
            logger.warning(f"⚠️ eventType not interpolated ('{event_type}'), inferring from resource.status: {resource_status}")
            if resource_status == "SUCCEEDED":
                event_type = "ACTOR.RUN.SUCCEEDED"
            elif resource_status == "FAILED":
                event_type = "ACTOR.RUN.FAILED"
            elif resource_status == "ABORTED":
                event_type = "ACTOR.RUN.ABORTED"
            elif resource_status in ["TIMED-OUT", "TIMED_OUT"]:
                event_type = "ACTOR.RUN.TIMED_OUT"
            body["eventType"] = event_type
            logger.info(f"📬 Inferred event_type: {event_type}")
        
        if not order_id or city_index is None:
            logger.warning("Webhook missing orderId or cityIndex")
            return {"status": "ignored", "reason": "missing required fields"}
        
        # Quick validation - verify webhook secret and order status
        db = SessionLocal()
        try:
            order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_id).first()
            if not order:
                logger.warning(f"Order {order_id} not found")
                return {"status": "ignored", "reason": "order not found"}
            
            if order.webhook_secret and order.webhook_secret != secret:
                logger.warning(f"Invalid webhook secret for order {order_id}")
                return {"status": "ignored", "reason": "invalid secret"}
            
            # Check if order is still active
            if order.status in ["completed", "cancelled", "failed"]:
                logger.info(f"Order {order_id} already {order.status}, ignoring webhook")
                return {"status": "ignored", "reason": f"order already {order.status}"}
            
        finally:
            db.close()
        
        # Add webhook URL to payload for worker to use
        body["webhookUrl"] = str(request.url)
        
        # Push to Redis queue for worker processing
        redis_client.lpush(WEBHOOK_QUEUE, json.dumps(body))
        logger.info(f"📤 Queued webhook for worker: order={order_id}, city={city_index}, event={event_type}")
        
        return {"status": "queued", "event": event_type}
        
    except json.JSONDecodeError:
        logger.error("Invalid JSON in webhook body")
        raise HTTPException(status_code=400, detail="Invalid JSON")
    except redis.RedisError as e:
        logger.error(f"Redis error queueing webhook: {e}")
        # Return 500 so Apify will retry
        raise HTTPException(status_code=500, detail="Failed to queue webhook")
    except Exception as e:
        logger.error(f"Error processing Apify webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))
