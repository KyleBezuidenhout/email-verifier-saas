#!/usr/bin/env python3
"""
Website Contact Scraper Worker

Background worker that processes website scraper jobs:
- Listens to Redis queue "website-scraper-queue" for new jobs
- Downloads CSV from R2
- Scrapes websites using ZenRows API with tiered escalation
- Extracts emails and phone numbers
- Generates output CSV with contact data

ZenRows Tier Strategy:
- Tier 1: Basic (1 credit) - No JS, no proxy
- Tier 2: JS Render (5 credits) - JavaScript rendering
- Tier 3: Premium Proxy (10 credits) - JS + residential proxy  
- Tier 4: Residential US (25 credits) - JS + proxy + US geo

Features:
- Domain intelligence caching (remembers which tier works)
- Contact page fallback (/contact, /about if homepage has 0 contacts)
- Automatic escalation on blocked/JS-required responses
"""

import io
import csv
import os
import sys
import time
import re
import logging
import asyncio
from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass
from urllib.parse import urlparse
from uuid import UUID
from decimal import Decimal
from datetime import datetime

import redis
import boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.models.website_scraper_job import WebsiteScraperJob

# Import ZenRows client
from zenrows_client import ZenRowsClient, ExtractedContacts, check_zenrows_health

# Configure logging - ensure unbuffered output for Railway
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True
)
logger = logging.getLogger(__name__)

# ============================================
# CONNECTIONS
# ============================================

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


# ============================================
# PERFORMANCE TRACKING
# ============================================

@dataclass
class CrawlStats:
    """Track detailed crawl and extraction metrics for performance analysis."""
    total_urls: int = 0
    urls_scraped: int = 0           # Successfully scraped (got HTML)
    urls_with_contacts: int = 0     # Found at least one email or phone
    urls_failed: int = 0            # Scraping failed (all tiers exhausted)
    urls_skipped_no_website: int = 0
    urls_skipped_social_media: int = 0
    urls_duplicate: int = 0
    emails_extracted: int = 0
    phones_extracted: int = 0
    total_credits_spent: int = 0
    fallbacks_tried: int = 0
    fallbacks_successful: int = 0
    
    # Tier usage tracking
    tier_1_success: int = 0
    tier_2_success: int = 0
    tier_3_success: int = 0
    tier_4_success: int = 0
    
    def log_summary(self, job_id: str):
        """Log comprehensive performance summary."""
        total_attempted = self.urls_scraped + self.urls_failed
        contact_rate = (self.urls_with_contacts / total_attempted * 100) if total_attempted > 0 else 0
        avg_credits = (self.total_credits_spent / total_attempted) if total_attempted > 0 else 0
        
        logger.info("=" * 60)
        logger.info(f"JOB PERFORMANCE SUMMARY - {job_id}")
        logger.info("=" * 60)
        logger.info(f"Total URLs in CSV: {self.total_urls}")
        logger.info(f"  - Skipped (no website): {self.urls_skipped_no_website}")
        logger.info(f"  - Skipped (social media): {self.urls_skipped_social_media}")
        logger.info(f"  - Skipped (duplicate): {self.urls_duplicate}")
        logger.info(f"Scraping Results ({total_attempted} URLs attempted):")
        logger.info(f"  - Successful scrapes: {self.urls_scraped}")
        logger.info(f"  - Failed (all tiers): {self.urls_failed}")
        logger.info(f"Contact Extraction:")
        logger.info(f"  - URLs with contacts: {self.urls_with_contacts} ({contact_rate:.1f}% hit rate)")
        logger.info(f"  - Emails found: {self.emails_extracted}")
        logger.info(f"  - Phones found: {self.phones_extracted}")
        logger.info(f"Tier Usage:")
        logger.info(f"  - Tier 1 (Basic): {self.tier_1_success}")
        logger.info(f"  - Tier 2 (JS): {self.tier_2_success}")
        logger.info(f"  - Tier 3 (Premium): {self.tier_3_success}")
        logger.info(f"  - Tier 4 (Residential): {self.tier_4_success}")
        logger.info(f"Contact Fallback:")
        logger.info(f"  - Fallbacks tried: {self.fallbacks_tried}")
        logger.info(f"  - Fallbacks successful: {self.fallbacks_successful}")
        logger.info(f"Cost:")
        logger.info(f"  - Total credits spent: {self.total_credits_spent}")
        logger.info(f"  - Avg credits/URL: {avg_credits:.2f}")
        logger.info("=" * 60)


