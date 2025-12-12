"""
Service for creating enrichment jobs from Vayne scraping orders.
This service can be used by both the API endpoints and background workers.
"""

import logging
from typing import Optional
from sqlalchemy.orm import Session
import boto3
from datetime import datetime
from uuid import UUID

from app.core.config import settings
from app.models.user import User
from app.models.job import Job
from app.models.vayne_order import VayneOrder
import redis

# Configure logging
logger = logging.getLogger(__name__)

# S3 client not needed here anymore - enrichment worker handles CSV processing

# Initialize Redis connection
redis_client = redis.from_url(settings.REDIS_URL)


async def create_placeholder_enrichment_job(order: VayneOrder, db: Session) -> Optional[Job]:
    """
    Create a placeholder enrichment job immediately when order is created.
    Job will be updated with CSV data when webhook arrives.
    This allows job queuing to start immediately.
    """
    try:
        logger.info(f"🔄 Creating placeholder enrichment job for order {order.id} (user {order.user_id})")
        
        # Get user
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            logger.error(f"❌ User not found for order {order.id}")
            return None
        
        # Create placeholder enrichment job (no leads yet - will be added by webhook)
        job = Job(
            user_id=user.id,
            status="waiting_for_csv",  # Special status - waiting for webhook to provide CSV
            job_type="enrichment",
            original_filename=f"sales-nav-{order.id}.csv",
            total_leads=0,  # Will be updated when CSV is processed
            processed_leads=0,
            valid_emails_found=0,
            catchall_emails_found=0,
            cost_in_credits=0,
            source="Scraped",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        logger.info(f"✅ Created placeholder job {job.id} with status 'waiting_for_csv'")
        
        # Store reference to vayne_order in job's extra_data (via input_file_path as metadata)
        # We'll use input_file_path to store the vayne_order_id temporarily
        # Format: "vayne-order:{order.id}" - webhook will replace this with actual CSV path
        job.input_file_path = f"vayne-order:{order.id}"
        db.commit()
        db.refresh(job)
        logger.info(f"✅ Set input_file_path to 'vayne-order:{order.id}' for job {job.id}")
        
        # Don't queue placeholder job - webhook will queue it after CSV is stored
        logger.info(f"⏳ Placeholder job {job.id} will be queued by webhook after CSV is stored")
        
        logger.info(f"✅ Placeholder enrichment job {job.id} fully created and ready for webhook (order {order.id})")
        return job
        
    except Exception as e:
        logger.error(f"❌ Failed to create placeholder enrichment job for order {order.id}: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return None


async def create_enrichment_job_from_order(order: VayneOrder, db: Session) -> Optional[Job]:
    """
    DEPRECATED: This function is no longer used by the webhook.
    The webhook now directly updates the job and queues it for enrichment.
    
    Kept for backwards compatibility in case it's called from other places.
    """
    logger.warning(f"⚠️ create_enrichment_job_from_order is deprecated - webhook handles job creation directly")
    
    # Find or create job
    placeholder_job = db.query(Job).filter(
        Job.user_id == order.user_id,
        Job.status == "waiting_for_csv",
        Job.input_file_path.like(f"vayne-order:{order.id}")
    ).first()
    
    if placeholder_job:
        job = placeholder_job
    else:
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            logger.error(f"❌ User not found for order {order.id}")
            return None
        
        job = Job(
            user_id=user.id,
            status="pending",
            job_type="enrichment",
            original_filename=f"sales-nav-{order.id}.csv",
            total_leads=0,
            processed_leads=0,
            valid_emails_found=0,
            catchall_emails_found=0,
            cost_in_credits=0,
            source="Scraped",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
    
    # Update job with CSV path if available
    if order.csv_file_path:
        job.input_file_path = order.csv_file_path
        job.status = "pending"
        db.commit()
        db.refresh(job)
        
        # Queue for enrichment
        try:
            job_id_str = str(job.id)
            queue_name = "enrichment-job-creation"
            redis_client.lpush(queue_name, job_id_str)
            logger.info(f"📤 QUEUED job {job.id} to enrichment queue '{queue_name}'")
        except Exception as e:
            logger.error(f"❌ Failed to queue job {job.id}: {e}")
    
    return job


async def mark_enrichment_job_scrape_failed(vayne_order_id: str, db: Session, error_reason: str = "Webhook failed after max retries"):
    """
    Mark placeholder enrichment job as failed when webhook fails after max retries.
    Finds the job by vayne_order_id reference stored in input_file_path.
    vayne_order_id is the order.id UUID string.
    """
    try:
        # Find order by ID (vayne_order_id is actually the order.id UUID string)
        try:
            order_uuid = UUID(vayne_order_id)
        except ValueError:
            logger.warning(f"Invalid order ID format: {vayne_order_id}")
            return None
        
        order = db.query(VayneOrder).filter(VayneOrder.id == order_uuid).first()
        if not order:
            logger.warning(f"Order {vayne_order_id} not found when marking enrichment job as failed")
            return None
        
        # Find placeholder job
        placeholder_job = db.query(Job).filter(
            Job.user_id == order.user_id,
            Job.status == "waiting_for_csv",
            Job.input_file_path.like(f"vayne-order:{order.id}")
        ).first()
        
        if placeholder_job:
            placeholder_job.status = "failed"
            placeholder_job.completed_at = datetime.utcnow()
            db.commit()
            logger.info(f"✅ Marked enrichment job {placeholder_job.id} as failed (scrape failed: {error_reason})")
            return placeholder_job
        else:
            logger.warning(f"No placeholder enrichment job found for order {order.id} to mark as failed")
            return None
    except Exception as e:
        logger.error(f"Failed to mark enrichment job as failed for order {vayne_order_id}: {e}")
        import traceback
        traceback.print_exc()
        return None
