from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, update
from typing import Optional, List, Tuple
from pydantic import BaseModel
import csv
import io
import re
import uuid
import unicodedata
from datetime import datetime

from decimal import Decimal

from app.db.session import get_db, SessionLocal
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.models.worker_config import WorkerConfig
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.core.plans import get_enrichment_cost, is_enrichment_free
from app.schemas.job import JobResponse, JobUploadResponse, JobProgressResponse
from app.services.permutation import generate_email_permutations, normalize_domain, clean_first_name
from app.services.mailtester_client import MailTesterClient
from app.core.config import settings
from app.core.sanitize import sanitize_text
from app.core.security import decode_token
import boto3
import redis
import asyncio
import json
import time
from urllib.parse import urlparse


# ============================================
# QUEUE ROUTING HELPERS
# ============================================

# Default queue names (can be overridden by worker_configs table)
DEFAULT_ENRICHMENT_QUEUE = "enrichment-job-creation"
DEFAULT_VERIFICATION_QUEUE = "simple-email-verification-queue"
DEFAULT_CATCHALL_QUEUE = "catchall-verification-queue"


def get_verification_queue_for_user(db: Session, user_id) -> str:
    """
    Get the verification queue name for a user.
    
    Looks up the user's worker_config in the database.
    If they have a dedicated config, returns their custom queue.
    Otherwise, returns the default shared queue.
    """
    try:
        config = db.query(WorkerConfig).filter(
            WorkerConfig.user_id == user_id,
            WorkerConfig.is_active == True
        ).first()
        
        if config and config.verification_queue:
            return config.verification_queue
        
        return DEFAULT_VERIFICATION_QUEUE
    except Exception:
        return DEFAULT_VERIFICATION_QUEUE


def get_enrichment_queue_for_user(db: Session, user_id) -> str:
    """
    Get the enrichment queue name for a user.
    
    Most users use the shared enrichment queue, but this allows
    for custom enrichment queues if needed.
    """
    try:
        config = db.query(WorkerConfig).filter(
            WorkerConfig.user_id == user_id,
            WorkerConfig.is_active == True
        ).first()
        
        if config and config.enrichment_queue:
            return config.enrichment_queue
        
        return DEFAULT_ENRICHMENT_QUEUE
    except Exception:
        return DEFAULT_ENRICHMENT_QUEUE


def route_job_to_queue_or_waiting_room(r_client, db: Session, user_id, job_id_str: str, verification_queue: str) -> bool:
    """
    Route a verification job to the main queue or the client's waiting room
    based on their max_concurrent_jobs cap.
    
    Returns True if routed to main queue, False if placed in waiting room.
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
        max_jobs = getattr(user, 'max_concurrent_jobs', 3) if user else 3

        active_jobs = r_client.hgetall("fairshare:active_jobs") or {}
        queue_items = r_client.lrange(verification_queue, 0, -1) or []

        user_active = sum(
            1 for uid in active_jobs.values()
            if (uid if isinstance(uid, str) else uid.decode('utf-8')) == str(user_id)
        )

        user_queued = 0
        for qjid in queue_items:
            jid = qjid if isinstance(qjid, str) else qjid.decode('utf-8')
            j = db.query(Job).filter(Job.id == jid).first()
            if j and str(j.user_id) == str(user_id):
                user_queued += 1

        current_load = user_active + user_queued

        if current_load < max_jobs:
            r_client.rpush(verification_queue, job_id_str)
            return True
        else:
            waiting_key = f"fairshare:waiting:{user_id}"
            r_client.rpush(waiting_key, job_id_str)
            db.query(Job).filter(Job.id == job_id_str).update({"status": "waiting"})
            db.commit()
            return False
    except Exception as e:
        print(f"Error routing job {job_id_str}: {e}")
        r_client.rpush(verification_queue, job_id_str)
        return True


def route_catchall_to_queue_or_waiting_room(r_client, db: Session, user_id, job_id_str: str) -> bool:
    """
    Route a catchall verification job to the catchall queue or the client's
    catchall waiting room based on their max_concurrent_jobs cap.

    Uses a completely separate pool from verification/enrichment:
      - Active hash: catchall:active_jobs
      - Queue: catchall-verification-queue
      - Waiting room: catchall:waiting:{user_id}

    Returns True if routed to main queue, False if placed in waiting room.
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
        max_jobs = getattr(user, 'max_concurrent_jobs', 3) if user else 3

        active_jobs = r_client.hgetall("catchall:active_jobs") or {}
        queue_items = r_client.lrange(DEFAULT_CATCHALL_QUEUE, 0, -1) or []

        user_active = sum(
            1 for uid in active_jobs.values()
            if (uid if isinstance(uid, str) else uid.decode('utf-8')) == str(user_id)
        )

        user_queued = 0
        for qjid in queue_items:
            jid = qjid if isinstance(qjid, str) else qjid.decode('utf-8')
            j = db.query(Job).filter(Job.id == jid).first()
            if j and str(j.user_id) == str(user_id):
                user_queued += 1

        current_load = user_active + user_queued

        if current_load < max_jobs:
            r_client.rpush(DEFAULT_CATCHALL_QUEUE, job_id_str)
            return True
        else:
            waiting_key = f"catchall:waiting:{user_id}"
            r_client.rpush(waiting_key, job_id_str)
            db.query(Job).filter(Job.id == job_id_str).update({"status": "waiting"})
            db.commit()
            return False
    except Exception as e:
        print(f"Error routing catchall job {job_id_str}: {e}")
        r_client.rpush(DEFAULT_CATCHALL_QUEUE, job_id_str)
        return True


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


