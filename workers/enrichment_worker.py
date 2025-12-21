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
import re
import logging
import unicodedata
from typing import Optional, Tuple
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
from app.models.worker_config import WorkerConfig
from app.services.permutation import generate_email_permutations, normalize_domain, clean_first_name

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============================================
# DATA CLEANING FUNCTIONS FOR ENRICHMENT
# ============================================

# Characters considered "empty" or invalid for required fields
INVALID_ONLY_CHARS = set('-–—_./\\|@#$%^&*()+=[]{}:;"\'<>?,!~`')

# Zero-width and invisible characters to detect/remove
INVISIBLE_CHARS = [
    '\u200b',  # Zero-width space
    '\u200c',  # Zero-width non-joiner
    '\u200d',  # Zero-width joiner
    '\u2060',  # Word joiner
    '\ufeff',  # Zero-width no-break space (BOM)
    '\u00a0',  # Non-breaking space
    '\u2007',  # Figure space
    '\u202f',  # Narrow no-break space
    '\u00ad',  # Soft hyphen
]

# Regex pattern to match emojis
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # Emoticons
    "\U0001F300-\U0001F5FF"  # Symbols & pictographs
    "\U0001F680-\U0001F6FF"  # Transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # Flags
    "\U00002702-\U000027B0"  # Dingbats
    "\U000024C2-\U0001F251"  # Enclosed characters
    "\U0001F900-\U0001F9FF"  # Supplemental symbols
    "\U0001FA00-\U0001FA6F"  # Chess symbols
    "\U0001FA70-\U0001FAFF"  # Symbols and pictographs extended-A
    "\U00002600-\U000026FF"  # Misc symbols
    "]+",
    flags=re.UNICODE
)


def contains_invisible_chars(value: str) -> bool:
    """Check if string contains non-breaking spaces or zero-width characters."""
    if not value:
        return False
    for char in INVISIBLE_CHARS:
        if char in value:
            return True
    return False


def remove_invisible_chars(value: str) -> str:
    """Remove all invisible/zero-width characters from string."""
    if not value:
        return value
    result = value
    for char in INVISIBLE_CHARS:
        result = result.replace(char, ' ')
    # Collapse multiple spaces into one
    result = ' '.join(result.split())
    return result


def remove_emojis(value: str) -> str:
    """Remove all emojis from string."""
    if not value:
        return value
    return EMOJI_PATTERN.sub('', value)


def clean_name_field(value: str) -> str:
    """
    Clean a name field (first_name or last_name):
    1. Remove invisible characters
    2. Remove emojis
    3. Remove leading special characters (@, ", etc.)
    4. If contains comma, take only the part before the comma
    5. Strip whitespace
    """
    if not value:
        return ''
    
    # Remove invisible characters
    cleaned = remove_invisible_chars(value)
    
    # Remove emojis
    cleaned = remove_emojis(cleaned)
    
    # If contains comma, take only the part before the comma
    if ',' in cleaned:
        cleaned = cleaned.split(',')[0]
    
    # Remove leading special characters (but keep internal ones like O'Brien)
    cleaned = cleaned.lstrip('@"\'#$%^&*()_+=[]{}|\\:;<>?/~`!')
    
    # Remove trailing special characters
    cleaned = cleaned.rstrip('@"\'#$%^&*()_+=[]{}|\\:;<>?/~`!.')
    
    # Strip whitespace
    cleaned = cleaned.strip()
    
    return cleaned


def clean_website_field(value: str) -> str:
    """
    Clean a website/domain field:
    1. Remove invisible characters
    2. Remove emojis
    3. Strip whitespace
    4. Remove quotes
    """
    if not value:
        return ''
    
    # Remove invisible characters
    cleaned = remove_invisible_chars(value)
    
    # Remove emojis
    cleaned = remove_emojis(cleaned)
    
    # Remove surrounding quotes
    cleaned = cleaned.strip('"\'')
    
    # Strip whitespace
    cleaned = cleaned.strip()
    
    return cleaned


def is_only_special_chars(value: str) -> bool:
    """
    Check if a value contains ONLY special characters (no letters/numbers).
    Returns True if the value should be considered empty/invalid.
    """
    if not value:
        return True
    
    # Remove all special characters and whitespace
    stripped = value.strip()
    
    # Check if it's just dashes, dots, or other special chars
    if all(c in INVALID_ONLY_CHARS or c.isspace() for c in stripped):
        return True
    
    # Check if there are any alphanumeric characters
    if not any(c.isalnum() for c in stripped):
        return True
    
    return False


def is_linkedin_url(value: str) -> bool:
    """Check if website value contains 'linkedin' (case-insensitive)."""
    if not value:
        return False
    return 'linkedin' in value.lower()


