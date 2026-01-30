#!/usr/bin/env python3
"""
Website Contact Scraper Worker

Background worker that processes website scraper jobs:
- Listens to Redis queue "website-scraper-queue" for new jobs
- Downloads CSV from R2
- Crawls each website using Crawl4AI
- Extracts emails and phone numbers using regex
- Generates output CSV with contact data
"""

import io
import csv
import os
import sys
import time
import re
import logging
import asyncio
import json
from typing import Optional, List, Dict, Tuple
from uuid import UUID
from decimal import Decimal

import redis
import boto3
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.models.website_scraper_job import WebsiteScraperJob

# Configure logging - ensure unbuffered output for Railway
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True  # Override any existing configuration
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
WEBSITE_SCRAPER_QUEUE = "website-scraper-queue"

# Batch size for crawling
BATCH_SIZE = 100

# Crawl4AI timeout per URL (seconds)
CRAWL_TIMEOUT = 30


# ============================================
# CONTACT EXTRACTION FUNCTIONS
# ============================================

# Patterns to exclude for emails (junk emails)
EMAIL_EXCLUDE_PATTERNS = [
    re.compile(r'^noreply@', re.IGNORECASE),
    re.compile(r'^no-reply@', re.IGNORECASE),
    re.compile(r'^no_reply@', re.IGNORECASE),
    re.compile(r'^donotreply@', re.IGNORECASE),
    re.compile(r'^do-not-reply@', re.IGNORECASE),
    re.compile(r'^filler@', re.IGNORECASE),
    re.compile(r'^test@', re.IGNORECASE),
    re.compile(r'^example@', re.IGNORECASE),
    re.compile(r'^admin@', re.IGNORECASE),
    re.compile(r'^webmaster@', re.IGNORECASE),
    re.compile(r'^postmaster@', re.IGNORECASE),
    re.compile(r'^mailer-daemon@', re.IGNORECASE),
    re.compile(r'@\d+x\.', re.IGNORECASE),  # Image files like icon@2x.png
    re.compile(r'\.(png|jpg|jpeg|gif|svg|webp|ico)$', re.IGNORECASE),  # Image extensions
    re.compile(r'@sentry\.io', re.IGNORECASE),
    re.compile(r'@wixpress\.com', re.IGNORECASE),
    re.compile(r'@w3\.org', re.IGNORECASE),
]

# Email regex - standard email pattern
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', re.IGNORECASE)

# Mailto link regex - higher priority
MAILTO_REGEX = re.compile(r'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', re.IGNORECASE)

# Phone regex patterns
# US/Canada format: (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1xxxxxxxxxx
PHONE_REGEX = re.compile(
    r'(?:\+\d{1,3}[-.\s]?)?'  # Optional country code
    r'\(?\d{3}\)?'  # Area code (with or without parens)
    r'[-.\s]?'  # Separator
    r'\d{3}'  # Exchange
    r'[-.\s]?'  # Separator
    r'\d{4}'  # Subscriber
    r'(?:\s*(?:ext|x|extension)\.?\s*\d+)?',  # Optional extension
    re.IGNORECASE
)

# Tel link regex - higher priority
TEL_REGEX = re.compile(r'tel:([+\d\s().-]+)', re.IGNORECASE)


def is_junk_email(email: str) -> bool:
    """Check if email matches any junk patterns."""
    for pattern in EMAIL_EXCLUDE_PATTERNS:
        if pattern.search(email):
            return True
    return False


def clean_phone(phone: str) -> str:
    """Clean and normalize phone number."""
    # Remove common prefixes from tel: links
    phone = phone.strip()
    # Remove spaces and format consistently
    digits_only = re.sub(r'[^\d+]', '', phone)
    if len(digits_only) < 7:  # Too short to be valid
        return ''
    return phone