# ============================================
# URL UTILITIES
# ============================================

def normalize_url(url: str) -> str:
    """Normalize URL for matching (lowercase, strip protocol/trailing slash)."""
    url = url.lower().strip()
    url = url.replace('http://', '').replace('https://', '')
    url = url.rstrip('/')
    return url


def is_social_media_url(url: str) -> bool:
    """Check if URL is LinkedIn or Facebook (skip these for website extraction)."""
    if not url:
        return False
    url_lower = url.lower()
    return 'linkedin' in url_lower or 'facebook' in url_lower


def extract_domain(url: str) -> str:
    """Extract root domain from URL (without www prefix)."""
    try:
        if '://' not in url:
            url = f'https://{url}'
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except Exception:
        return url.lower().strip()


def prepare_url(url: str) -> Optional[str]:
    """
    Clean and validate URL for scraping.
    
    Returns None if URL is invalid/malformed.
    """
    url = url.strip()
    if not url:
        return None
    
    # Remove newlines, tabs
    url = url.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
    
    # Basic validation
    if ' ' in url or len(url) < 4:
        return None
    
    if '.' not in url:
        return None
    
    # Add protocol if missing
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    return url


def deduplicate_urls_by_domain(
    rows: List[Dict], 
    website_col: str
) -> Tuple[List[str], List[int], Dict[int, int], List[int], int]:
    """
    Remove duplicate domains and social media URLs from URL list.
    
    Returns:
        - unique_urls: List of unique URLs to scrape
        - unique_indices: List of row indices for unique URLs
        - duplicate_map: Dict mapping duplicate row index -> first occurrence index
        - social_media_indices: Row indices skipped due to social media URLs
        - malformed_count: Number of malformed URLs
    """
    domain_to_first_index = {}
    duplicate_map = {}
    social_media_indices = []
    unique_urls = []
    unique_indices = []
    malformed_count = 0
    
    for i, row in enumerate(rows):
        url = row.get(website_col, '').strip()
        
        # Clean URL
        url = url.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
        
        if not url:
            continue
        
        # Skip social media URLs
        if is_social_media_url(url):
            social_media_indices.append(i)
            continue
        
        # Validate and prepare URL
        prepared_url = prepare_url(url)
        if not prepared_url:
            malformed_count += 1
            continue
        
        domain = extract_domain(prepared_url)
        
        if domain in domain_to_first_index:
            # Duplicate - map to first occurrence
            duplicate_map[i] = domain_to_first_index[domain]
        else:
            # First occurrence
            domain_to_first_index[domain] = i
            unique_urls.append(prepared_url)
            unique_indices.append(i)
    
    return unique_urls, unique_indices, duplicate_map, social_media_indices, malformed_count


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
    3. Scrape websites with ZenRows (tiered escalation + fallback)
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
        
        # Check job state
        if job.status not in ['pending']:
            logger.warning(f"Job {job_id} has status '{job.status}', skipping")
            return False
        
        # Check cancellation
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
        
        logger.info(f"📊 Processing {len(rows)} rows with website column '{website_col}'")
        
        # Initialize output with original data
        output_rows = []
        for row in rows:
            output_row = dict(row)
            output_row['email_1'] = ''
            output_row['email_2'] = ''
            output_row['phone_1'] = ''
            output_row['phone_2'] = ''
            output_row['extraction_status'] = 'not_found'
            output_rows.append(output_row)
        
        # Mark rows without website
        for i, row in enumerate(rows):
            website = row.get(website_col, '').strip()
            if not website:
                output_rows[i]['extraction_status'] = 'no_website'
        
        # Deduplicate URLs
        unique_urls, unique_indices, duplicate_map, social_media_indices, malformed_count = \
            deduplicate_urls_by_domain(rows, website_col)
        
        if not unique_urls:
            logger.error(f"No valid URLs found in CSV for job {job_id}")
            job.status = "failed"
            job.error_message = "No valid website URLs found in the selected column"
            db.commit()
            return False
        
        # Mark duplicate rows
        for dup_idx in duplicate_map:
            output_rows[dup_idx]['extraction_status'] = 'duplicate'
        
        # Mark social media rows
        for sm_idx in social_media_indices:
            output_rows[sm_idx]['extraction_status'] = 'skipped_social_media'
        
        logger.info(f"📊 Found {len(unique_urls)} unique domains to scrape "
                   f"({len(duplicate_map)} duplicates, {len(social_media_indices)} social media, "
                   f"{malformed_count} malformed)")
        
        # Initialize stats
        stats = CrawlStats(
            total_urls=len(rows),
            urls_skipped_no_website=sum(1 for row in rows if not row.get(website_col, '').strip()),
            urls_skipped_social_media=len(social_media_indices),
            urls_duplicate=len(duplicate_map),
        )
        
        # Create ZenRows client
        async with ZenRowsClient(
            api_key=settings.ZENROWS_API_KEY,
            redis_client=redis.from_url(settings.REDIS_URL),
            concurrency_limit=settings.ZENROWS_CONCURRENCY,
            cache_ttl=settings.ZENROWS_DOMAIN_CACHE_TTL,
        ) as zenrows:
            
            # Process URLs in parallel batches
            total_processed = 0
            total_with_contacts = 0
            total_credits = 0
            
            # Create tasks for all URLs
            async def process_url(url: str, idx: int) -> Tuple[int, dict]:
                """Process a single URL and return (index, result_dict)."""
                # ZenRows requires session_id to be a 5-digit numeric value
                numeric_session_id = str(int(job_id[:8], 16) % 90000 + 10000)
                result = await zenrows.scrape_with_fallback(url, session_id=numeric_session_id)
                
                contacts_dict = result.contacts.to_dict()
                has_contacts = result.contacts.has_contacts()
                
                return idx, {
                    'success': result.success,
                    'contacts': contacts_dict,
                    'has_contacts': has_contacts,
                    'tier_used': result.tier_used,
                    'credits': result.credits_spent,
                    'fallback_used': result.fallback_used,
                    'classification': result.classification,
                }
            
            # Process in chunks for better progress reporting
            CHUNK_SIZE = 100  # Report progress every 100 URLs
            
            for chunk_start in range(0, len(unique_urls), CHUNK_SIZE):
                # Check cancellation
                if is_job_cancelled(job_id):
                    logger.info(f"Job {job_id} was cancelled during processing")
                    job.status = "cancelled"
                    db.commit()
                    return False
                
                chunk_end = min(chunk_start + CHUNK_SIZE, len(unique_urls))
                chunk_urls = unique_urls[chunk_start:chunk_end]
                chunk_indices = unique_indices[chunk_start:chunk_end]
                
                logger.info(f"🌐 Processing URLs {chunk_start + 1}-{chunk_end} of {len(unique_urls)}")
                
                # Create tasks for this chunk
                tasks = [
                    process_url(url, idx) 
                    for url, idx in zip(chunk_urls, chunk_indices)
                ]
                
                # Execute all tasks concurrently
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Process results
                for result in results:
                    if isinstance(result, Exception):
                        logger.error(f"Task exception: {result}")
                        stats.urls_failed += 1
                        continue
                    
                    idx, data = result
                    total_processed += 1
                    total_credits += data['credits']
                    stats.total_credits_spent += data['credits']
                    
                    if data['success']:
                        stats.urls_scraped += 1
                        
                        # Track tier usage
                        tier = data['tier_used']
                        if tier == 1:
                            stats.tier_1_success += 1
                        elif tier == 2:
                            stats.tier_2_success += 1
                        elif tier == 3:
                            stats.tier_3_success += 1
                        elif tier == 4:
                            stats.tier_4_success += 1
                        
                        # Track fallback usage
                        if data['fallback_used']:
                            stats.fallbacks_tried += 1
                            if data['has_contacts']:
                                stats.fallbacks_successful += 1
                        
                        # Update output row
                        contacts = data['contacts']
                        output_rows[idx]['email_1'] = contacts['email_1']
                        output_rows[idx]['email_2'] = contacts['email_2']
                        output_rows[idx]['phone_1'] = contacts['phone_1']
                        output_rows[idx]['phone_2'] = contacts['phone_2']
                        
                        if data['has_contacts']:
                            output_rows[idx]['extraction_status'] = 'success'
                            total_with_contacts += 1
                            stats.urls_with_contacts += 1
                            
                            # Count individual contacts
                            if contacts['email_1']:
                                stats.emails_extracted += 1
                            if contacts['email_2']:
                                stats.emails_extracted += 1
                            if contacts['phone_1']:
                                stats.phones_extracted += 1
                            if contacts['phone_2']:
                                stats.phones_extracted += 1
                        else:
                            output_rows[idx]['extraction_status'] = 'not_found'
                    else:
                        stats.urls_failed += 1
                        output_rows[idx]['extraction_status'] = 'error'
                
                # Update progress
                progress = int((total_processed / len(unique_urls)) * 100)
                hit_rate = (total_with_contacts / total_processed * 100) if total_processed > 0 else 0
                
                job.completed_leads = total_processed
                job.progress_percentage = progress
                job.hit_rate_percentage = Decimal(str(round(hit_rate, 2)))
                job.credits_spent = total_credits
                db.commit()
                
                logger.info(f"📊 Progress: {progress}% ({total_processed}/{len(unique_urls)}), "
                           f"Hit rate: {hit_rate:.1f}%, Credits: {total_credits}")
        
        # Copy contacts from first occurrence to duplicate rows
        if duplicate_map:
            logger.info(f"📋 Copying contacts to {len(duplicate_map)} duplicate rows")
            for dup_idx, first_idx in duplicate_map.items():
                output_rows[dup_idx]['email_1'] = output_rows[first_idx]['email_1']
                output_rows[dup_idx]['email_2'] = output_rows[first_idx]['email_2']
                output_rows[dup_idx]['phone_1'] = output_rows[first_idx]['phone_1']
                output_rows[dup_idx]['phone_2'] = output_rows[first_idx]['phone_2']
                
                if output_rows[first_idx]['extraction_status'] == 'success':
                    output_rows[dup_idx]['extraction_status'] = 'duplicate_success'
                elif output_rows[first_idx]['extraction_status'] == 'error':
                    output_rows[dup_idx]['extraction_status'] = 'duplicate_error'
        
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
        job.status = "completed"
        job.output_file_path = output_file_path
        job.completed_leads = total_processed
        job.progress_percentage = 100
        hit_rate = (total_with_contacts / total_processed * 100) if total_processed > 0 else 0
        job.hit_rate_percentage = Decimal(str(round(hit_rate, 2)))
        job.credits_spent = total_credits
        job.completed_at = datetime.utcnow()
        db.commit()
        
        # Log performance summary
        stats.log_summary(job_id)
        
        logger.info(f"✅ Job {job_id} completed! Processed {total_processed} URLs, "
                   f"{total_with_contacts} with contacts ({hit_rate:.1f}% hit rate), "
                   f"{total_credits} credits spent")
        
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


async def check_health_and_log():
    """Check ZenRows API health on startup."""
    is_healthy, message = await check_zenrows_health(settings.ZENROWS_API_KEY)
    if is_healthy:
        logger.info(f"✅ {message}")
    else:
        logger.error(f"❌ {message}")
    return is_healthy


def main():
    """Main worker loop - polls queue and processes jobs."""
    logger.info(f"🚀 Website Scraper worker starting...")
    logger.info(f"📋 Listening to queue: {WEBSITE_SCRAPER_QUEUE}")
    logger.info(f"⚙️ ZenRows concurrency limit: {settings.ZENROWS_CONCURRENCY}")
    logger.info(f"⚙️ Domain cache TTL: {settings.ZENROWS_DOMAIN_CACHE_TTL}s")
    
    # Check ZenRows health on startup
    is_healthy = asyncio.run(check_health_and_log())
    if not is_healthy:
        logger.warning("⚠️ ZenRows API not accessible - jobs may fail")
    
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
                
                logger.info(f"📥 Received job {job_id} from queue (website_col: {website_col})")
                
                # Process job
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