def validate_and_clean_row(first_name: str, last_name: str, website: str) -> Tuple[Optional[str], Optional[str], Optional[str], str]:
    """
    Validate and clean a row's critical fields.
    
    Returns:
        Tuple of (cleaned_first_name, cleaned_last_name, cleaned_website, skip_reason)
        If skip_reason is not empty, the row should be skipped.
    """
    # Step 1: Check for invisible characters (filter out these rows entirely)
    if contains_invisible_chars(first_name) or contains_invisible_chars(last_name) or contains_invisible_chars(website):
        # Try to clean them first
        first_name = remove_invisible_chars(first_name)
        last_name = remove_invisible_chars(last_name)
        website = remove_invisible_chars(website)
    
    # Step 2: Clean the fields
    cleaned_first = clean_name_field(first_name)
    cleaned_last = clean_name_field(last_name)
    cleaned_website = clean_website_field(website)
    
    # Step 3: Apply clean_first_name (removes trailing initials like "n.")
    cleaned_first = clean_first_name(cleaned_first)
    
    # Step 4: Check if any required field is empty after cleaning
    if not cleaned_first:
        return None, None, None, "empty_first_name"
    if not cleaned_last:
        return None, None, None, "empty_last_name"
    if not cleaned_website:
        return None, None, None, "empty_website"
    
    # Step 5: Check if any field contains only special characters
    if is_only_special_chars(cleaned_first):
        return None, None, None, "first_name_only_special_chars"
    if is_only_special_chars(cleaned_last):
        return None, None, None, "last_name_only_special_chars"
    if is_only_special_chars(cleaned_website):
        return None, None, None, "website_only_special_chars"
    
    # Step 6: Check if website is a LinkedIn URL (skip these)
    if is_linkedin_url(cleaned_website):
        return None, None, None, "website_is_linkedin"
    
    return cleaned_first, cleaned_last, cleaned_website, ""

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

# Queue names (defaults - can be overridden by worker_configs table)
ENRICHMENT_QUEUE = "enrichment-job-creation"
DEFAULT_VERIFICATION_QUEUE = "simple-email-verification-queue"


def get_verification_queue_for_user(db, user_id) -> str:
    """
    Get the verification queue name for a user.
    
    Looks up the user's worker_config in the database.
    If they have a dedicated config, returns their custom queue.
    Otherwise, returns the default shared queue.
    
    This enables routing enrichment jobs to client-specific verification workers.
    """
    try:
        config = db.query(WorkerConfig).filter(
            WorkerConfig.user_id == user_id,
            WorkerConfig.is_active == True
        ).first()
        
        if config and config.verification_queue:
            logger.info(f"🎯 User {user_id} has dedicated queue: {config.verification_queue}")
            return config.verification_queue
        
        # No dedicated config - use shared queue
        return DEFAULT_VERIFICATION_QUEUE
        
    except Exception as e:
        logger.warning(f"⚠️ Error looking up worker config for user {user_id}: {e}")
        # Fall back to shared queue on error
        return DEFAULT_VERIFICATION_QUEUE


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
    
    Applies comprehensive data cleaning:
    1. Skips rows missing first_name, last_name, or website
    2. Removes commas and text after comma from names
    3. Skips rows where website contains "linkedin"
    4. Cleans emojis and special characters from fields
    5. Filters out rows with invisible/zero-width characters
    6. Filters out rows where required fields contain only special chars
    """
    # Handle BOM in UTF-8 files
    csv_content = csv_data.decode('utf-8-sig')
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(csv_reader)
    
    if not rows:
        logger.warning("CSV file is empty (no data rows)")
        return []
    
    total_rows = len(rows)
    logger.info(f"📊 CSV contains {total_rows} total rows")
    
    # Auto-detect column mappings
    actual_columns = list(rows[0].keys())
    normalized_headers = [normalize_header(h) for h in actual_columns]
    
    logger.info(f"📋 Detected columns: {actual_columns}")
    
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
    
    logger.info(f"🔗 Column mapping: first_name='{first_name_col}', last_name='{last_name_col}', website='{website_col}', company_size='{company_size_col}'")
    
    # Track skip reasons for logging
    skip_reasons = {
        'empty_first_name': 0,
        'empty_last_name': 0,
        'empty_website': 0,
        'first_name_only_special_chars': 0,
        'last_name_only_special_chars': 0,
        'website_only_special_chars': 0,
        'website_is_linkedin': 0,
    }
    
    # Remap rows to standard format with cleaning
    remapped_rows = []
    for row_num, row in enumerate(rows, start=2):  # Start at 2 because row 1 is header
        # Get raw values
        raw_first = row.get(first_name_col, '') or ''
        raw_last = row.get(last_name_col, '') or ''
        raw_website = row.get(website_col, '') or ''
        
        # Validate and clean the row
        cleaned_first, cleaned_last, cleaned_website, skip_reason = validate_and_clean_row(
            raw_first, raw_last, raw_website
        )
        
        # If row should be skipped, track reason and continue
        if skip_reason:
            skip_reasons[skip_reason] = skip_reasons.get(skip_reason, 0) + 1
            continue
        
        # Build the remapped row
        remapped_row = {
            'first_name': cleaned_first,
            'last_name': cleaned_last,
            'website': cleaned_website,
        }
        
        # Add company size if available
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
    
    # Log skip statistics
    total_skipped = sum(skip_reasons.values())
    if total_skipped > 0:
        logger.warning(f"⚠️  Skipped {total_skipped}/{total_rows} rows due to data quality issues:")
        for reason, count in skip_reasons.items():
            if count > 0:
                logger.warning(f"   - {reason}: {count} rows")
    
    logger.info(f"✅ {len(remapped_rows)}/{total_rows} rows passed validation and cleaning")
    
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
        
        # Get default company size from job (user's dropdown selection)
        default_company_size = getattr(job, 'company_size', None)
        if default_company_size:
            logger.info(f"📊 Using default company size from job: {default_company_size}")
        
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
            company_size = row.get('company_size') or default_company_size
            
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
        
        # Queue job for verification - route to client-specific queue if configured
        try:
            job_id_str = str(job.id)
            # Look up user's dedicated queue (or use shared queue)
            verification_queue = get_verification_queue_for_user(db, user.id)
            redis_client.lpush(verification_queue, job_id_str)
            queue_length = redis_client.llen(verification_queue)
            logger.info(f"📤 QUEUED job {job_id} to verification queue '{verification_queue}' (queue length: {queue_length})")
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