def extract_contacts(markdown: str) -> Dict[str, str]:
    """
    Extract emails and phone numbers from markdown content.
    
    Priority:
    1. mailto: links (highest priority for emails)
    2. tel: links (highest priority for phones)
    3. Plain text emails/phones
    
    Returns max 2 emails and 2 phones.
    """
    if not markdown:
        return {
            'email_1': '',
            'email_2': '',
            'phone_1': '',
            'phone_2': '',
        }
    
    # === EMAIL EXTRACTION ===
    
    # 1. Extract from mailto: links (highest priority)
    mailto_matches = MAILTO_REGEX.findall(markdown)
    
    # 2. Extract plain text emails
    text_emails = EMAIL_REGEX.findall(markdown)
    
    # 3. Combine, deduplicate, and filter
    all_emails = []
    seen_emails = set()
    
    # Add mailto emails first (higher priority)
    for email in mailto_matches:
        email_lower = email.lower()
        if email_lower not in seen_emails and not is_junk_email(email):
            all_emails.append(email)
            seen_emails.add(email_lower)
    
    # Then add plain text emails
    for email in text_emails:
        email_lower = email.lower()
        if email_lower not in seen_emails and not is_junk_email(email):
            all_emails.append(email)
            seen_emails.add(email_lower)
    
    # === PHONE EXTRACTION ===
    
    # 1. Extract from tel: links (highest priority)
    tel_matches = TEL_REGEX.findall(markdown)
    tel_phones = [clean_phone(p) for p in tel_matches if clean_phone(p)]
    
    # 2. Extract plain text phones
    text_phones = PHONE_REGEX.findall(markdown)
    text_phones = [clean_phone(p) for p in text_phones if clean_phone(p)]
    
    # 3. Combine and deduplicate
    all_phones = []
    seen_phones = set()
    
    # Add tel phones first (higher priority)
    for phone in tel_phones:
        # Normalize for deduplication (digits only)
        phone_digits = re.sub(r'[^\d]', '', phone)
        if phone_digits not in seen_phones:
            all_phones.append(phone)
            seen_phones.add(phone_digits)
    
    # Then add plain text phones
    for phone in text_phones:
        phone_digits = re.sub(r'[^\d]', '', phone)
        if phone_digits not in seen_phones:
            all_phones.append(phone)
            seen_phones.add(phone_digits)
    
    # Return max 2 of each
    return {
        'email_1': all_emails[0] if len(all_emails) > 0 else '',
        'email_2': all_emails[1] if len(all_emails) > 1 else '',
        'phone_1': all_phones[0] if len(all_phones) > 0 else '',
        'phone_2': all_phones[1] if len(all_phones) > 1 else '',
    }


# ============================================
# CRAWL4AI INTEGRATION
# ============================================