def detect_duplicate_headers(csv_content: str) -> list:
    """
    Detect duplicate column headers in CSV content.
    Python's csv.DictReader silently uses last-value-wins for duplicates,
    which causes data to be read from the wrong column.
    Returns a list of header names that appear more than once.
    """
    reader = csv.reader(io.StringIO(csv_content))
    try:
        headers = next(reader)
    except StopIteration:
        return []
    seen = set()
    duplicates = set()
    for h in headers:
        normalized = h.strip()
        if normalized in seen:
            duplicates.add(normalized)
        seen.add(normalized)
    return sorted(duplicates)


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
    5. Keep only the first whitespace-delimited token
    6. Strip whitespace
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

    # Keep only the first token (hyphenated names stay intact)
    if cleaned:
        cleaned = cleaned.split()[0]
    
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
    # Step 1: Clean the fields
    cleaned_first = clean_name_field(first_name)
    cleaned_last = clean_name_field(last_name)
    cleaned_website = clean_website_field(website)
    
    # Step 2: Apply clean_first_name (removes trailing initials like "n.")
    cleaned_first = clean_first_name(cleaned_first)
    
    # Step 3: Check if any required field is empty after cleaning
    if not cleaned_first:
        return None, None, None, "empty_first_name"
    if not cleaned_last:
        return None, None, None, "empty_last_name"
    if not cleaned_website:
        return None, None, None, "empty_website"
    
    # Step 4: Check if any field contains only special characters
    if is_only_special_chars(cleaned_first):
        return None, None, None, "first_name_only_special_chars"
    if is_only_special_chars(cleaned_last):
        return None, None, None, "last_name_only_special_chars"
    if is_only_special_chars(cleaned_website):
        return None, None, None, "website_only_special_chars"
    
    # Step 5: Check if website is a LinkedIn URL (skip these)
    if is_linkedin_url(cleaned_website):
        return None, None, None, "website_is_linkedin"
    
    return cleaned_first, cleaned_last, cleaned_website, ""

router = APIRouter()

# Initialize Redis connection for job queue (with timeouts to prevent hangs)
redis_client = redis.from_url(settings.REDIS_URL, socket_timeout=10, socket_connect_timeout=10)

# Try to use BullMQ Python package, fallback to manual implementation
try:
    from bullmq import Queue
    redis_url_parsed = urlparse(settings.REDIS_URL)
    bullmq_queue = Queue("email-verification", connection={
        "host": redis_url_parsed.hostname or "localhost",
        "port": redis_url_parsed.port or 6379,
        "password": redis_url_parsed.password,
    })
    USE_BULLMQ_PACKAGE = True
except ImportError:
    USE_BULLMQ_PACKAGE = False
    print("BullMQ package not found, using manual queue implementation")

# Initialize S3 client for Cloudflare R2 (with timeouts to prevent hangs)
from botocore.config import Config as BotoConfig
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto',
    config=BotoConfig(connect_timeout=10, read_timeout=30, retries={'max_attempts': 2}),
)

# Max file size for CSV uploads: 200MB
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024


