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

from app.core.config import settings
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.models.vayne_order import VayneOrder
from app.services.permutation import generate_email_permutations, normalize_domain
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
        # Get user
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            logger.error(f"User not found for order {order.id}")
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
        
        # Store reference to vayne_order in job's extra_data (via input_file_path as metadata)
        # We'll use input_file_path to store the vayne_order_id temporarily
        # Format: "vayne-order:{order.id}" - webhook will replace this with actual CSV path
        job.input_file_path = f"vayne-order:{order.id}"
        db.commit()
        db.refresh(job)
        
        # Queue job immediately (worker will check if CSV is available)
        try:
            job_id_str = str(job.id)
            queue_name = "simple-email-verification-queue"
            redis_client.lpush(queue_name, job_id_str)
            logger.info(f"✅ Created and queued placeholder enrichment job {job.id} for order {order.id}")
        except Exception as e:
            logger.warning(f"Failed to queue placeholder enrichment job {job.id}: {e}")
        
        return job
        
    except Exception as e:
        logger.error(f"Failed to create placeholder enrichment job for order {order.id}: {e}")
        import traceback
        traceback.print_exc()
        return None


async def create_enrichment_job_from_order(order: VayneOrder, db: Session) -> Optional[Job]:
    """
    Update existing placeholder enrichment job with CSV data from completed scraping order.
    If no placeholder job exists, creates a new one.
    Downloads CSV, parses it, auto-detects columns, and creates leads.
    
    This function is called by the webhook when order completes.
    """
    try:
        # First, try to find existing placeholder job for this order
        # Look for jobs with input_file_path matching "vayne-order:{order.id}"
        placeholder_job = db.query(Job).filter(
            Job.user_id == order.user_id,
            Job.status == "waiting_for_csv",
            Job.input_file_path.like(f"vayne-order:{order.id}")
        ).first()
        
        # Get user (needed for both paths)
        user = db.query(User).filter(User.id == order.user_id).first()
        if not user:
            logger.error(f"User not found for order {order.id}")
            return None
        
        if placeholder_job:
            logger.info(f"Found existing placeholder job {placeholder_job.id} for order {order.id} - updating with CSV data")
            job = placeholder_job
        else:
            logger.info(f"No placeholder job found for order {order.id} - creating new job")
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
                'first_name': row.get(first_name_col, '').strip(),
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
        job.original_filename = f"sales-nav-{order.id}.csv"
        job.total_leads = len(remapped_rows)
        job.status = "pending"  # Change from "waiting_for_csv" to "pending" so worker can process
        
        # Store input file in R2
        input_file_path = f"jobs/{job.id}/input/sales-nav-{order.id}.csv"
        try:
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=input_file_path,
                Body=csv_data,
                ContentType="text/csv"
            )
            job.input_file_path = input_file_path
        except Exception as e:
            logger.error(f"Failed to store input file for job {job.id}: {e}")
            db.delete(job)
            db.commit()
            return None
        
        # Create leads and generate permutations
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
        
        # Bulk insert leads
        db.bulk_save_objects(leads_to_create)
        
        # Deduct credits (skip for admin)
        if not is_admin:
            user.credits -= leads_count
        
        db.commit()
        db.refresh(job)
        
        # Queue job for processing
        try:
            job_id_str = str(job.id)
            queue_name = "simple-email-verification-queue"
            redis_client.lpush(queue_name, job_id_str)
            logger.info(f"✅ Created and queued enrichment job {job.id} from scraping order {order.id}")
        except Exception as e:
            logger.warning(f"Failed to queue enrichment job {job.id}: {e}")
        
        return job
        
    except Exception as e:
        logger.error(f"Failed to create enrichment job from order {order.id}: {e}")
        import traceback
        traceback.print_exc()
        return None
