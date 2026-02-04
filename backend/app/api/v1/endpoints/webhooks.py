"""
Webhook Endpoints

Handles incoming webhooks from external services like Apify.
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
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

# Rolling queue configuration - must match worker
MAX_CONCURRENT_RUNS = 20

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)


async def start_next_pending_city(order: LocalScraperOrder, db, webhook_url: str):
    """
    Start the next pending city if we're below the concurrent limit.
    Called after each job completes to maintain rolling queue of MAX_CONCURRENT_RUNS.
    
    This is the key function that maintains the rolling queue - as one job finishes,
    the next pending job starts, keeping exactly MAX_CONCURRENT_RUNS jobs running.
    """
    apify_runs = order.apify_run_ids or []
    
    # Count currently running jobs
    running_count = sum(1 for r in apify_runs if r.get("status") == "running")
    
    # Find and start pending cities until we reach MAX_CONCURRENT_RUNS
    started_count = 0
    while running_count < MAX_CONCURRENT_RUNS:
        # Find next pending city
        pending_index = None
        pending_run_info = None
        for i, run_info in enumerate(apify_runs):
            if run_info.get("status") == "pending":
                pending_index = i
                pending_run_info = run_info
                break
        
        if pending_index is None:
            # No more pending cities
            break
        
        city = pending_run_info.get("city")
        state = pending_run_info.get("state")
        
        logger.info(f"🚀 Starting next pending city: {city}, {state} (index {pending_index})")
        
        try:
            # Build input payload
            input_payload = apify_service.build_input_payload(
                search_term=order.search_term,
                city=city
            )
            
            # Start the Apify run
            new_run = await apify_service.start_run_with_webhook(
                input_payload=input_payload,
                webhook_url=webhook_url,
                order_id=str(order.id),
                city_index=pending_index,
                webhook_secret=order.webhook_secret
            )
            
            # Update status to running
            apify_runs[pending_index]["run_id"] = new_run.get("id")
            apify_runs[pending_index]["status"] = "running"
            apify_runs[pending_index].pop("error", None)
            
            logger.info(f"✅ Started run {new_run.get('id')} for {city}, {state}")
            running_count += 1
            started_count += 1
            
        except Exception as e:
            logger.error(f"❌ Failed to start run for {city}, {state}: {e}")
            apify_runs[pending_index]["status"] = "failed"
            apify_runs[pending_index]["error"] = str(e)
            # Don't increment running_count, but continue to try next city
    
    if started_count > 0:
        order.apify_run_ids = apify_runs
        flag_modified(order, "apify_run_ids")  # Force SQLAlchemy to detect JSON changes
        db.commit()
        logger.info(f"📊 Rolling queue status: {running_count} running, started {started_count} new jobs")


async def process_completed_run(order_id: str, city_index: int, run_data: dict, webhook_url: str):
    """
    Process a completed Apify run - fetch results and update order.
    Runs in background to not block webhook response.
    After processing, starts the next pending city to maintain rolling queue.
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
        city = run_info.get("city", "unknown")
        state = run_info.get("state", "unknown")
        dataset_id = run_data.get("defaultDatasetId")
        
        if not dataset_id:
            logger.error(f"No dataset ID in run data for order {order_id}, city {city_index}")
            run_info["status"] = "failed"
            run_info["error"] = "No dataset ID returned"
            apify_runs[city_index] = run_info
            order.apify_run_ids = apify_runs
            flag_modified(order, "apify_run_ids")  # Force SQLAlchemy to detect JSON changes
            db.commit()
            # Still try to start next pending city
            await start_next_pending_city(order, db, webhook_url)
            return
        
        # Fetch results from dataset
        try:
            items = await apify_service.get_dataset_items(dataset_id)
            logger.info(f"✅ Fetched {len(items)} items from {city}, {state} (order {order_id})")
            
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
        flag_modified(order, "apify_run_ids")  # Force SQLAlchemy to detect JSON changes
        
        # Update completed cities count (completed + failed = done)
        completed = sum(1 for r in apify_runs if r.get("status") in ["completed", "failed"])
        order.completed_cities = completed
        order.progress_percentage = int((completed / order.total_cities) * 100)
        
        logger.info(f"📊 Progress: {completed}/{order.total_cities} cities done ({order.progress_percentage}%)")
        
        # Check if all cities are done
        if completed >= order.total_cities:
            await finalize_order(order, db)
        else:
            # Start next pending city to maintain rolling queue
            await start_next_pending_city(order, db, webhook_url)
        
        db.commit()
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing completed run for order {order_id}: {e}")
    finally:
        db.close()