async def crawl_url(url: str) -> Tuple[bool, str, Optional[str]]:
    """
    Crawl a single URL using Crawl4AI service.
    
    Returns:
        Tuple of (success, markdown_content, error_message)
    """
    if not settings.CRAWL4AI_URL:
        return False, '', 'CRAWL4AI_URL not configured'
    
    # Clean and validate URL
    original_url = url
    url = url.strip()
    
    # Check for empty or invalid URLs
    if not url or len(url) == 0:
        logger.error(f"🔍 DEBUG: Empty URL received, cannot crawl")
        return False, '', 'Empty URL'
    
    # Remove any newlines, carriage returns, or tabs
    url = url.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
    
    # Ensure URL has protocol
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    # Validate URL format (basic check)
    if ' ' in url or '\n' in url or '\r' in url:
        logger.error(f"🔍 DEBUG: URL contains invalid characters (spaces/newlines): '{url[:100]}'")
        return False, '', 'Invalid URL format'
    
        # #region agent log
        log_data = {
            "location": "website_scraper_worker.py:236",
            "message": "About to call crawl4ai",
            "data": {
                "original_url": original_url,
                "final_url": url,
                "crawl4ai_url": settings.CRAWL4AI_URL
            },
            "timestamp": int(time.time() * 1000),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "D"
        }
        try:
            with open("/Users/kylebezuidenhout/Downloads/Cold-Email-SaaS/.cursor/debug.log", "a") as f:
                f.write(json.dumps(log_data) + "\n")
        except Exception as e:
            logger.error(f"🔍 DEBUG: Failed to write log file: {e}")
        # #endregion
    
    try:
        # Final validation before sending
        if not url or url is None:
            logger.error(f"🔍 DEBUG: URL is None or empty before sending to crawl4ai")
            return False, '', 'URL is None or empty'
        
        # Log request details using existing logger (will definitely execute)
        logger.info(f"🔍 DEBUG: About to call crawl4ai with URL: '{url}' (original: '{original_url}')")
        logger.info(f"🔍 DEBUG: URL type: {type(url)}, length: {len(url)}, repr: {repr(url)}")
        
        # Ensure we're sending a valid string, not None
        request_payload = {"url": str(url) if url else ""}
        logger.info(f"🔍 DEBUG: Request payload: {json.dumps(request_payload)}")
        
        async with httpx.AsyncClient(timeout=CRAWL_TIMEOUT) as client:
            response = await client.post(
                f"{settings.CRAWL4AI_URL}/crawl",
                json=request_payload
            )
            
            # Log response details
            logger.info(f"🔍 DEBUG: crawl4ai response - status: {response.status_code}, url_sent: '{url}'")
            
            # #region agent log
            try:
                response_text = response.text[:500]  # Truncate response
                log_data = {
                    "location": "website_scraper_worker.py:268",
                    "message": "crawl4ai response received",
                    "data": {
                        "status_code": response.status_code,
                        "url_sent": url,
                        "original_url": original_url,
                        "response_preview": response_text,
                        "headers": dict(response.headers)
                    },
                    "timestamp": int(time.time() * 1000),
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "E"
                }
                with open("/Users/kylebezuidenhout/Downloads/Cold-Email-SaaS/.cursor/debug.log", "a") as f:
                    f.write(json.dumps(log_data) + "\n")
            except Exception as e:
                logger.error(f"🔍 DEBUG: Failed to write log: {e}")
            # #endregion
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    markdown = data.get('markdown', '')
                    return True, markdown, None
                else:
                    error_msg = data.get('error_message', 'Crawl failed')
                    logger.error(f"🔍 DEBUG: crawl4ai returned success=false: {error_msg}")
                    return False, '', error_msg
            else:
                # Log detailed error for 422 or any non-200 status
                try:
                    error_detail = response.text[:2000] if hasattr(response, 'text') else 'No response text'
                    logger.error(f"🔍 DEBUG: ========== CRAWL4AI ERROR DETAILS ==========")
                    logger.error(f"🔍 DEBUG: Status code: {response.status_code}")
                    logger.error(f"🔍 DEBUG: URL sent to crawl4ai: '{url}'")
                    logger.error(f"🔍 DEBUG: Original URL from CSV: '{original_url}'")
                    logger.error(f"🔍 DEBUG: URL length: {len(url)}, Original length: {len(original_url)}")
                    logger.error(f"🔍 DEBUG: URL repr (shows hidden chars): {repr(url)}")
                    logger.error(f"🔍 DEBUG: Response content-type: {response.headers.get('content-type', 'unknown')}")
                    
                    # Try to parse as JSON first
                    try:
                        error_json = response.json()
                        logger.error(f"🔍 DEBUG: Response JSON: {json.dumps(error_json, indent=2)}")
                    except:
                        logger.error(f"🔍 DEBUG: Response text (not JSON): {error_detail}")
                    
                    logger.error(f"🔍 DEBUG: ===========================================")
                except Exception as e:
                    logger.error(f"🔍 DEBUG: Failed to parse error response: {e}")
                    import traceback
                    logger.error(f"🔍 DEBUG: Traceback: {traceback.format_exc()}")
                return False, '', f'HTTP {response.status_code}'
                
    except httpx.TimeoutException:
        return False, '', 'Timeout'
    except Exception as e:
        return False, '', str(e)