@router.post("/upload", response_model=JobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    column_first_name: Optional[str] = Form(None),
    column_last_name: Optional[str] = Form(None),
    column_website: Optional[str] = Form(None),
    column_company_size: Optional[str] = Form(None),  # For CSV mapping to extra_data
    source: Optional[str] = Form(None),  # e.g., "Sales Nav"
    job_name: Optional[str] = Form(None),  # Optional user-provided job name
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    print(f"📤 UPLOAD START: user={current_user.email}, file={file.filename}, job_name={job_name}")
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )
    
    # Read and parse CSV (handle UTF-8 BOM)
    contents = await file.read()
    csv_content = contents.decode('utf-8-sig')  # utf-8-sig handles BOM automatically
    
    # Detect duplicate headers before DictReader silently merges them
    duplicate_headers = detect_duplicate_headers(csv_content)
    if duplicate_headers:
        print(f"⚠️  Duplicate headers detected: {duplicate_headers}")
    
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    
    # Get actual column names from CSV
    rows = list(csv_reader)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )
    
    actual_columns = list(rows[0].keys())
    print(f"📋 Detected columns: {actual_columns}")
    
    # Use provided column mappings or default to standard names
    first_name_col = column_first_name or 'first_name'
    last_name_col = column_last_name or 'last_name'
    website_col = column_website or 'website'
    company_size_col = column_company_size or 'company_size'
    print(f"🔗 Column mapping: first_name='{first_name_col}', last_name='{last_name_col}', website='{website_col}')")
    
    # Validate that mapped columns exist in CSV
    required_mappings = {
        'first_name': first_name_col,
        'last_name': last_name_col,
        'website': website_col,
    }
    
    missing_columns = []
    for standard_name, mapped_name in required_mappings.items():
        if mapped_name not in actual_columns:
            missing_columns.append(f"{standard_name} (mapped to '{mapped_name}')")
    
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )
    
    # Remap CSV rows to standard column names and capture extra columns
    # Standard columns that are mapped to specific fields
    mapped_cols = {first_name_col, last_name_col, website_col, company_size_col}
    
    # Track skip reasons for helpful error messages
    skip_reasons = {
        'empty_first_name': 0,
        'empty_last_name': 0,
        'empty_website': 0,
        'first_name_only_special_chars': 0,
        'last_name_only_special_chars': 0,
        'website_only_special_chars': 0,
        'website_is_linkedin': 0,
    }
    
    remapped_rows = []
    for row in rows:
        # Get raw values
        raw_first = row.get(first_name_col, '') or ''
        raw_last = row.get(last_name_col, '') or ''
        raw_website = row.get(website_col, '') or ''
        
        # Validate and clean the row using comprehensive cleaning
        cleaned_first, cleaned_last, cleaned_website, skip_reason = validate_and_clean_row(
            raw_first, raw_last, raw_website
        )
        
        # If row should be skipped, track reason and continue
        if skip_reason:
            skip_reasons[skip_reason] = skip_reasons.get(skip_reason, 0) + 1
            continue
        
        remapped_row = {
            'first_name': cleaned_first,
            'last_name': cleaned_last,
            'website': cleaned_website,
        }
        # Capture all extra columns (not in mapped_cols) into extra_data
        extra_data = {}
        # If CSV has company_size column, keep it for reference in extra_data only
        if company_size_col in actual_columns and row.get(company_size_col):
            extra_data['company_size'] = sanitize_text(row.get(company_size_col, ''))
        for col, val in row.items():
            if col not in mapped_cols and val and str(val).strip():
                extra_data[col] = sanitize_text(val)
        remapped_row['extra_data'] = extra_data
        
        remapped_rows.append(remapped_row)
    
    # Log skip statistics
    total_skipped = sum(skip_reasons.values())
    total_rows = len(rows)
    if total_skipped > 0:
        print(f"⚠️  Skipped {total_skipped}/{total_rows} rows due to data quality issues:")
        for reason, count in skip_reasons.items():
            if count > 0:
                print(f"   - {reason}: {count} rows")
    
    print(f"✅ {len(remapped_rows)}/{total_rows} rows passed validation and cleaning")
    
    if not remapped_rows:
        # Build a detailed error message
        error_details = []
        for reason, count in skip_reasons.items():
            if count > 0:
                if reason == "empty_first_name":
                    error_details.append(f"{count} rows missing first name")
                elif reason == "empty_last_name":
                    error_details.append(f"{count} rows missing last name")
                elif reason == "empty_website":
                    error_details.append(f"{count} rows missing website/domain")
                elif reason == "website_is_linkedin":
                    error_details.append(f"{count} rows have LinkedIn URLs as website (not valid company domains)")
                elif "special_chars" in reason:
                    error_details.append(f"{count} rows have only special characters in required fields")
        
        detail_msg = "No valid rows found in CSV. "
        if error_details:
            detail_msg += "Issues found: " + "; ".join(error_details)
        else:
            detail_msg += "All rows were filtered out due to missing or invalid data in required columns (first_name, last_name, website)."
        
        if duplicate_headers:
            detail_msg += f" WARNING: Your CSV has duplicate column headers ({', '.join(duplicate_headers)}). This causes data to be read incorrectly. Please remove duplicate columns and re-upload."
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail_msg
        )
    
    leads_count = len(remapped_rows)
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    user_plan = getattr(current_user, 'plan', 'trial') or 'trial'

    if not is_admin and not is_enrichment_free(user_plan):
        enrichment_cost = get_enrichment_cost(user_plan)
        required = float(leads_count * enrichment_cost)
        if float(current_user.credits) < required:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient credits. You have {float(current_user.credits):.1f} credits but this job requires {required:.1f} credits. Please top up your account."
            )

    job = Job(
        user_id=current_user.id,
        status="pending",
        original_filename=file.filename,
        job_name=job_name.strip() if job_name else None,
        total_leads=0,
        processed_leads=0,
        valid_emails_found=0,
        catchall_emails_found=0,
        cost_in_credits=0,
        plan_at_creation=user_plan,
        source=source,
        column_first_name=column_first_name,
        column_last_name=column_last_name,
        column_website=column_website,
        column_company_size=column_company_size,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    print(f"📤 UPLOAD: job {job.id} created in DB")

    # Upload file to R2
    input_file_path = f"jobs/{job.id}/input/{file.filename}"
    try:
        print(f"📤 UPLOAD: uploading to R2 ({len(contents)} bytes)...")
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=input_file_path,
            Body=contents
        )
        job.input_file_path = input_file_path
        db.commit()
        print(f"📤 UPLOAD: R2 upload done")
    except Exception as e:
        print(f"📤 UPLOAD: R2 upload FAILED: {e}")
        db.delete(job)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error. Please try again later."
        )

    # Queue job for enrichment (RPUSH for FIFO ordering)
    try:
        job_id_str = str(job.id)
        queue_name = get_enrichment_queue_for_user(db, current_user.id)
        print(f"📤 UPLOAD: pushing to Redis queue '{queue_name}'...")
        redis_client.rpush(queue_name, job_id_str)
        queue_length = redis_client.llen(queue_name)
        print(f"📤 UPLOAD: QUEUED job {job.id} (queue length: {queue_length})")
    except Exception as e:
        print(f"📤 UPLOAD: Redis push FAILED (non-fatal): {e}")
        import traceback
        traceback.print_exc()

    print(f"📤 UPLOAD COMPLETE: job {job.id} for user {current_user.email}")
    return JobUploadResponse(
        job_id=job.id,
        message="File uploaded successfully. Processing started."
    )


