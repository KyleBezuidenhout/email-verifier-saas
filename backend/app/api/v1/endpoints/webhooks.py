"""
Webhook Endpoints

Handles incoming webhooks from external services like Apify.
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime
import logging
import json
import csv
import io
import boto3

from app.db.session import SessionLocal
from app.models.local_scraper_order import LocalScraperOrder
from app.services.apify_service import apify_service
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)


async def process_completed_run(order_id: str, city_index: int, run_data: dict):
    """
    Process a completed Apify run - fetch results and update order.
    Runs in background to not block webhook response.
    """
    db = SessionLocal()
    try:
        order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_id).first()
        if not order:
            logger.error(f"Order {order_id} not found for webhook processing")
            return
        
        # Get the run info from order
        apify_runs = order.apify_run_ids or []
        if city_index >= len(apify_runs):
            logger.error(f"City index {city_index} out of range for order {order_id}")
            return
        
        run_info = apify_runs[city_index]
        dataset_id = run_data.get("defaultDatasetId")
        
        if not dataset_id:
            logger.error(f"No dataset ID in run data for order {order_id}, city {city_index}")
            run_info["status"] = "failed"
            run_info["error"] = "No dataset ID returned"
            apify_runs[city_index] = run_info
            order.apify_run_ids = apify_runs
            db.commit()
            return
        
        # Fetch results from dataset
        try:
            items = await apify_service.get_dataset_items(dataset_id)
            logger.info(f"Fetched {len(items)} items from dataset {dataset_id} for order {order_id}")
            
            # Extract and store results
            run_info["status"] = "completed"
            run_info["dataset_id"] = dataset_id
            run_info["results_count"] = len(items)
            run_info["results"] = [apify_service.extract_output_fields(item) for item in items]
            
        except Exception as e:
            logger.error(f"Failed to fetch dataset {dataset_id}: {e}")
            run_info["status"] = "failed"
            run_info["error"] = str(e)
        
        apify_runs[city_index] = run_info
        order.apify_run_ids = apify_runs
        
        # Update completed cities count
        completed = sum(1 for r in apify_runs if r.get("status") in ["completed", "failed"])
        order.completed_cities = completed
        order.progress_percentage = int((completed / order.total_cities) * 100)
        
        # Check if all cities are done
        if completed >= order.total_cities:
            await finalize_order(order, db)
        
        db.commit()
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing completed run for order {order_id}: {e}")
    finally:
        db.close()


async def retry_failed_run(order_id: str, city_index: int, webhook_url: str):
    """
    Retry a failed city run (up to 3 times).
    """
    db = SessionLocal()
    try:
        order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_id).first()
        if not order:
            return
        
        apify_runs = order.apify_run_ids or []
        if city_index >= len(apify_runs):
            return
        
        run_info = apify_runs[city_index]
        retry_count = run_info.get("retry_count", 0)
        
        if retry_count >= 3:
            logger.warning(f"Max retries reached for order {order_id}, city {city_index}")
            run_info["status"] = "failed"
            run_info["error"] = "Max retries (3) exceeded"
            apify_runs[city_index] = run_info
            order.apify_run_ids = apify_runs
            
            # Check if all cities are done
            completed = sum(1 for r in apify_runs if r.get("status") in ["completed", "failed"])
            order.completed_cities = completed
            if completed >= order.total_cities:
                await finalize_order(order, db)
            
            db.commit()
            return
        
        # Retry the run
        logger.info(f"Retrying run for order {order_id}, city {city_index} (attempt {retry_count + 1})")
        
        city = run_info.get("city")
        input_payload = apify_service.build_input_payload(
            search_term=order.search_term,
            city=city
        )
        
        try:
            new_run = await apify_service.start_run_with_webhook(
                input_payload=input_payload,
                webhook_url=webhook_url,
                order_id=str(order.id),
                city_index=city_index
            )
            
            run_info["run_id"] = new_run.get("id")
            run_info["status"] = "running"
            run_info["retry_count"] = retry_count + 1
            run_info.pop("error", None)
            
        except Exception as e:
            logger.error(f"Failed to retry run: {e}")
            run_info["status"] = "failed"
            run_info["error"] = str(e)
        
        apify_runs[city_index] = run_info
        order.apify_run_ids = apify_runs
        db.commit()
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error retrying run for order {order_id}: {e}")
    finally:
        db.close()


async def finalize_order(order: LocalScraperOrder, db: Session):
    """
    Finalize an order after all cities have been processed.
    Deduplicates results by placeId and uploads to R2.
    """
    try:
        apify_runs = order.apify_run_ids or []
        
        # Collect all results and deduplicate by placeId
        all_results = {}
        for run_info in apify_runs:
            results = run_info.get("results", [])
            for place in results:
                place_id = place.get("placeId")
                if place_id and place_id not in all_results:
                    all_results[place_id] = place
        
        results_list = list(all_results.values())
        order.results_count = len(results_list)
        
        logger.info(f"Order {order.id} finalized: {len(results_list)} unique results from {order.total_cities} cities")
        
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
        
        # Check if any cities failed
        failed_cities = sum(1 for r in apify_runs if r.get("status") == "failed")
        if failed_cities > 0:
            order.status = "completed"  # Still completed, but note failures
            order.error_message = f"{failed_cities} of {order.total_cities} cities failed"
        else:
            order.status = "completed"
        
        order.completed_at = datetime.utcnow()
        order.progress_percentage = 100
        
        # Clear the large results data from apify_run_ids (keep metadata only)
        for run_info in apify_runs:
            run_info.pop("results", None)
        order.apify_run_ids = apify_runs
        
    except Exception as e:
        logger.error(f"Error finalizing order {order.id}: {e}")
        order.status = "failed"
        order.error_message = str(e)


@router.post("/apify")
async def apify_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Handle Apify webhook callbacks.
    
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
        
        if not order_id or city_index is None:
            logger.warning("Webhook missing orderId or cityIndex")
            return {"status": "ignored", "reason": "missing required fields"}
        
        # Verify webhook secret
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
        
        # Construct webhook URL for retries
        webhook_url = str(request.url)
        
        # Handle based on event type
        if event_type == "ACTOR.RUN.SUCCEEDED":
            # Process successful run in background
            background_tasks.add_task(
                process_completed_run,
                order_id,
                city_index,
                resource
            )
            return {"status": "processing", "event": event_type}
            
        elif event_type in ["ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"]:
            # Attempt retry in background
            background_tasks.add_task(
                retry_failed_run,
                order_id,
                city_index,
                webhook_url
            )
            return {"status": "retrying", "event": event_type}
        
        return {"status": "acknowledged", "event": event_type}
        
    except json.JSONDecodeError:
        logger.error("Invalid JSON in webhook body")
        raise HTTPException(status_code=400, detail="Invalid JSON")
    except Exception as e:
        logger.error(f"Error processing Apify webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))
