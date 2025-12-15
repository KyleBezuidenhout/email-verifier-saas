#!/usr/bin/env python3
"""
Enrichment Worker

Background worker that processes enrichment jobs:
- Listens to Redis queue "enrichment-job-creation" for new jobs
- Downloads CSV from R2
- Parses CSV and auto-detects columns
- Generates email permutations
- Creates Lead records
- Queues job for verification
"""

import io
import csv
import os
import sys
import time
import logging
from typing import Optional
from uuid import UUID

import redis
import boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings, ADMIN_EMAIL
from app.models.job import Job
from app.models.lead import Lead
from app.models.user import User
from app.services.permutation import generate_email_permutations, normalize_domain, clean_first_name

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Queue name
ENRICHMENT_QUEUE = "enrichment-job-creation"
VERIFICATION_QUEUE = "simple-email-verification-queue"


def normalize_header(h: str) -> str:
    """Normalize header for column detection."""
    return h.lower().replace(' ', '').replace('_', '').replace('-', '')


def auto_detect_column(actual_columns: list, normalized_headers: list, target: str, variations: list) -> Optional[str]:
    """Auto-detect column by matching normalized headers against variations."""
    for i, norm_header in enumerate(normalized_headers):
        if norm_header in variations:
            return actual_columns[i]
    return None


def parse_csv_from_r2(csv_data: bytes) -> list:
    """
    Parse CSV data and auto-detect columns.
    Returns list of remapped rows with standard column names.
    """
    csv_content = csv_data.decode('utf-8')
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(csv_reader)
    
    if not rows:
        return []
    
    # Auto-detect column mappings
    actual_columns = list(rows[0].keys())
    normalized_headers = [normalize_header(h) for h in actual_columns]
    
    COLUMN_VARIATIONS = {
        'firstname': ['firstname', 'first', 'fname', 'givenname', 'first_name'],
        'lastname': ['lastname', 'last', 'lname', 'surname', 'familyname', 'last_name'],
        'website': ['website', 'domain', 'companywebsite', 'companydomain', 'url', 'companyurl', 'company_website', 'corporatewebsite', 'corporate_website', 'corporate-website', 'primarydomain', 'organization_primary_domain', 'organizationprimarydomain'],
        'companysize': ['companysize', 'company_size', 'size', 'employees', 'employeecount', 'headcount', 'organizationsize', 'organization_size', 'orgsize', 'org_size', 'teamsize', 'team_size', 'staffcount', 'staff_count', 'numberofemployees', 'num_employees', 'employeesnumber', 'linkedincompanyemployeecount', 'linkedin_company_employee_count', 'linkedin-company-employee-count', 'linkedincompanyemployee', 'linkedin_company_employee', 'linkedin-company-employee'],
    }
    
    first_name_col = auto_detect_column(actual_columns, normalized_headers, 'firstname', COLUMN_VARIATIONS['firstname']) or 'first_name'
    last_name_col = auto_detect_column(actual_columns, normalized_headers, 'lastname', COLUMN_VARIATIONS['lastname']) or 'last_name'
    website_col = auto_detect_column(actual_columns, normalized_headers, 'website', COLUMN_VARIATIONS['website']) or 'website'
    company_size_col = auto_detect_column(actual_columns, normalized_headers, 'companysize', COLUMN_VARIATIONS['companysize'])
    
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
    
    return remapped_rows