@router.post("/verify-upload", response_model=JobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_verify_file(
    file: UploadFile = File(...),
    column_email: Optional[str] = Form(None),
    column_first_name: Optional[str] = Form(None),
    column_last_name: Optional[str] = Form(None),
    job_name: Optional[str] = Form(None),  # Optional user-provided job name
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload CSV file for verification-only (no permutation logic).
    CSV must have an 'email' column. Optional: first_name, last_name for display.
    """
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )
    
    # Read and parse CSV (handle UTF-8 BOM)
    contents = await file.read()
    csv_content = contents.decode('utf-8-sig')  # utf-8-sig handles BOM automatically
    
    # Detect duplicate headers before DictReader silently merges them
    duplicate_headers = detect_duplicate_headers(csv_content)
    if duplicate_headers:
        print(f"⚠️  Duplicate headers detected in verify-upload: {duplicate_headers}")
    
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    
    # Get actual column names from CSV
    rows = list(csv_reader)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )
    
    actual_columns = list(rows[0].keys())
    
    # Use provided column mappings or default to standard names
    email_col = column_email or 'email'
    first_name_col = column_first_name or 'first_name'
    last_name_col = column_last_name or 'last_name'
    
    # Validate that email column exists
    if email_col not in actual_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required column: email (mapped to '{email_col}')"
        )
    
    # Threshold for deferring lead creation to worker (avoids DB parameter limits + HTTP timeouts)
    DEFER_THRESHOLD = 10000

    # ---- LARGE UPLOAD FAST PATH ----
    # For large files, skip the expensive per-row parsing loop entirely.
    # Just count valid emails, check credits, create the job, and hand off to the worker.
    if len(rows) >= DEFER_THRESHOLD:
        leads_count = sum(1 for row in rows if row.get(email_col, '').strip())

        if leads_count == 0:
            detail_msg = "No valid rows with email addresses found in CSV."
            if duplicate_headers:
                detail_msg += f" WARNING: Your CSV has duplicate column headers ({', '.join(duplicate_headers)}). This causes data to be read incorrectly. Please remove duplicate columns and re-upload."
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail_msg
            )

        is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
        user_plan = getattr(current_user, 'plan', 'trial') or 'trial'
        if not is_admin and not is_enrichment_free(user_plan):
            enrichment_cost = get_enrichment_cost(user_plan)
            required = float(leads_count * enrichment_cost)
            if float(current_user.credits) < required:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient credits. You have {float(current_user.credits):.1f} credits but this job requires {required:.1f} credits. Please top up your account."
                )

        print(f"Large verification upload ({leads_count} emails in {len(rows)} rows), deferring to worker")

        job = Job(
            user_id=current_user.id,
            status="pending",
            job_type="verification",
            original_filename=file.filename,
            job_name=job_name.strip() if job_name else None,
            total_leads=leads_count,
            processed_leads=0,
            valid_emails_found=0,
            catchall_emails_found=0,
            cost_in_credits=0,
            plan_at_creation=user_plan,
            column_first_name=column_first_name,
            column_last_name=column_last_name,
            column_email=column_email,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        input_file_path = f"jobs/{job.id}/input/{file.filename}"
        try:
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=input_file_path,
                Body=contents
            )
            job.input_file_path = input_file_path
            db.commit()
        except Exception as e:
            print(f"R2 upload failed for verify-upload (large): {e}")
            db.delete(job)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error. Please try again later."
            )

        try:
            job_id_str = str(job.id)
            enrichment_queue = get_enrichment_queue_for_user(db, current_user.id)
            redis_client.rpush(enrichment_queue, job_id_str)
            queue_length = redis_client.llen(enrichment_queue)
            print(f"QUEUED large verification job {job.id} to enrichment queue '{enrichment_queue}' (queue length: {queue_length})")
        except Exception as e:
            print(f"Failed to queue verification job {job.id}: {e}")
            import traceback
            traceback.print_exc()

        return JobUploadResponse(
            job_id=job.id,
            message="File uploaded successfully. Verification started."
        )

    # ---- SMALL UPLOAD (< 10K rows): Full processing with lead creation ----
    mapped_cols = {email_col, first_name_col, last_name_col}
    
    remapped_rows = []
    for row in rows:
        email = row.get(email_col, '').strip()
        if not email:
            continue  # Skip rows without email
        
        remapped_row = {
            'email': email,
            'first_name': clean_first_name(row.get(first_name_col, '').strip()) if first_name_col in actual_columns else '',
            'last_name': row.get(last_name_col, '').strip() if last_name_col in actual_columns else '',
        }
        # Extract domain from email if available
        if '@' in email:
            remapped_row['domain'] = email.split('@')[1]
        
        # Capture all extra columns (not in mapped_cols) into extra_data
        extra_data = {}
        for col, val in row.items():
            if col not in mapped_cols and val and str(val).strip():
                extra_data[col] = sanitize_text(val)
        remapped_row['extra_data'] = extra_data
        
        remapped_rows.append(remapped_row)
    
    if not remapped_rows:
        detail_msg = "No valid rows with email addresses found in CSV."
        if duplicate_headers:
            detail_msg += f" WARNING: Your CSV has duplicate column headers ({', '.join(duplicate_headers)}). This causes data to be read incorrectly. Please remove duplicate columns and re-upload."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail_msg
        )
    
    leads_count = len(remapped_rows)
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    user_plan = getattr(current_user, 'plan', 'trial') or 'trial'

    if not is_admin and not is_enrichment_free(user_plan):
        enrichment_cost = get_enrichment_cost(user_plan)
        required = float(leads_count * enrichment_cost)
        if float(current_user.credits) < required:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient credits. You have {float(current_user.credits):.1f} credits but this job requires {required:.1f} credits. Please top up your account."
            )

    job = Job(
        user_id=current_user.id,
        status="pending",
        job_type="verification",
        original_filename=file.filename,
        job_name=job_name.strip() if job_name else None,
        total_leads=len(remapped_rows),
        processed_leads=0,
        valid_emails_found=0,
        catchall_emails_found=0,
        cost_in_credits=0,
        plan_at_creation=user_plan,
        column_first_name=column_first_name,
        column_last_name=column_last_name,
        column_email=column_email,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Upload file to R2
    input_file_path = f"jobs/{job.id}/input/{file.filename}"
    try:
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=input_file_path,
            Body=contents
        )
        job.input_file_path = input_file_path
        db.commit()
    except Exception as e:
        print(f"R2 upload failed for verify-upload (small): {e}")
        db.delete(job)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error. Please try again later."
        )
    
    leads_to_create = []
    for row in remapped_rows:
        fn = row.get('first_name', '').title()
        ln = row.get('last_name', '').title()
        dom = row.get('domain', '')
        lead = Lead(
            job_id=job.id,
            user_id=current_user.id,
            first_name=fn,
            last_name=ln,
            domain=dom,
            email=row['email'],
            verification_status='pending',
            is_final_result=False,
            extra_data=row.get('extra_data', {}),
            enrichment_key=f"{fn.lower()}_{ln.lower()}_{dom.lower()}" if fn and ln and dom else None,
        )
        leads_to_create.append(lead)
    
    # Bulk insert leads
    db.bulk_save_objects(leads_to_create)
    db.commit()
    
    # Queue job for verification - route through waiting room if client at capacity
    try:
        job_id_str = str(job.id)
        queue_name = get_verification_queue_for_user(db, current_user.id)
        routed = route_job_to_queue_or_waiting_room(
            redis_client, db, current_user.id, job_id_str, queue_name
        )
        if routed:
            queue_length = redis_client.llen(queue_name)
            print(f"QUEUED verification job {job.id} to '{queue_name}' (queue length: {queue_length})")
        else:
            print(f"Verification job {job.id} placed in waiting room for user {current_user.id}")
    except Exception as e:
        print(f"Failed to queue verification job {job.id}: {e}")
        import traceback
        traceback.print_exc()
    
    return JobUploadResponse(
        job_id=job.id,
        message="File uploaded successfully. Verification started."
    )


class SingleVerifyRequest(BaseModel):
    email: str

class SingleVerifyResponse(BaseModel):
    email: str
    status: str
    reason: Optional[str] = None

@router.post("/verify-single", response_model=SingleVerifyResponse)
async def verify_single_email(
    request: SingleVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Verify a single email address using MailTester API.
    Authenticated endpoint - requires valid JWT token.
    """
    if not request.email or not request.email.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required"
        )
    
    email = request.email.strip()
    
    # Validate email format
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format"
        )
    
    mailtester = MailTesterClient()
    
    try:
        result = await mailtester.verify_email(email)
        
        return SingleVerifyResponse(
            email=email,
            status=result.get('status', 'unknown'),
            reason=result.get('reason') if result.get('reason') else None
        )
    
    except Exception as e:
        print(f"Error verifying email {email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error. Please try again later."
        )
    finally:
        await mailtester.close()


