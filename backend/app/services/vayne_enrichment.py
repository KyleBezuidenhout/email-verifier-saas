"""
Service for creating enrichment jobs from Vayne scraping orders.
This service can be used by both the API endpoints and background workers.
"""

import io
import csv
import logging
import httpx
from typing import Optional
from sqlalchemy.orm import Session
import boto3
from datetime import datetime
from uuid import UUID

from app.core.config import settings
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.models.vayne_order import VayneOrder
from app.services.permutation import generate_email_permutations, normalize_domain, clean_first_name
from app.api.dependencies import ADMIN_EMAIL
from app.services.vayne_client import get_vayne_client
import redis

# Configure logging
logger = logging.getLogger(__name__)

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

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
        
        # Queue job immediately (worker will check if CSV is available)
        try:
            job_id_str = str(job.id)
            queue_name = "simple-email-verification-queue"
            redis_client.lpush(queue_name, job_id_str)
            queue_length = redis_client.llen(queue_name)
            logger.info(f"📤 QUEUED placeholder enrichment job {job.id} to Redis queue '{queue_name}' for order {order.id} (queue length: {queue_length})")
        except Exception as e:
            logger.warning(f"⚠️ Failed to queue placeholder enrichment job {job.id}: {e}")
            import traceback
            traceback.print_exc()
        
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
    Update existing placeholder enrichment job with CSV data from completed scraping order.
    If no placeholder job exists, creates a new one.
    Downloads CSV, parses it, auto-detects columns, and creates leads.
    
    This function is called by the webhook when order completes.
    """
    try:
        logger.info(f"🔄 create_enrichment_job_from_order called for order {order.id} (user {order.user_id})")
        
        # First, try to find existing placeholder job for this order
        # Look for jobs with input_file_path matching "vayne-order:{order.id}"
        logger.info(f"🔍 Searching for placeholder job with input_file_path='vayne-order:{order.id}' for user {order.user_id}")
        placeholder_job = db.query(Job).filter(
            Job.user_id == order.user_id,
            Job.status == "waiting_for_csv",
            Job.input_file_path.like(f"vayne-order:{order.id}")
        ).first()
        
        # Get user (needed for both paths)
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            logger.error(f"❌ User not found for order {order.id}")
            return None
        
        if placeholder_job:
            logger.info(f"✅ Found existing placeholder job {placeholder_job.id} (status: {placeholder_job.status}) for order {order.id} - updating with CSV data")
            job = placeholder_job
        else:
            logger.warning(f"⚠️ No placeholder job found for order {order.id} - creating new job (this should not happen in normal flow)")
            # Create new job
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
        
        # Now download and process CSV
        # Download CSV from R2 (webhook should have already stored it)
        csv_data = None
        
        # Try R2 first (webhook stores CSV here)
        if order.csv_file_path:
            try:
                response = s3_client.get_object(
                    Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                    Key=order.csv_file_path
                )
                csv_data = response['Body'].read()
                logger.info(f"Downloaded CSV from R2 for order {order.id} ({len(csv_data)} bytes)")
            except Exception as e:
                logger.warning(f"Failed to download CSV from R2 for order {order.id}: {e}")
        
        # Fallback: If not in R2, try fetching from Vayne (shouldn't happen if webhook worked)
        if not csv_data and order.vayne_order_id:
            try:
                vayne_client = get_vayne_client()
                file_url = await vayne_client.check_export_ready(order.vayne_order_id, order.export_format or "advanced")
                if file_url:
                    async with httpx.AsyncClient() as client:
                        file_response = await client.get(file_url)
                        file_response.raise_for_status()
                        csv_data = file_response.content
                    logger.info(f"Downloaded CSV from Vayne for order {order.id} (fallback)")
            except Exception as e:
                logger.warning(f"Failed to download CSV from Vayne for order {order.id}: {e}")
        
        if not csv_data:
            logger.error(f"No CSV data available for order {order.id}")
            return None
        
        # Parse CSV
        csv_content = csv_data.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(csv_reader)
        
        if not rows:
            logger.error(f"CSV file is empty for order {order.id}")
            return None
        
        # Auto-detect column mappings (similar to frontend logic)
        actual_columns = list(rows[0].keys())
        
        def normalize_header(h: str) -> str:
            return h.lower().replace(' ', '').replace('_', '').replace('-', '')
        
        normalized_headers = [normalize_header(h) for h in actual_columns]
        
        COLUMN_VARIATIONS = {
            'firstname': ['firstname', 'first', 'fname', 'givenname', 'first_name'],
            'lastname': ['lastname', 'last', 'lname', 'surname', 'familyname', 'last_name'],
            'website': ['website', 'domain', 'companywebsite', 'companydomain', 'url', 'companyurl', 'company_website', 'corporatewebsite', 'corporate_website', 'corporate-website', 'primarydomain', 'organization_primary_domain', 'organizationprimarydomain'],
            'companysize': ['companysize', 'company_size', 'size', 'employees', 'employeecount', 'headcount', 'organizationsize', 'organization_size', 'orgsize', 'org_size', 'teamsize', 'team_size', 'staffcount', 'staff_count', 'numberofemployees', 'num_employees', 'employeesnumber', 'linkedincompanyemployeecount', 'linkedin_company_employee_count', 'linkedin-company-employee-count', 'linkedincompanyemployee', 'linkedin_company_employee', 'linkedin-company-employee'],
        }
        
        def auto_detect_column(target: str) -> Optional[str]:
            variations = COLUMN_VARIATIONS.get(target, [])
            for i, norm_header in enumerate(normalized_headers):
                if norm_header in variations:
                    return actual_columns[i]
            return None
        
        first_name_col = auto_detect_column('firstname') or 'first_name'
        last_name_col = auto_detect_column('lastname') or 'last_name'
        website_col = auto_detect_column('website') or 'website'
        company_size_col = auto_detect_column('companysize')
        
        # Remap rows to standard format
        remapped_rows = []
        for row in rows:
            remapped_row = {
                'first_name': clean_first_name(row.get(first_name_col, '').strip()),
                'last_name': row.get(last_name_col, '').strip(),
                'website': row.get(website_col, '').strip(),
            }
            if company_size_col and row.get(company_size_col):
                remapped_row['company_size'] = row.get(company_size_col, '').strip()
            
            # Capture extra columns
            mapped_cols = {first_name_col, last_name_col, website_col}
            if company_size_col:
                mapped_cols.add(company_size_col)
            
            extra_data = {}
            for col, val in row.items():
                if col not in mapped_cols and val and str(val).strip():
                    extra_data[col] = str(val).strip()
            remapped_row['extra_data'] = extra_data
            
            remapped_rows.append(remapped_row)
        
        # Filter out rows with missing required data
        remapped_rows = [row for row in remapped_rows if row['first_name'] and row['last_name'] and row['website']]
        
        if not remapped_rows:
            logger.error(f"No valid rows found in CSV for order {order.id}")
            if job and job.status == "waiting_for_csv":
                job.status = "failed"
                db.commit()
            return None
        
        # Get user
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            logger.error(f"User not found for order {order.id}")
            if job and job.status == "waiting_for_csv":
                job.status = "failed"
                db.commit()
            return None
        
        # Check credits (skip for admin)
        leads_count = len(remapped_rows)
        is_admin = user.email == ADMIN_EMAIL or getattr(user, 'is_admin', False)
        
        if not is_admin and user.credits < leads_count:
            logger.warning(f"Insufficient credits for user {user.id} to process enrichment job from order {order.id}")
            if job and job.status == "waiting_for_csv":
                job.status = "failed"
                db.commit()
            return None
        
        # Update job with CSV data (or create if new)
        logger.info(f"📝 Updating job {job.id} with CSV data: {len(remapped_rows)} valid rows")
        old_status = job.status
        job.original_filename = f"sales-nav-{order.id}.csv"
        job.total_leads = len(remapped_rows)
        job.status = "pending"  # Change from "waiting_for_csv" to "pending" so worker can process
        logger.info(f"🔄 Changing job {job.id} status from '{old_status}' to 'pending'")
        
        # Store input file in R2
        input_file_path = f"jobs/{job.id}/input/sales-nav-{order.id}.csv"
        try:
            logger.info(f"💾 Storing input CSV file to R2: {input_file_path}")
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=input_file_path,
                Body=csv_data,
                ContentType="text/csv"
            )
            job.input_file_path = input_file_path
            logger.info(f"✅ Stored input file to R2: {input_file_path}")
        except Exception as e:
            logger.error(f"❌ Failed to store input file for job {job.id}: {e}")
            import traceback
            traceback.print_exc()
            db.delete(job)
            db.commit()
            return None
        
        # Create leads and generate permutations
        logger.info(f"🔄 Creating leads and generating email permutations for {len(remapped_rows)} rows")
        leads_to_create = []
        for row in remapped_rows:
            first_name = row['first_name']
            last_name = row['last_name']
            website = row['website']
            domain = normalize_domain(website)
            company_size = row.get('company_size')
            
            # Generate email permutations
            permutations = generate_email_permutations(
                first_name, last_name, domain, company_size
            )
            
            # Create lead for each permutation
            for perm in permutations:
                lead = Lead(
                    job_id=job.id,
                    user_id=user.id,
                    first_name=first_name,
                    last_name=last_name,
                    domain=domain,
                    company_size=company_size,
                    email=perm['email'],
                    pattern_used=perm['pattern'],
                    prevalence_score=perm['prevalence_score'],
                    verification_status='pending',
                    is_final_result=False,
                    extra_data=row.get('extra_data', {}),
                )
                leads_to_create.append(lead)
        
        logger.info(f"📊 Generated {len(leads_to_create)} leads (permutations) from {len(remapped_rows)} rows")
        
        # Bulk insert leads
        logger.info(f"💾 Bulk inserting {len(leads_to_create)} leads into database")
        db.bulk_save_objects(leads_to_create)
        
        # Deduct credits (skip for admin)
        if not is_admin:
            logger.info(f"💰 Deducting {leads_count} credits from user {user.id} (had {user.credits}, will have {user.credits - leads_count})")
            user.credits -= leads_count
        
        # Commit all changes (job status, leads, credits)
        db.commit()
        db.refresh(job)
        
        # Verify the status was actually updated
        if job.status != "pending":
            logger.error(f"❌ CRITICAL: Job {job.id} status is '{job.status}' but expected 'pending' after update!")
            # Try to fix it
            job.status = "pending"
            db.commit()
            db.refresh(job)
            logger.warning(f"⚠️ Manually set job {job.id} status to 'pending'")
        
        logger.info(f"✅ Committed job {job.id} update: status='{job.status}', total_leads={job.total_leads}, input_file_path='{job.input_file_path}'")
        
        # Verify job is ready for processing
        if job.status == "pending" and job.total_leads > 0 and job.input_file_path:
            logger.info(f"✅ Job {job.id} is ready for processing: status={job.status}, total_leads={job.total_leads}, has_input_file=True")
        else:
            logger.warning(f"⚠️ Job {job.id} may not be ready: status={job.status}, total_leads={job.total_leads}, input_file_path={bool(job.input_file_path)}")
        
        # Queue job for processing
        try:
            job_id_str = str(job.id)
            queue_name = "simple-email-verification-queue"
            redis_client.lpush(queue_name, job_id_str)
            queue_length = redis_client.llen(queue_name)
            logger.info(f"📤 QUEUED enrichment job {job.id} to Redis queue '{queue_name}' (status: {job.status}, total_leads: {job.total_leads}, queue length: {queue_length})")
        except Exception as e:
            logger.error(f"❌ Failed to queue enrichment job {job.id}: {e}")
            import traceback
            traceback.print_exc()
        
        return job
        
    except Exception as e:
        logger.error(f"Failed to create enrichment job from order {order.id}: {e}")
        import traceback
        traceback.print_exc()
        return None


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