async def crawl_batch(urls: List[str]) -> List[Dict]:
    """
    Crawl a batch of URLs concurrently.
    
    Returns list of dicts with url, success, markdown, error keys.
    """
    tasks = [crawl_url(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    batch_results = []
    for i, url in enumerate(urls):
        result = results[i]
        if isinstance(result, Exception):
            batch_results.append({
                'url': url,
                'success': False,
                'markdown': '',
                'error': str(result)
            })
        else:
            success, markdown, error = result
            batch_results.append({
                'url': url,
                'success': success,
                'markdown': markdown,
                'error': error
            })
    
    return batch_results


# ============================================
# JOB PROCESSING
# ============================================

def is_job_cancelled(job_id: str) -> bool:
    """Check if job has been cancelled."""
    try:
        cancel_key = f"website-scraper:cancelled:{job_id}"
        return redis_client.get(cancel_key) == "true"
    except:
        return False


async def process_job(job_id: str, website_col: str) -> bool:
    """
    Process a single website scraper job:
    1. Fetch job from database
    2. Download CSV from R2
    3. Crawl websites and extract contacts
    4. Generate output CSV
    5. Upload to R2 and update job
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
        job = db.query(WebsiteScraperJob).filter(WebsiteScraperJob.id == job_uuid).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return False
        
        # Check if job is in correct state
        if job.status not in ['pending']:
            logger.warning(f"Job {job_id} has status '{job.status}', skipping")
            return False
        
        # Check if cancelled
        if is_job_cancelled(job_id):
            logger.info(f"Job {job_id} was cancelled, skipping")
            job.status = "cancelled"
            db.commit()
            return False
        
        logger.info(f"🔄 Processing website scraper job {job_id}")
        
        # Update status to processing
        job.status = "processing"
        db.commit()
        
        # Download CSV from R2
        if not job.input_file_path:
            logger.error(f"Job {job_id} has no input file path")
            job.status = "failed"
            job.error_message = "No input file"
            db.commit()
            return False
        
        try:
            response = s3_client.get_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=job.input_file_path
            )
            csv_data = response['Body'].read()
            logger.info(f"✅ Downloaded CSV from R2: {len(csv_data)} bytes")
        except Exception as e:
            logger.error(f"❌ Failed to download CSV from R2: {e}")
            job.status = "failed"
            job.error_message = f"Failed to download input file: {str(e)}"
            db.commit()
            return False
        
        # Parse CSV
        csv_content = csv_data.decode('utf-8-sig')
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(csv_reader)
        
        if not rows:
            logger.error(f"CSV is empty for job {job_id}")
            job.status = "failed"
            job.error_message = "CSV file is empty"
            db.commit()
            return False
        
        # Get column headers
        original_columns = list(rows[0].keys())
        
        # Verify website column exists
        if website_col not in original_columns:
            logger.error(f"Website column '{website_col}' not found in CSV")
            job.status = "failed"
            job.error_message = f"Website column '{website_col}' not found"
            db.commit()
            return False
        
        # #region agent log
        sample_urls = [row.get(website_col, '').strip()[:50] for row in rows[:5]]  # First 5 URLs, truncated
        log_data = {
            "location": "website_scraper_worker.py:385",
            "message": "Worker extracted URLs from CSV",
            "data": {
                "website_col": website_col,
                "total_rows": len(rows),
                "sample_urls": sample_urls,
                "original_columns": original_columns
            },
            "timestamp": int(time.time() * 1000),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "C"
        }
        try:
            with open("/Users/kylebezuidenhout/Downloads/Cold-Email-SaaS/.cursor/debug.log", "a") as f:
                f.write(json.dumps(log_data) + "\n")
        except Exception as e:
            logger.error(f"🔍 DEBUG: Failed to write log file: {e}")
        # #endregion
        
        logger.info(f"📊 Processing {len(rows)} rows with website column '{website_col}'")
        logger.info(f"🔍 DEBUG: Sample URLs from column '{website_col}': {sample_urls}")
        
        # Process rows in batches
        output_rows = []
        total_processed = 0
        total_with_contacts = 0
        
        # Create batches
        batches = []
        current_batch = []
        current_batch_indices = []
        
        for i, row in enumerate(rows):
            website = row.get(website_col, '').strip()
            # Clean URL: remove whitespace, newlines, and invalid characters
            website = website.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
            if website:
                # Log problematic URLs for debugging
                if not website or len(website) == 0 or website.isspace():
                    logger.warning(f"🔍 DEBUG: Row {i} has empty/whitespace-only website in column '{website_col}'")
                    continue
                if any(char in website for char in ['\n', '\r', '\t']):
                    logger.warning(f"🔍 DEBUG: Row {i} website contains newlines/tabs: '{website[:50]}'")
                current_batch.append(website)
                current_batch_indices.append(i)
            
            if len(current_batch) >= BATCH_SIZE:
                batches.append((current_batch, current_batch_indices))
                current_batch = []
                current_batch_indices = []
        
        # Don't forget the last batch
        if current_batch:
            batches.append((current_batch, current_batch_indices))
        
        # Initialize output with original data
        for row in rows:
            output_row = dict(row)
            output_row['email_1'] = ''
            output_row['email_2'] = ''
            output_row['phone_1'] = ''
            output_row['phone_2'] = ''
            output_row['extraction_status'] = 'not_found'  # Default
            output_rows.append(output_row)
        
        # Mark rows without website
        for i, row in enumerate(rows):
            website = row.get(website_col, '').strip()
            if not website:
                output_rows[i]['extraction_status'] = 'no_website'
        
        # Process each batch
        for batch_num, (batch_urls, batch_indices) in enumerate(batches):
            # Check if cancelled
            if is_job_cancelled(job_id):
                logger.info(f"Job {job_id} was cancelled during processing")
                job.status = "cancelled"
                db.commit()
                return False
            
            logger.info(f"🌐 Crawling batch {batch_num + 1}/{len(batches)} ({len(batch_urls)} URLs)")
            
            # Crawl batch
            try:
                crawl_results = await crawl_batch(batch_urls)
            except Exception as e:
                logger.error(f"❌ Batch {batch_num + 1} crawl failed: {e}")
                # Mark all in batch as error
                for idx in batch_indices:
                    output_rows[idx]['extraction_status'] = 'error'
                continue
            
            # Process results
            for j, (url, idx) in enumerate(zip(batch_urls, batch_indices)):
                crawl_result = crawl_results[j]
                
                if crawl_result['success'] and crawl_result['markdown']:
                    # Extract contacts
                    contacts = extract_contacts(crawl_result['markdown'])
                    
                    output_rows[idx]['email_1'] = contacts['email_1']
                    output_rows[idx]['email_2'] = contacts['email_2']
                    output_rows[idx]['phone_1'] = contacts['phone_1']
                    output_rows[idx]['phone_2'] = contacts['phone_2']
                    
                    # Determine status
                    has_contacts = bool(contacts['email_1'] or contacts['email_2'] or 
                                       contacts['phone_1'] or contacts['phone_2'])
                    if has_contacts:
                        output_rows[idx]['extraction_status'] = 'success'
                        total_with_contacts += 1
                    else:
                        output_rows[idx]['extraction_status'] = 'not_found'
                else:
                    output_rows[idx]['extraction_status'] = 'error'
                
                total_processed += 1
            
            # Update progress
            progress = int((total_processed / job.total_leads) * 100) if job.total_leads > 0 else 0
            hit_rate = (total_with_contacts / total_processed * 100) if total_processed > 0 else 0
            
            job.completed_leads = total_processed
            job.progress_percentage = progress
            job.hit_rate_percentage = Decimal(str(round(hit_rate, 2)))
            db.commit()
            
            logger.info(f"📊 Progress: {progress}% ({total_processed}/{job.total_leads}), Hit rate: {hit_rate:.1f}%")
        
        # Generate output CSV
        output_columns = original_columns + ['email_1', 'email_2', 'phone_1', 'phone_2', 'extraction_status']
        
        csv_buffer = io.StringIO()
        writer = csv.DictWriter(csv_buffer, fieldnames=output_columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(output_rows)
        
        csv_bytes = csv_buffer.getvalue().encode('utf-8')
        
        # Upload output to R2
        output_file_path = f"website-scraper-jobs/{job_id}/output/results_with_contacts.csv"
        try:
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=output_file_path,
                Body=csv_bytes,
                ContentType="text/csv"
            )
            logger.info(f"✅ Uploaded output CSV to R2: {output_file_path}")
        except Exception as e:
            logger.error(f"❌ Failed to upload output CSV: {e}")
            job.status = "failed"
            job.error_message = f"Failed to upload results: {str(e)}"
            db.commit()
            return False
        
        # Update job as completed
        from datetime import datetime
        job.status = "completed"
        job.output_file_path = output_file_path
        job.completed_leads = total_processed
        job.progress_percentage = 100
        hit_rate = (total_with_contacts / total_processed * 100) if total_processed > 0 else 0
        job.hit_rate_percentage = Decimal(str(round(hit_rate, 2)))
        job.completed_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"✅ Job {job_id} completed! Processed {total_processed} URLs, {total_with_contacts} with contacts ({hit_rate:.1f}% hit rate)")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error processing job {job_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
            job = db.query(WebsiteScraperJob).filter(WebsiteScraperJob.id == UUID(job_id)).first()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                db.commit()
        except:
            pass
        return False
    finally:
        db.close()


def main():
    """Main worker loop - polls queue and processes jobs."""
    logger.info(f"🚀 Website Scraper worker starting...")
    logger.info(f"📋 Listening to queue: {WEBSITE_SCRAPER_QUEUE}")
    logger.info(f"🌐 Crawl4AI URL: {settings.CRAWL4AI_URL or 'NOT CONFIGURED'}")
    
    while True:
        try:
            # Poll queue (blocking pop with timeout)
            job_data = redis_client.brpop(WEBSITE_SCRAPER_QUEUE, timeout=5)
            
            if job_data:
                # brpop returns tuple: (queue_name, job_data)
                job_data = job_data[1]
                
                # Parse job_id and website_col from queue data
                if '|' in job_data:
                    job_id, website_col = job_data.split('|', 1)
                else:
                    job_id = job_data
                    website_col = 'website'  # Default
                
                # #region agent log
                log_data = {
                    "location": "website_scraper_worker.py:570",
                    "message": "Worker received job from queue",
                    "data": {
                        "job_id": job_id,
                        "website_col": website_col,
                        "raw_queue_data": job_data
                    },
                    "timestamp": int(time.time() * 1000),
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "B"
                }
                try:
                    with open("/Users/kylebezuidenhout/Downloads/Cold-Email-SaaS/.cursor/debug.log", "a") as f:
                        f.write(json.dumps(log_data) + "\n")
                except Exception as e:
                    logger.error(f"🔍 DEBUG: Failed to write log file: {e}")
                # #endregion
                
                logger.info(f"📥 Received job {job_id} from queue (website_col: {website_col})")
                logger.info(f"🔍 DEBUG: Queue data parsed - job_id: '{job_id}', website_col: '{website_col}', raw: '{job_data}'")
                
                # Process job (run async)
                success = asyncio.run(process_job(job_id, website_col))
                
                if success:
                    logger.info(f"✅ Successfully processed job {job_id}")
                else:
                    logger.error(f"❌ Failed to process job {job_id}")
            
            # Small sleep to prevent tight loop
            time.sleep(0.1)
            
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down website scraper worker...")
            break
        except Exception as e:
            logger.error(f"❌ Error in worker loop: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(1)  # Wait before retrying


if __name__ == "__main__":
    main()