@router.get("", response_model=List[JobResponse])
def get_jobs(
    job_type: Optional[str] = Query(None, description="Filter by job type: 'enrichment' or 'verification'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(Job).filter(Job.user_id == current_user.id)
        
        # Filter by job_type if provided
        if job_type:
            query = query.filter(Job.job_type == job_type)
        
        # NO status filtering - return all jobs including 'waiting_for_csv'
        jobs = query.order_by(desc(Job.created_at)).all()
        
        # Log status breakdown for debugging
        status_counts = {}
        for job in jobs:
            status_counts[job.status] = status_counts.get(job.status, 0) + 1
        
        print(f"Found {len(jobs)} jobs for user {current_user.id} (filter: {job_type or 'all'})")
        print(f"Status breakdown: {status_counts}")
        
        # Verify waiting_for_csv jobs are included
        waiting_jobs = [j for j in jobs if j.status == "waiting_for_csv"]
        if waiting_jobs:
            print(f"Including {len(waiting_jobs)} job(s) with 'waiting_for_csv' status")
        
        return [JobResponse.model_validate(job) for job in jobs]
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error. Please try again later."
        )


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Only ben@superwave.io can view other clients' jobs
    if current_user.email == ADMIN_EMAIL:
        # Admin can view any job
        job = db.query(Job).filter(Job.id == job_uuid).first()
    else:
        # Regular users can only view their own jobs
        job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    return JobResponse.model_validate(job)


@router.get("/{job_id}/progress")
async def get_job_progress(
    job_id: str,
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Authenticate user via token
    if token:
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == user.id).first()
                    if not job:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Job not found"
                        )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required"
        )
    
    # Release the request-scoped DB connection before long-lived streaming begins.
    # generate_progress() opens its own short-lived sessions per poll iteration.
    db.close()

    async def generate_progress():
        while True:
            poll_db = SessionLocal()
            try:
                fresh_job = poll_db.query(Job).filter(Job.id == job_uuid).first()
                if not fresh_job:
                    break
                
                progress_data = JobProgressResponse(
                    job_id=fresh_job.id,
                    processed_leads=fresh_job.processed_leads,
                    total_leads=fresh_job.total_leads,
                    valid_emails_found=fresh_job.valid_emails_found,
                    catchall_emails_found=fresh_job.catchall_emails_found,
                    status=fresh_job.status,
                    progress_percentage=(fresh_job.processed_leads / fresh_job.total_leads * 100) if fresh_job.total_leads > 0 else 0
                )
                
                yield f"data: {progress_data.model_dump_json()}\n\n"
                
                if fresh_job.status in ['completed', 'failed']:
                    break
            finally:
                poll_db.close()
            
            await asyncio.sleep(2)
    
    return StreamingResponse(
        generate_progress(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/{job_id}/verify-catchalls")
async def verify_catchalls(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify catchall emails from a job using OmniVerifier API."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Get job and verify ownership
    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Get all catchall leads for this job that haven't been verified yet
    catchall_leads = db.query(Lead).filter(
        Lead.job_id == job_uuid,
        Lead.verification_status == "catchall",
        Lead.user_id == current_user.id
    ).filter(
        or_(
            Lead.verification_tag.is_(None),
            Lead.verification_tag.notin_(["catchall-verified", "valid-catchall"])
        )
    ).all()
    
    if not catchall_leads:
        return {
            "message": "No catchall leads found for this job",
            "verified_count": 0,
            "total_catchalls": 0
        }
    
    # Import OmniVerifier client
    from app.services.omniverifier_client import OmniVerifierClient
    
    # Initialize OmniVerifier client
    verifier = OmniVerifierClient()
    verified_count = 0
    errors = []
    list_id = None
    
    try:
        # Step 1: Create catchall list
        emails_list = [lead.email for lead in catchall_leads]
        title = f"Job {job_id} Catchall Verification"
        
        try:
            create_response = await verifier.create_catchall_list(
                emails_count=len(emails_list),
                title=title
            )
            # API returns {"id": 12346, ...} according to docs
            # Try both "id" and "listId" fields (some APIs use different field names)
            list_id = create_response.get("id") or create_response.get("listId")
            if not list_id:
                print(f"Create response keys: {create_response.keys()}")
                print(f"Full create response: {create_response}")
                raise Exception("Failed to get list ID from OmniVerifier response")
            # Keep as integer initially, convert to string when needed
            list_id_value = list_id
            list_id = str(list_id_value)
            print(f"Created catchall list with ID: {list_id} (original type: {type(list_id_value).__name__})")
            print(f"Full create response: {create_response}")
            
            # IMPORTANT: Add emails IMMEDIATELY after creating list
            # The status check showed list was already "processing" after 3s delay
            # This means the list auto-starts or times out if no emails are added quickly
            # Do NOT add any delay here!
        except HTTPException:
            raise
        except Exception as e:
            error_msg = str(e)
            print(f"Failed to create catchall list: {error_msg}")
            if "402" in error_msg or "Insufficient credits" in error_msg or "Payment Required" in error_msg:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient credits to verify {len(emails_list)} catchall emails. Please add credits and try again."
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error. Please try again later."
            )
        
        # Step 2: Add emails to list IMMEDIATELY (batch add)
        # Must happen before the list auto-starts processing
        try:
            print(f"Adding {len(emails_list)} emails to list {list_id} immediately...")
            await verifier.add_emails_to_list(list_id, emails_list)
            print(f"Successfully added emails to list {list_id}")
        except Exception as e:
            print(f"Failed to add emails to catchall list {list_id}: {e}")
            errors.append(f"Failed to add emails to list")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error. Please try again later."
            )
        
        # Step 3: Start list processing
        try:
            await verifier.start_list(list_id)
        except Exception as e:
            print(f"Failed to start catchall list {list_id}: {e}")
            errors.append(f"Failed to start verification")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error. Please try again later."
            )
        
        # Step 4: Poll for status until complete (max 5 minutes)
        max_wait_time = 300  # 5 minutes
        poll_interval = 30  # Poll every 30 seconds (as per guide recommendation)
        start_time = time.time()
        status_completed = False
        poll_status = ""  # Use different name to avoid shadowing imported 'status' module
        
        while True:
            elapsed_time = time.time() - start_time
            if elapsed_time > max_wait_time:
                errors.append("Timeout waiting for catchall verification to complete")
                break
            
            try:
                status_response = await verifier.get_list_status(list_id)
                poll_status = status_response.get("status", "").lower()
                progress = status_response.get("progress", 0)
                
                print(f"List {list_id} status: {poll_status}, Progress: {progress}%")
                
                # Check for exact "completed" status as per guide
                if poll_status == "completed":
                    status_completed = True
                    print("Processing complete!")
                    break
                elif poll_status == "failed":
                    errors.append("Catchall verification failed")
                    print("Processing failed.")
                    break
                elif poll_status in ["pending", "processing", "in_progress"]:
                    # Continue polling
                    await asyncio.sleep(poll_interval)
                else:
                    # Unknown status, continue polling
                    await asyncio.sleep(poll_interval)
            except Exception as e:
                errors.append(f"Error checking status: {str(e)}")
                await asyncio.sleep(poll_interval)
        
        if not status_completed:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error. Please try again later."
            )
        
        # Step 5: Get results
        try:
            results = await verifier.get_list_results(list_id)
        except Exception as e:
            print(f"Failed to get catchall results for list {list_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error. Please try again later."
            )
        
        # Step 6: Parse results and update leads
        # Create a mapping of email to result for quick lookup
        email_to_result = {}
        for result in results:
            # API returns "email_nominal" field according to OmniVerifier docs
            email = result.get("email_nominal", result.get("email", "")).lower()
            if email:
                email_to_result[email] = result
        
        # Update leads based on results
        for lead in catchall_leads:
            email_lower = lead.email.lower()
            result = email_to_result.get(email_lower)
            
            if result:
                # OmniVerifier returns: status="good"|"risky"|"bad", is_catchall=bool
                # "good" = valid email (deliverable, not catchall)
                # "risky" = potentially catchall but might be deliverable
                # "bad" = catchall or invalid
                result_status = result.get("status", "").lower()
                is_catchall = result.get("is_catchall", False)
                
                # Consider "good" status as valid (deliverable email)
                # Even if is_catchall is true, if status is "good", it's deliverable
                is_valid = result_status == "good"
                
                if is_valid:
                    # Update lead: status to valid, add appropriate tag based on job type
                    lead.verification_status = "valid"
                    # Use "valid-catchall" for verification jobs, "catchall-verified" for enrichment jobs
                    if job.job_type == "verification":
                        lead.verification_tag = "valid-catchall"
                    else:
                        lead.verification_tag = "catchall-verified"
                    verified_count += 1
        
        # Commit all updates
        db.commit()
        
        # Update job counts if needed
        if verified_count > 0:
            # Recalculate valid and catchall counts
            valid_count = db.query(Lead).filter(
                Lead.job_id == job_uuid,
                Lead.verification_status == "valid"
            ).count()
            catchall_count = db.query(Lead).filter(
                Lead.job_id == job_uuid,
                Lead.verification_status == "catchall"
            ).count()
            
            job.valid_emails_found = valid_count
            job.catchall_emails_found = catchall_count
            db.commit()
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error during catchall verification for job {job_id}: {e}")
        errors.append("Unexpected error during verification")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error. Please try again later."
        )
    finally:
        await verifier.close()
    
    return {
        "message": f"Verified {verified_count} catchall emails",
        "verified_count": verified_count,
        "total_catchalls": len(catchall_leads),
        "errors": errors if errors else None
    }


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # IMMEDIATELY notify workers via Redis before deleting from DB
    # This allows workers to stop processing this job ASAP
    try:
        cancel_key = f"job:cancelled:{job_id}"
        redis_client.set(cancel_key, "true", ex=3600)
        
        # Clean up fair-share registry
        redis_client.hdel("fairshare:active_jobs", str(job_id))
        redis_client.delete(f"fairshare:heartbeat:{job_id}")
        redis_client.delete(f"fairshare:throughput:{job_id}")
        
        # Remove from waiting room if applicable
        waiting_key = f"fairshare:waiting:{job.user_id}"
        redis_client.lrem(waiting_key, 0, str(job_id))
    except Exception as e:
        print(f"Warning: Could not notify workers via Redis: {e}")
    
    db.execute(update(Lead).where(Lead.job_id == job_uuid).values(job_id=None))
    db.delete(job)
    db.commit()
    
    from fastapi.responses import Response
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{job_id}/cancel", status_code=status.HTTP_200_OK)
def cancel_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a pending or processing job."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Verify job belongs to user
    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    if job.status not in ['pending', 'processing', 'queued', 'waiting']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job with status: {job.status}"
        )
    
    # IMMEDIATELY notify workers via Redis BEFORE updating DB
    # This allows workers to stop processing this job ASAP
    try:
        cancel_key = f"job:cancelled:{job_id}"
        redis_client.set(cancel_key, "true", ex=3600)
        
        # Clean up fair-share registry (verification/enrichment pool)
        redis_client.hdel("fairshare:active_jobs", str(job_id))
        redis_client.delete(f"fairshare:heartbeat:{job_id}")
        redis_client.delete(f"fairshare:throughput:{job_id}")
        
        # Remove from verification/enrichment waiting room if applicable
        waiting_key = f"fairshare:waiting:{job.user_id}"
        redis_client.lrem(waiting_key, 0, str(job_id))

        # Clean up catchall pool (separate from verification/enrichment)
        redis_client.hdel("catchall:active_jobs", str(job_id))
        redis_client.delete(f"catchall:heartbeat:{job_id}")
        catchall_waiting_key = f"catchall:waiting:{job.user_id}"
        redis_client.lrem(catchall_waiting_key, 0, str(job_id))
        redis_client.lrem(DEFAULT_CATCHALL_QUEUE, 0, str(job_id))
    except Exception as e:
        print(f"Warning: Could not notify workers via Redis: {e}")
    
    # Update job status to cancelled
    job.status = 'cancelled'
    db.commit()
    
    return {"message": "Job cancelled successfully", "job_id": str(job.id)}


