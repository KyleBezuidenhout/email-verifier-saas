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
from app.services.permutation import normalize_domain, clean_first_name

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


def is_facebook_url(value: str) -> bool:
    """Check if website value contains 'facebook' (case-insensitive)."""
    if not value:
        return False
    return 'facebook' in value.lower()


def is_social_media_url(value: str) -> bool:
    """Check if website value is a social media URL that should be skipped."""
    if not value:
        return False
    return is_linkedin_url(value) or is_facebook_url(value)


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
    
    # Step 6: Check if website is a social media URL (skip these)
    if is_linkedin_url(cleaned_website):
        return None, None, None, "website_is_linkedin"
    if is_facebook_url(cleaned_website):
        return None, None, None, "website_is_facebook"
    
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


def route_to_queue_or_waiting_room(redis_client, db, user_id, job_id_str, verification_queue):
    """
    Route a job to the main queue or the client waiting room based on the
    client's max_concurrent_jobs cap.
    
    Returns True if routed to main queue, False if placed in waiting room.
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
        max_jobs = getattr(user, 'max_concurrent_jobs', 3) if user else 3

        # Count active + queued jobs for this user
        active_jobs = redis_client.hgetall('fairshare:active_jobs') or {}
        queue_items = redis_client.lrange(verification_queue, 0, -1) or []

        user_active = sum(
            1 for uid in active_jobs.values()
            if (uid if isinstance(uid, str) else uid.decode('utf-8')) == str(user_id)
        )

        user_queued = 0
        for qjid in queue_items:
            try:
                qjid_str = qjid if isinstance(qjid, str) else qjid.decode('utf-8')
                j = db.query(Job).filter(Job.id == qjid_str).first()
                if j and str(j.user_id) == str(user_id):
                    user_queued += 1
            except Exception:
                pass

        current_load = user_active + user_queued

        if current_load < max_jobs:
            redis_client.rpush(verification_queue, job_id_str)
            return True
        else:
            # Place in per-client waiting room
            waiting_key = f"fairshare:waiting:{user_id}"
            redis_client.rpush(waiting_key, job_id_str)
            # Mark job as 'waiting' in database
            db.query(Job).filter(Job.id == job_id_str).update({"status": "waiting"})
            db.commit()
            return False
    except Exception as e:
        logger.error(f"Error routing job {job_id_str}: {e}")
        # Fallback: push to main queue
        redis_client.rpush(verification_queue, job_id_str)
        return True


def normalize_header(h: str) -> str:
    """Normalize header for column detection."""
    return h.lower().replace(' ', '').replace('_', '').replace('-', '')


def auto_detect_column(actual_columns: list, normalized_headers: list, target: str, variations: list) -> Optional[str]:
    """Auto-detect column by matching normalized headers against variations."""
    for i, norm_header in enumerate(normalized_headers):
        if norm_header in variations:
            return actual_columns[i]
    return None


def parse_csv_from_r2(
    csv_data: bytes,
    column_first_name: Optional[str] = None,
    column_last_name: Optional[str] = None,
    column_website: Optional[str] = None,
    column_company_size: Optional[str] = None,
) -> list:
    """
    Parse CSV data using manual column mappings (if provided) or auto-detect columns.
    Returns list of remapped rows with standard column names.
    
    Applies comprehensive data cleaning:
    1. Skips rows missing first_name, last_name, or website
    2. Removes commas and text after comma from names
    3. Skips rows where website contains "linkedin"
    4. Cleans emojis and special characters from fields
    5. Filters out rows with invisible/zero-width characters
    6. Filters out rows where required fields contain only special chars
    
    Args:
        csv_data: Raw CSV bytes
        column_first_name: Manual mapping for first name column (bypasses auto-detection)
        column_last_name: Manual mapping for last name column (bypasses auto-detection)
        column_website: Manual mapping for website column (bypasses auto-detection)
        column_company_size: Manual mapping for company size column (bypasses auto-detection)
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
    
    # Get actual column names from CSV
    actual_columns = list(rows[0].keys())
    normalized_headers = [normalize_header(h) for h in actual_columns]
    
    logger.info(f"📋 Detected columns: {actual_columns}")
    
    # Column variations for auto-detection (fallback when manual mapping not provided)
    COLUMN_VARIATIONS = {
        'firstname': ['firstname', 'first', 'fname', 'givenname', 'first_name'],
        'lastname': ['lastname', 'last', 'lname', 'surname', 'familyname', 'last_name'],
        'website': ['website', 'domain', 'companywebsite', 'companydomain', 'url', 'companyurl', 'company_website', 'corporatewebsite', 'corporate_website', 'corporate-website', 'primarydomain', 'organization_primary_domain', 'organizationprimarydomain'],
        'companysize': ['companysize', 'company_size', 'size', 'employees', 'employeecount', 'headcount', 'organizationsize', 'organization_size', 'orgsize', 'org_size', 'teamsize', 'team_size', 'staffcount', 'staff_count', 'numberofemployees', 'num_employees', 'employeesnumber', 'linkedincompanyemployeecount', 'linkedin_company_employee_count', 'linkedin-company-employee-count', 'linkedincompanyemployee', 'linkedin_company_employee', 'linkedin-company-employee'],
    }
    
    # Use manual mapping if provided AND column exists in CSV, otherwise auto-detect
    if column_first_name and column_first_name in actual_columns:
        first_name_col = column_first_name
        logger.info(f"📋 Using manual mapping for first_name: '{first_name_col}'")
    else:
        first_name_col = auto_detect_column(actual_columns, normalized_headers, 'firstname', COLUMN_VARIATIONS['firstname']) or 'first_name'
        if column_first_name:
            logger.warning(f"⚠️ Manual mapping '{column_first_name}' not found in CSV, falling back to auto-detect: '{first_name_col}'")
    
    if column_last_name and column_last_name in actual_columns:
        last_name_col = column_last_name
        logger.info(f"📋 Using manual mapping for last_name: '{last_name_col}'")
    else:
        last_name_col = auto_detect_column(actual_columns, normalized_headers, 'lastname', COLUMN_VARIATIONS['lastname']) or 'last_name'
        if column_last_name:
            logger.warning(f"⚠️ Manual mapping '{column_last_name}' not found in CSV, falling back to auto-detect: '{last_name_col}'")
    
    if column_website and column_website in actual_columns:
        website_col = column_website
        logger.info(f"📋 Using manual mapping for website: '{website_col}'")
    else:
        website_col = auto_detect_column(actual_columns, normalized_headers, 'website', COLUMN_VARIATIONS['website']) or 'website'
        if column_website:
            logger.warning(f"⚠️ Manual mapping '{column_website}' not found in CSV, falling back to auto-detect: '{website_col}'")
    
    if column_company_size and column_company_size in actual_columns:
        company_size_col = column_company_size
        logger.info(f"📋 Using manual mapping for company_size: '{company_size_col}'")
    else:
        company_size_col = auto_detect_column(actual_columns, normalized_headers, 'companysize', COLUMN_VARIATIONS['companysize'])
        if column_company_size:
            logger.warning(f"⚠️ Manual mapping '{column_company_size}' not found in CSV, falling back to auto-detect: '{company_size_col}'")
    
    logger.info(f"🔗 Final column mapping: first_name='{first_name_col}', last_name='{last_name_col}', website='{website_col}', company_size='{company_size_col}'")
    
    # Track skip reasons for logging
    skip_reasons = {
        'empty_first_name': 0,
        'empty_last_name': 0,
        'empty_website': 0,
        'first_name_only_special_chars': 0,
        'last_name_only_special_chars': 0,
        'website_only_special_chars': 0,
        'website_is_linkedin': 0,
        'website_is_facebook': 0,
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
        
        # Safety net: never run enrichment/permutation logic on a verification job
        if job.job_type == "verification":
            logger.error(f"❌ Job {job_id} is a verification job but was routed to enrichment processor. Skipping to prevent permutation generation on email addresses.")
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
        
        # Parse CSV - pass stored column mappings if they exist
        remapped_rows = parse_csv_from_r2(
            csv_data,
            column_first_name=getattr(job, 'column_first_name', None),
            column_last_name=getattr(job, 'column_last_name', None),
            column_website=getattr(job, 'column_website', None),
            column_company_size=getattr(job, 'column_company_size', None),
        )
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
        
        # Create ONE lead per person (permutations generated on-the-fly during verification)
        # This reduces database storage by 16-32x compared to storing all permutations
        logger.info(f"🔄 Creating {len(remapped_rows)} leads (1 per person, permutations generated during verification)")
        leads_to_create = []
        for row in remapped_rows:
            first_name = row['first_name']
            last_name = row['last_name']
            website = row['website']
            domain = normalize_domain(website)
            # Use row's company_size if present, otherwise fall back to job's manual selection
            company_size = row.get('company_size') or default_company_size
            
            # Create ONE lead per person - email will be populated during verification
            # Verification worker generates all 32 permutations on-the-fly
            lead = Lead(
                job_id=job.id,
                user_id=user.id,
                first_name=first_name,
                last_name=last_name,
                domain=domain,
                company_size=company_size,
                email='',  # Populated by verification worker with winning email
                pattern_used=None,  # Populated by verification worker
                prevalence_score=None,  # Populated by verification worker
                verification_status='pending',
                is_final_result=False,
                extra_data=row.get('extra_data', {}),
            )
            leads_to_create.append(lead)
        
        logger.info(f"📊 Created {len(leads_to_create)} leads from {len(remapped_rows)} CSV rows")
        
        # Bulk insert leads
        logger.info(f"💾 Bulk inserting {len(leads_to_create)} leads into database")
        db.bulk_save_objects(leads_to_create)
        
        # Credits are deducted by the Node.js verification worker on job completion
        # (avoids double-charging since enrichment auto-queues for verification)
        
        # Update job
        job.total_leads = leads_count
        job.status = "pending"  # Ready for verification
        db.commit()
        db.refresh(job)
        
        logger.info(f"✅ Updated job {job_id}: status='{job.status}', total_leads={job.total_leads}")
        
        # Queue job for verification - route through waiting room if client at capacity
        try:
            job_id_str = str(job.id)
            verification_queue = get_verification_queue_for_user(db, user.id)
            if route_to_queue_or_waiting_room(redis_client, db, user.id, job_id_str, verification_queue):
                queue_length = redis_client.llen(verification_queue)
                logger.info(f"QUEUED job {job_id} to verification queue '{verification_queue}' (queue length: {queue_length})")
            else:
                logger.info(f"Job {job_id} placed in waiting room for user {user.id}")
        except Exception as e:
            logger.error(f"Failed to queue job {job_id} for verification: {e}")
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


def process_verification_job(job_id: str) -> bool:
    """
    Process a deferred verification job (large uploads with >=10k rows).
    
    This is strictly verification-only - NO permutation logic:
    1. Download CSV from R2
    2. Parse emails from CSV (1 email = 1 lead)
    3. Batch insert leads into database
    4. Queue job for verification processing
    
    This mirrors what /verify-upload does synchronously for small files,
    but runs asynchronously in the worker for large files to avoid
    HTTP timeouts and massive SQL INSERT statements.
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
            logger.error(f"Verification job {job_id} not found")
            return False
        
        if job.job_type != "verification":
            logger.error(f"Job {job_id} is not a verification job (type: {job.job_type})")
            return False
        
        if job.status != "pending":
            logger.warning(f"Verification job {job_id} has status '{job.status}', skipping")
            return False
        
        if not job.input_file_path:
            logger.error(f"Verification job {job_id} has no input_file_path")
            job.status = "failed"
            db.commit()
            return False
        
        logger.info(f"🔄 Processing deferred verification job {job_id}")
        
        # Download CSV from R2
        try:
            response = s3_client.get_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=job.input_file_path
            )
            csv_data = response['Body'].read()
            logger.info(f"✅ Downloaded CSV from R2: {len(csv_data)} bytes")
        except Exception as e:
            logger.error(f"❌ Failed to download CSV from R2 for verification job {job_id}: {e}")
            job.status = "failed"
            db.commit()
            return False
        
        # Parse CSV - strictly emails only, NO permutations
        csv_content = csv_data.decode('utf-8-sig')
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(csv_reader)
        
        if not rows:
            logger.error(f"CSV is empty for verification job {job_id}")
            job.status = "failed"
            db.commit()
            return False
        
        actual_columns = list(rows[0].keys())
        
        # Retrieve column mappings stored on the job
        # Prefer column_email; fall back to column_website for pre-migration jobs
        email_col = getattr(job, 'column_email', None) or getattr(job, 'column_website', None) or 'email'
        first_name_col = getattr(job, 'column_first_name', None) or 'first_name'
        last_name_col = getattr(job, 'column_last_name', None) or 'last_name'
        
        logger.info(f"📋 Column mapping: email='{email_col}', first_name='{first_name_col}', last_name='{last_name_col}'")
        
        if email_col not in actual_columns:
            logger.error(f"Email column '{email_col}' not found in CSV columns: {actual_columns}")
            job.status = "failed"
            db.commit()
            return False
        
        # Build leads from CSV rows - strictly 1 email = 1 lead, NO permutations
        mapped_cols = {email_col, first_name_col, last_name_col}
        leads_to_create = []
        
        for row in rows:
            email = row.get(email_col, '').strip()
            if not email:
                continue
            
            first_name = ''
            if first_name_col in actual_columns:
                first_name = clean_first_name(row.get(first_name_col, '').strip())
            
            last_name = ''
            if last_name_col in actual_columns:
                last_name = row.get(last_name_col, '').strip()
            
            domain = ''
            if '@' in email:
                domain = email.split('@')[1]
            
            # Capture extra columns
            extra_data = {}
            for col, val in row.items():
                if col not in mapped_cols and val and str(val).strip():
                    extra_data[col] = str(val).strip()
            
            lead = Lead(
                job_id=job.id,
                user_id=job.user_id,
                first_name=first_name,
                last_name=last_name,
                domain=domain,
                email=email,
                verification_status='pending',
                is_final_result=False,
                extra_data=extra_data,
            )
            leads_to_create.append(lead)
        
        if not leads_to_create:
            logger.error(f"No valid email rows found in CSV for verification job {job_id}")
            job.status = "failed"
            db.commit()
            return False
        
        logger.info(f"📊 Parsed {len(leads_to_create)} emails from {len(rows)} CSV rows (verification, no permutations)")
        
        # Batch insert leads to avoid massive SQL statements
        BATCH_SIZE = 500
        total_inserted = 0
        for i in range(0, len(leads_to_create), BATCH_SIZE):
            batch = leads_to_create[i:i + BATCH_SIZE]
            db.bulk_save_objects(batch)
            db.flush()
            total_inserted += len(batch)
            if total_inserted % 5000 == 0 or total_inserted == len(leads_to_create):
                logger.info(f"💾 Inserted {total_inserted}/{len(leads_to_create)} leads")
        
        # Credits are deducted by the Node.js verification worker on job completion
        # (avoids double-charging since this function queues to the verification worker)
        
        # Update job - total_leads was already set in the endpoint
        job.status = "pending"
        db.commit()
        
        logger.info(f"✅ Created {total_inserted} leads for verification job {job_id}")
        
        # Queue job for verification processing - route through waiting room if needed
        try:
            verification_queue = get_verification_queue_for_user(db, job.user_id)
            if route_to_queue_or_waiting_room(redis_client, db, job.user_id, str(job.id), verification_queue):
                queue_length = redis_client.llen(verification_queue)
                logger.info(f"QUEUED verification job {job_id} to '{verification_queue}' (queue length: {queue_length})")
            else:
                logger.info(f"Verification job {job_id} placed in waiting room for user {job.user_id}")
        except Exception as e:
            logger.error(f"❌ Failed to queue verification job {job_id}, marking as failed: {e}")
            job.status = "failed"
            db.commit()
            return False
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error processing verification job {job_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
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
                
                # Check job type to route to correct processor
                try:
                    job_uuid = UUID(job_id)
                    db = SessionLocal()
                    job = db.query(Job).filter(Job.id == job_uuid).first()
                    job_type = job.job_type if job else None
                    db.close()
                except Exception as e:
                    logger.error(f"❌ Failed to determine job type for {job_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    job_type = None
                
                if job_type is None:
                    logger.error(f"❌ Could not determine job type for {job_id}, skipping to avoid misroute")
                    continue
                elif job_type == "verification":
                    # Deferred verification job (large upload) - NO permutations
                    logger.info(f"📋 Job {job_id} is verification type - processing without permutations")
                    success = process_verification_job(job_id)
                else:
                    # Standard enrichment job - with permutations
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