async def retry_failed_run(order_id: str, city_index: int, webhook_url: str):
    """
    Retry a failed city run (up to 3 times).
    After max retries exhausted, starts next pending city to maintain rolling queue.
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
        city = run_info.get("city", "unknown")
        state = run_info.get("state", "unknown")
        retry_count = run_info.get("retry_count", 0)
        
        if retry_count >= 3:
            logger.warning(f"❌ Max retries reached for {city}, {state} (order {order_id})")
            run_info["status"] = "failed"
            run_info["error"] = "Max retries (3) exceeded"
            apify_runs[city_index] = run_info
            order.apify_run_ids = apify_runs
            flag_modified(order, "apify_run_ids")  # Force SQLAlchemy to detect JSON changes
            
            # Check if all cities are done
            completed = sum(1 for r in apify_runs if r.get("status") in ["completed", "failed"])
            order.completed_cities = completed
            order.progress_percentage = int((completed / order.total_cities) * 100)
            
            if completed >= order.total_cities:
                await finalize_order(order, db)
            else:
                # Start next pending city to maintain rolling queue
                await start_next_pending_city(order, db, webhook_url)
            
            db.commit()
            return
        
        # Retry the run
        logger.info(f"🔄 Retrying {city}, {state} (attempt {retry_count + 1}/3)")
        
        input_payload = apify_service.build_input_payload(
            search_term=order.search_term,
            city=city
        )
        
        try:
            new_run = await apify_service.start_run_with_webhook(
                input_payload=input_payload,
                webhook_url=webhook_url,
                order_id=str(order.id),
                city_index=city_index,
                webhook_secret=order.webhook_secret
            )
            
            run_info["run_id"] = new_run.get("id")
            run_info["status"] = "running"
            run_info["retry_count"] = retry_count + 1
            run_info.pop("error", None)
            
            logger.info(f"✅ Retry started: run {new_run.get('id')} for {city}, {state}")
            
        except Exception as e:
            logger.error(f"❌ Failed to retry {city}, {state}: {e}")
            run_info["status"] = "failed"
            run_info["error"] = str(e)
            # Start next pending city since this one failed
            await start_next_pending_city(order, db, webhook_url)
        
        apify_runs[city_index] = run_info
        order.apify_run_ids = apify_runs
        flag_modified(order, "apify_run_ids")  # Force SQLAlchemy to detect JSON changes
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
        
        # Calculate statistics
        failed_cities = sum(1 for r in apify_runs if r.get("status") == "failed")
        completed_cities = sum(1 for r in apify_runs if r.get("status") == "completed")
        total_results_per_city = [(r.get("city", "unknown"), r.get("results_count", 0)) for r in apify_runs if r.get("status") == "completed"]
        
        # Calculate duration
        duration_seconds = None
        if order.started_at:
            duration_seconds = (datetime.utcnow() - order.started_at).total_seconds()
        
        # ============================================
        # FINAL PERFORMANCE REPORT
        # ============================================
        logger.info("=" * 60)
        logger.info("SCRAPE JOB COMPLETED - FINAL PERFORMANCE REPORT")
        logger.info("=" * 60)
        logger.info(f"Order ID: {order.id}")
        logger.info(f"Search Term: {order.search_term}")
        logger.info(f"States: {order.states}")
        logger.info("-" * 60)
        logger.info(f"Total Cities: {order.total_cities}")
        logger.info(f"Successful Cities: {completed_cities}")
        logger.info(f"Failed Cities: {failed_cities}")
        logger.info(f"Unique Results: {len(results_list)}")
        if duration_seconds:
            minutes = int(duration_seconds // 60)
            seconds = int(duration_seconds % 60)
            logger.info(f"Total Duration: {minutes}m {seconds}s")
        logger.info("-" * 60)
        
        # Log failed cities with errors
        if failed_cities > 0:
            logger.info("FAILED CITIES:")
            for run_info in apify_runs:
                if run_info.get("status") == "failed":
                    city = run_info.get("city", "unknown")
                    state = run_info.get("state", "unknown")
                    error = run_info.get("error", "Unknown error")
                    retry_count = run_info.get("retry_count", 0)
                    logger.error(f"  - {city}, {state} (retries: {retry_count}): {error}")
        
        # Log top 10 cities by results count
        if total_results_per_city:
            sorted_cities = sorted(total_results_per_city, key=lambda x: x[1], reverse=True)[:10]
            logger.info("TOP 10 CITIES BY RESULTS:")
            for city, count in sorted_cities:
                logger.info(f"  - {city}: {count} results")
        
        logger.info("=" * 60)
        
        # Set final status
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
        flag_modified(order, "apify_run_ids")  # Force SQLAlchemy to detect JSON changes
        
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
        logger.info(f"📬 Apify webhook raw body keys: {list(body.keys())}")
        
        # Extract data from webhook payload
        order_id = body.get("orderId")
        city_index = body.get("cityIndex")
        secret = body.get("secret")
        event_type = body.get("eventType")
        resource = body.get("resource", {})
        
        logger.info(f"📬 Apify webhook received: order={order_id}, city={city_index}, event={event_type}")
        
        # Handle case where template variables weren't interpolated (legacy orders)
        # If eventType is literally "{{eventType}}", try to infer from resource.status
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
            logger.info(f"📬 Inferred event_type: {event_type}")
        
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
        
        # Construct webhook URL for retries and rolling queue
        webhook_url = str(request.url)
        
        # Handle based on event type
        if event_type == "ACTOR.RUN.SUCCEEDED":
            # Process successful run in background (also starts next pending city)
            background_tasks.add_task(
                process_completed_run,
                order_id,
                city_index,
                resource,
                webhook_url
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