@router.get("/debug/queue-status")
def debug_queue_status(
    current_user: User = Depends(get_current_user),
):
    """Debug endpoint to check queue status"""
    try:
        # Check waiting jobs
        waiting_count = redis_client.llen("bull:email-verification:wait")
        waiting_jobs = redis_client.lrange("bull:email-verification:wait", 0, -1)
        
        # Check active jobs
        active_count = redis_client.llen("bull:email-verification:active")
        
        # Check Redis connection
        redis_client.ping()
        
        return {
            "redis_connected": True,
            "waiting_jobs_count": waiting_count,
            "waiting_job_ids": [job_id.decode() if isinstance(job_id, bytes) else job_id for job_id in waiting_jobs],
            "active_jobs_count": active_count,
            "queue_name": "email-verification",
        }
    except Exception as e:
        print(f"Debug queue-status Redis error: {e}")
        return {
            "redis_connected": False,
            "error": "Error. Please try again later.",
        }


# ============================================
# CATCHALL VERIFICATION (STANDALONE)
# ============================================

MAX_CATCHALL_ROWS = 10000


@router.post("/catchall-upload", response_model=JobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_catchall_file(
    file: UploadFile = File(...),
    column_email: Optional[str] = Form(None),
    job_name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload CSV of catchall emails for standalone verification via OmniVerifier."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    contents = await file.read()
    csv_content = contents.decode("utf-8-sig")
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(csv_reader)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    email_col = column_email or "email"
    actual_columns = list(rows[0].keys())
    if email_col not in actual_columns:
        raise HTTPException(status_code=400, detail=f"Missing required column: '{email_col}'")

    parsed_rows = []
    for row in rows:
        e = row.get(email_col, "").strip()
        if not e or "@" not in e:
            continue
        extra_data = {}
        for col, val in row.items():
            if col != email_col and val and str(val).strip():
                extra_data[col] = sanitize_text(val)
        parsed_rows.append({"email": e, "extra_data": extra_data})

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="No valid email addresses found in CSV")

    if len(parsed_rows) > MAX_CATCHALL_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_CATCHALL_ROWS} emails per catchall job. Your file has {len(parsed_rows)}.",
        )

    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, "is_admin", False)
    user_plan = getattr(current_user, 'plan', 'trial') or 'trial'
    enrichment_cost = get_enrichment_cost(user_plan)
    total_cost_decimal = len(parsed_rows) * enrichment_cost
    total_cost = float(total_cost_decimal)

    if not is_admin and total_cost > 0 and float(current_user.credits) < total_cost:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credits. You have {float(current_user.credits):.1f} credits but this job requires {total_cost:.1f} credits.",
        )

    job = Job(
        user_id=current_user.id,
        status="queued",
        job_type="catchall_verification",
        original_filename=file.filename,
        job_name=job_name.strip() if job_name else None,
        total_leads=len(parsed_rows),
        processed_leads=0,
        valid_emails_found=0,
        catchall_emails_found=0,
        cost_in_credits=total_cost,
        plan_at_creation=user_plan,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Upload to R2
    input_file_path = f"jobs/{job.id}/input/{file.filename}"
    try:
        s3_client.put_object(Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME, Key=input_file_path, Body=contents)
        job.input_file_path = input_file_path
        db.commit()
    except Exception as e:
        print(f"R2 upload failed for catchall-upload: {e}")
        db.delete(job)
        db.commit()
        raise HTTPException(status_code=500, detail="Error. Please try again later.")

    # Create Lead records, preserving all extra CSV columns
    leads_to_create = []
    for pr in parsed_rows:
        email = pr["email"]
        extra = pr["extra_data"]
        fn = (extra.pop("first_name", "") or extra.pop("First Name", "")).title()
        ln = (extra.pop("last_name", "") or extra.pop("Last Name", "")).title()
        dom = email.split("@")[1] if "@" in email else ""
        leads_to_create.append(
            Lead(
                job_id=job.id,
                user_id=current_user.id,
                email=email,
                first_name=fn,
                last_name=ln,
                domain=dom,
                verification_status="pending",
                is_final_result=False,
                extra_data=extra,
                enrichment_key=f"{fn.lower()}_{ln.lower()}_{dom.lower()}" if fn and ln and dom else None,
            )
        )
    db.bulk_save_objects(leads_to_create)
    db.commit()

    if not is_admin and total_cost > 0:
        current_user.credits -= total_cost_decimal
        db.commit()

    # Route to catchall Redis queue (separate from verification/enrichment)
    job_id_str = str(job.id)
    routed_to_queue = route_catchall_to_queue_or_waiting_room(
        redis_client, db, current_user.id, job_id_str
    )

    if routed_to_queue:
        queue_length = redis_client.llen(DEFAULT_CATCHALL_QUEUE)
        print(f"Catchall job {job_id_str} queued (queue length: {queue_length})")
    else:
        print(f"Catchall job {job_id_str} placed in waiting room (client at capacity)")

    status_label = "queued" if routed_to_queue else "waiting"
    return JobUploadResponse(
        job_id=job.id,
        message=f"Catchall verification {status_label} for {len(parsed_rows)} emails.",
    )



# _run_catchall_verification and _send_catchall_completion_email have been
# moved to workers/catchall_worker.py which processes jobs from the
# catchall-verification-queue Redis queue.


