"""
Google Maps Scraper API Endpoints

Provides endpoints for Google Maps scraping using the AWS-hosted scraper API.
This is completely separate from the Sales Nav, Enrichment, and Verification features.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import logging
import json
import boto3
import io
import csv

from app.db.session import get_db
from app.models.user import User
from app.models.local_scraper_order import LocalScraperOrder
from app.api.dependencies import get_current_user
from app.schemas.local_scraper import (
    CreateLocalScraperOrderRequest,
    LocalScraperOrderResponse,
    LocalScraperOrderListResponse,
)
from app.services.botasaurus_service import botasaurus_service
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


def order_to_response(order: LocalScraperOrder) -> dict:
    """Convert a LocalScraperOrder to a response dict"""
    return {
        "id": str(order.id),
        "user_id": str(order.user_id),
        "botasaurus_task_id": order.botasaurus_task_id,
        "status": order.status,
        "job_name": order.job_name,
        "business_types": order.business_types,
        "search_method": order.search_method,
        "extraction_method": order.extraction_method,
        "max_results": order.max_results,
        "enable_reviews": order.enable_reviews or False,
        "progress_percentage": order.progress_percentage or 0,
        "results_count": order.results_count or 0,
        "file_url": order.file_url,
        "created_at": order.created_at,
        "started_at": order.started_at,
        "completed_at": order.completed_at,
        "error_message": order.error_message,
    }


@router.get("/health")
async def check_scraper_health():
    """Check if Google Maps Scraper API on AWS is reachable"""
    is_healthy = await botasaurus_service.check_health()
    return {
        "botasaurus_api": "connected" if is_healthy else "disconnected",
        "api_url": botasaurus_service.base_url,
        "message": "Google Maps Scraper API is running" if is_healthy else "Could not connect to Google Maps Scraper API. Please check the AWS instance."
    }


async def run_direct_scrape_task(order_id: str, scraper_config: dict):
    """
    Background task to run direct scraping (for AWS-hosted API that doesn't support async tasks).
    """
    from app.db.session import SessionLocal
    
    db = SessionLocal()
    try:
        order = db.query(LocalScraperOrder).filter(LocalScraperOrder.id == order_id).first()
        if not order:
            logger.error(f"Order {order_id} not found for direct scraping")
            return
        
        logger.info(f"🔄 Starting direct scrape for order {order_id}")
        
        try:
            # Check if order was cancelled before starting scrape
            db.refresh(order)
            if order.status == "cancelled" or order.status == "deleted":
                logger.info(f"Order {order_id} was cancelled/deleted, skipping scrape")
                return
            
            # Run the direct scrape
            results = await botasaurus_service.direct_scrape(scraper_config)
            
            # Check again if order was cancelled during scraping
            db.refresh(order)
            if order.status == "cancelled" or order.status == "deleted":
                logger.info(f"Order {order_id} was cancelled/deleted during scrape, not storing results")
                return
            
            # Update order with results
            order.status = "completed"
            order.completed_at = datetime.utcnow()
            order.results_count = len(results) if isinstance(results, list) else 1
            order.progress_percentage = 100
            
            # Store results in R2
            csv_buffer = io.StringIO()
            if results and isinstance(results, list) and len(results) > 0:
                # Get fieldnames from first result
                fieldnames = list(results[0].keys()) if results else []
                writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(results)
            
            csv_bytes = csv_buffer.getvalue().encode('utf-8')
            csv_file_path = f"local-scraper-orders/{order_id}/results.csv"
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=csv_file_path,
                Body=csv_bytes,
                ContentType="text/csv"
            )
            
            order.file_url = f"{settings.CLOUDFLARE_R2_PUBLIC_URL}/{csv_file_path}"
            db.commit()
            
            logger.info(f"✅ Direct scraping completed for order {order_id}: {order.results_count} results")
            
        except Exception as scrape_error:
            logger.error(f"❌ Direct scraping failed for order {order_id}: {str(scrape_error)}")
            order.status = "failed"
            order.error_message = str(scrape_error)
            order.completed_at = datetime.utcnow()
            db.commit()
            
    except Exception as e:
        logger.error(f"Error in direct scraping task for order {order_id}: {str(e)}")
    finally:
        db.close()


@router.post("/orders", response_model=LocalScraperOrderResponse)
async def create_order(
    payload: CreateLocalScraperOrderRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new local scraper order.
    
    This creates an order in the database and sends it to the scraper API for processing.
    """
    try:
        config = payload.config
        
        # Validate required fields
        if not config.business_types:
            raise HTTPException(status_code=400, detail="At least one business type is required")
        
        if config.search_method == "city" and not config.cities:
            raise HTTPException(status_code=400, detail="At least one city is required when using city search method")
        
        if config.search_method == "search_link" and not config.search_links:
            raise HTTPException(status_code=400, detail="At least one search link is required when using search link method")
        
        logger.info(f"📝 Creating local scraper order for user {current_user.id}")
        logger.info(f"   Job name: {payload.job_name}")
        logger.info(f"   Business types: {config.business_types}")
        logger.info(f"   Search method: {config.search_method}")
        
        # Build scraper configuration
        scraper_config = botasaurus_service.build_google_maps_config(
            business_types=config.business_types,
            search_method=config.search_method,
            cities=config.cities,
            search_links=config.search_links,
            extraction_method=config.extraction_method,
            max_results=config.max_results,
            enable_reviews=config.enable_reviews_extraction,
            max_reviews=config.max_reviews,
            enable_photos=config.enable_photos_extraction,
            max_photos=config.max_photos,
            lang=config.lang,
            randomize_cities=config.randomize_cities,
            include_places_outside_city=config.include_places_outside_city,
            geo_shape=config.geo_shape,
            point_coordinates=config.point_coordinates,
            polygons=config.polygons,
            geo_zoom_level=config.geo_zoom_level,
            exclude_outside_shape=config.exclude_outside_shape,
            reviews_sort=config.reviews_sort,
            reviews_query=config.reviews_query,
            api_key=config.api_key,
        )
        
        # Determine search locations for storage
        search_locations = config.cities if config.search_method == "city" else config.search_links
        
        # Create order in database
        order = LocalScraperOrder(
            user_id=current_user.id,
            status="pending",
            job_name=payload.job_name,
            scraper_config=scraper_config,
            business_types=", ".join(config.business_types),
            search_method=config.search_method,
            search_locations=search_locations,
            extraction_method=config.extraction_method,
            max_results=config.max_results,
            enable_reviews=config.enable_reviews_extraction,
            max_reviews=config.max_reviews,
        )
        
        db.add(order)
        db.commit()
        db.refresh(order)
        
        logger.info(f"✅ Order created in database: {order.id}")
        
        # AWS-hosted Botasaurus API only supports direct scraping (no async task endpoints)
        # Schedule background task for direct scraping
        order.status = "processing"
        order.started_at = datetime.utcnow()
        order.botasaurus_task_id = None  # Not used for direct scraping
        db.commit()
        db.refresh(order)
        
        # Schedule background task for direct scraping
        background_tasks.add_task(
            run_direct_scrape_task,
            order_id=str(order.id),
            scraper_config=scraper_config
        )
        
        logger.info(f"✅ Scheduled direct scrape task for order {order.id}")
        
        return order_to_response(order)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating local scraper order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders", response_model=LocalScraperOrderListResponse)
async def list_orders(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all local scraper orders for the current user"""
    try:
        query = db.query(LocalScraperOrder).filter(LocalScraperOrder.user_id == current_user.id)
        
        if status_filter:
            query = query.filter(LocalScraperOrder.status == status_filter)
        
        # Get total count
        total = query.count()
        
        # Get paginated results, newest first
        orders = query.order_by(LocalScraperOrder.created_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "orders": [order_to_response(order) for order in orders],
            "total": total,
        }
    except Exception as e:
        logger.error(f"Error listing local scraper orders: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/{order_id}", response_model=LocalScraperOrderResponse)
async def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific local scraper order"""
    try:
        order = db.query(LocalScraperOrder).filter(
            LocalScraperOrder.id == order_id,
            LocalScraperOrder.user_id == current_user.id
        ).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        return order_to_response(order)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting local scraper order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/{order_id}/poll-status")
async def poll_order_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Poll order status from database.
    
    For AWS-hosted Botasaurus API, we use direct scraping in background tasks,
    so we just return the current database status.
    """
    try:
        order = db.query(LocalScraperOrder).filter(
            LocalScraperOrder.id == order_id,
            LocalScraperOrder.user_id == current_user.id
        ).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Return current database status
        # Background task will update this when scraping completes
        return {
            "order_id": str(order.id),
            "botasaurus_task_id": order.botasaurus_task_id,
            "status": order.status,
            "progress_percentage": order.progress_percentage or (100 if order.status == "completed" else (50 if order.status == "processing" else 0)),
            "results_count": order.results_count or 0,
            "from_database": True,
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error polling order status: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/orders/{order_id}")
async def delete_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete (soft delete) a local scraper order"""
    try:
        order = db.query(LocalScraperOrder).filter(
            LocalScraperOrder.id == order_id,
            LocalScraperOrder.user_id == current_user.id
        ).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        old_status = order.status
        order.status = "deleted"
        db.commit()
        
        # Note: AWS-hosted Botasaurus API uses direct scraping in background tasks
        # We can't abort running scrapes, but we've marked the order as deleted
        # The background task will check the status before storing results
        
        logger.info(f"Order {order_id} marked as deleted (was: {old_status})")
        
        return {"message": "Order deleted successfully", "order_id": str(order_id)}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a running or pending order"""
    try:
        order = db.query(LocalScraperOrder).filter(
            LocalScraperOrder.id == order_id,
            LocalScraperOrder.user_id == current_user.id
        ).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        if order.status in ("completed", "deleted", "cancelled"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel order with status '{order.status}'"
            )
        
        old_status = order.status
        order.status = "cancelled"
        order.completed_at = datetime.utcnow()
        db.commit()
        
        # Note: AWS-hosted Botasaurus API uses direct scraping in background tasks
        # We can't abort running scrapes, but we've marked the order as cancelled
        # The background task will check the status before storing results
        
        logger.info(f"Order {order_id} cancelled (was: {old_status})")
        
        return {
            "message": "Order cancelled successfully",
            "order_id": str(order_id),
            "previous_status": old_status,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling order: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/{order_id}/download")
async def download_order_results(
    order_id: str,
    format: str = Query("csv", regex="^(csv|json|excel)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download results for a completed order"""
    try:
        order = db.query(LocalScraperOrder).filter(
            LocalScraperOrder.id == order_id,
            LocalScraperOrder.user_id == current_user.id
        ).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        if order.status != "completed":
            raise HTTPException(status_code=400, detail="Order is not yet completed")
        
        # If we have a file_url in R2, fetch from there
        if order.file_url:
            try:
                # Extract the key from the URL
                csv_file_path = f"local-scraper-orders/{order.id}/results.csv"
                
                response = s3_client.get_object(
                    Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                    Key=csv_file_path
                )
                csv_content = response['Body'].read()
                
                # Generate filename
                safe_job_name = "".join(c for c in order.job_name if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
                if not safe_job_name:
                    safe_job_name = "results"
                filename = f"{safe_job_name}_{str(order.id)[:8]}.csv"
                
                return StreamingResponse(
                    iter([csv_content]),
                    media_type="text/csv",
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Length": str(len(csv_content)),
                    }
                )
            except Exception as r2_error:
                logger.error(f"Failed to fetch from R2: {str(r2_error)}")
                # Fall through to try scraper API directly
        
        # Fallback: Download directly from scraper API
        if order.botasaurus_task_id:
            try:
                file_bytes, original_filename = await botasaurus_service.download_task_results(
                    order.botasaurus_task_id,
                    format=format
                )
                
                # Generate filename
                safe_job_name = "".join(c for c in order.job_name if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
                if not safe_job_name:
                    safe_job_name = "results"
                filename = f"{safe_job_name}_{str(order.id)[:8]}.{format}"
                
                content_type = {
                    "csv": "text/csv",
                    "json": "application/json",
                    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                }.get(format, "application/octet-stream")
                
                return StreamingResponse(
                    iter([file_bytes]),
                    media_type=content_type,
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Length": str(len(file_bytes)),
                    }
                )
            except Exception as scraper_error:
                logger.error(f"Failed to download from scraper API: {str(scraper_error)}")
                raise HTTPException(
                    status_code=404,
                    detail="Results file not available. Please try again later."
                )
        
        raise HTTPException(status_code=404, detail="No results available for this order")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading order results: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