def process_enrichment_job(job_id: str) -> bool:
    """
    Process a single enrichment job:
    1. Fetch job from database
    2. Download CSV from R2
    3. Parse CSV and generate permutations
    4. Create Lead records
    5. Update job and queue for verification
    """
    db = SessionLocal()
    try:
        # Parse job ID
        try:
            job_uuid = UUID(job_id)
        except ValueError:
            logger.error(f"Invalid job ID format: {job_id}")
            return False
        
        # Fetch job
        job = db.query(Job).filter(Job.id == job_uuid).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return False
        
        # Check if job is already processed or in wrong state
        if job.status not in ['pending', 'waiting_for_csv']:
            logger.warning(f"Job {job_id} has status '{job.status}', skipping (expected 'pending' or 'waiting_for_csv')")
            return False
        
        # Check if CSV path exists
        if not job.input_file_path:
            logger.error(f"Job {job_id} has no input_file_path")
            job.status = "failed"
            db.commit()
            return False
        
        logger.info(f"🔄 Processing enrichment job {job_id} (status: {job.status})")
        
        # Skip vayne orders - users upload CSV manually now
        if job.input_file_path and job.input_file_path.startswith("vayne-order:"):
            logger.warning(f"⚠️ Job {job_id} references vayne order - users should upload CSV manually. Skipping.")
            job.status = "failed"
            db.commit()
            return False
        
        # Download CSV from R2 (for regular file uploads)
        try:
            response = s3_client.get_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=job.input_file_path
            )
            csv_data = response['Body'].read()
            logger.info(f"✅ Downloaded CSV from R2: {len(csv_data)} bytes")
        except Exception as e:
            logger.error(f"❌ Failed to download CSV from R2 for job {job_id}: {e}")
            job.status = "failed"
            db.commit()
            return False
        
        # Parse CSV
        remapped_rows = parse_csv_from_r2(csv_data)
        if not remapped_rows:
            logger.error(f"No valid rows found in CSV for job {job_id}")
            job.status = "failed"
            db.commit()
            return False
        
        logger.info(f"📊 Parsed {len(remapped_rows)} valid rows from CSV")
        
        # Get user
        user = db.query(User).filter(User.id == job.user_id).first()
        if not user:
            logger.error(f"User not found for job {job_id}")
            job.status = "failed"
            db.commit()
            return False
        
        # Check credits (skip for admin)
        leads_count = len(remapped_rows)
        is_admin = user.email == ADMIN_EMAIL or getattr(user, 'is_admin', False)
        
        if not is_admin and user.credits < leads_count:
            logger.warning(f"Insufficient credits for user {user.id} to process job {job_id} (needs {leads_count}, has {user.credits})")
            job.status = "failed"
            db.commit()
            return False
        
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
        
        # Update job
        job.total_leads = leads_count
        job.status = "pending"  # Ready for verification
        db.commit()
        db.refresh(job)
        
        logger.info(f"✅ Updated job {job_id}: status='{job.status}', total_leads={job.total_leads}")
        
        # Queue job for verification
        try:
            job_id_str = str(job.id)
            redis_client.lpush(VERIFICATION_QUEUE, job_id_str)
            queue_length = redis_client.llen(VERIFICATION_QUEUE)
            logger.info(f"📤 QUEUED job {job_id} to verification queue '{VERIFICATION_QUEUE}' (queue length: {queue_length})")
        except Exception as e:
            logger.error(f"❌ Failed to queue job {job_id} for verification: {e}")
            # Don't fail the job - it can be manually queued later
            pass
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error processing enrichment job {job_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
            # Mark job as failed
            job = db.query(Job).filter(Job.id == UUID(job_id)).first()
            if job:
                job.status = "failed"
                db.commit()
        except:
            pass
        return False
    finally:
        db.close()


def main():
    """Main worker loop - polls enrichment queue and processes jobs."""
    logger.info(f"🚀 Enrichment worker starting...")
    logger.info(f"📋 Listening to queue: {ENRICHMENT_QUEUE}")
    
    while True:
        try:
            # Poll queue (blocking pop with timeout)
            job_id = redis_client.brpop(ENRICHMENT_QUEUE, timeout=5)
            
            if job_id:
                # brpop returns tuple: (queue_name, job_id)
                job_id = job_id[1]
                logger.info(f"📥 Received job {job_id} from queue")
                
                # Process job
                success = process_enrichment_job(job_id)
                
                if success:
                    logger.info(f"✅ Successfully processed job {job_id}")
                else:
                    logger.error(f"❌ Failed to process job {job_id}")
            
            # Small sleep to prevent tight loop
            time.sleep(0.1)
            
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down enrichment worker...")
            break
        except Exception as e:
            logger.error(f"❌ Error in worker loop: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(1)  # Wait before retrying


if __name__ == "__main__":
    main()

