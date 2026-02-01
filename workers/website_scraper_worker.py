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
from typing import Optional, List, Dict, Tuple, AsyncGenerator
from dataclasses import dataclass, field
from urllib.parse import urlparse
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

# Batch size for crawling - reduced to prevent browser exhaustion
# Railway Crawl4AI works better with smaller concurrent batches
BATCH_SIZE = 8

# Crawl4AI timeout per URL (seconds)
CRAWL_TIMEOUT = 30

# ============================================
# BATCH PROCESSING CONFIGURATION
# ============================================

# Cooldown between batches (seconds) - allows Crawl4AI browser pool to recover
BATCH_COOLDOWN_SECONDS = 5

# Adaptive cooldown: if failure rate exceeds this threshold, double the cooldown
ADAPTIVE_COOLDOWN_THRESHOLD = 0.4  # 40% failure rate triggers longer cooldown

# Maximum cooldown (seconds) to prevent excessively long waits
MAX_COOLDOWN_SECONDS = 30

# Consecutive batch failure threshold - pause longer if multiple batches fail badly
CONSECUTIVE_FAILURE_THRESHOLD = 3
HEALTH_PAUSE_SECONDS = 30

# Retry configuration for failed URLs
ENABLE_RETRY = True
RETRY_BATCH_SIZE = 10  # Smaller batches for retries
MAX_RETRY_ATTEMPTS = 1  # Number of retry rounds


# ============================================
# CONTACT EXTRACTION FUNCTIONS
# ============================================

# Patterns to exclude for emails (junk emails)
# NOTE: admin@ and webmaster@ removed - these can be valid business contacts
EMAIL_EXCLUDE_PATTERNS = [
    re.compile(r'^noreply@', re.IGNORECASE),
    re.compile(r'^no-reply@', re.IGNORECASE),
    re.compile(r'^no_reply@', re.IGNORECASE),
    re.compile(r'^donotreply@', re.IGNORECASE),
    re.compile(r'^do-not-reply@', re.IGNORECASE),
    re.compile(r'^filler@', re.IGNORECASE),
    re.compile(r'^test@', re.IGNORECASE),
    re.compile(r'^example@', re.IGNORECASE),
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


# ============================================
# PERFORMANCE TRACKING
# ============================================

@dataclass
class CrawlStats:
    """Track detailed crawl and extraction metrics for performance analysis."""
    total_urls: int = 0
    urls_with_content: int = 0      # Crawl succeeded AND returned markdown content
    urls_empty_content: int = 0     # Crawl succeeded but no/empty markdown (JS-heavy, blocked)
    urls_failed: int = 0            # Crawl failed (timeout, error, blocked)
    urls_malformed: int = 0         # Invalid URL format in input
    urls_skipped_no_website: int = 0  # Row had no website value
    urls_duplicate: int = 0         # Duplicate domains skipped
    emails_extracted: int = 0       # Total emails found
    phones_extracted: int = 0       # Total phones found
    rows_with_contacts: int = 0     # Rows that got at least one contact
    
    def log_summary(self, job_id: str):
        """Log comprehensive performance summary."""
        total_crawled = self.urls_with_content + self.urls_empty_content + self.urls_failed
        content_rate = (self.urls_with_content / total_crawled * 100) if total_crawled > 0 else 0
        empty_rate = (self.urls_empty_content / total_crawled * 100) if total_crawled > 0 else 0
        fail_rate = (self.urls_failed / total_crawled * 100) if total_crawled > 0 else 0
        contact_rate = (self.rows_with_contacts / self.total_urls * 100) if self.total_urls > 0 else 0
        
        logger.info("=" * 50)
        logger.info(f"JOB PERFORMANCE SUMMARY - {job_id}")
        logger.info("=" * 50)
        logger.info(f"Total URLs in CSV: {self.total_urls}")
        logger.info(f"  - Skipped (no website): {self.urls_skipped_no_website}")
        logger.info(f"  - Skipped (duplicate domain): {self.urls_duplicate}")
        logger.info(f"  - Malformed URLs: {self.urls_malformed}")
        logger.info(f"Crawl Results ({total_crawled} URLs crawled):")
        logger.info(f"  - With content: {self.urls_with_content} ({content_rate:.1f}%)")
        logger.info(f"  - Empty content: {self.urls_empty_content} ({empty_rate:.1f}%) <- Sites returned but no markdown")
        logger.info(f"  - Failed: {self.urls_failed} ({fail_rate:.1f}%)")
        logger.info(f"Extraction Results:")
        logger.info(f"  - Emails found: {self.emails_extracted}")
        logger.info(f"  - Phones found: {self.phones_extracted}")
        logger.info(f"  - Rows with contacts: {self.rows_with_contacts} ({contact_rate:.1f}% hit rate)")
        logger.info("=" * 50)


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


# ============================================
# URL NORMALIZATION & MATCHING UTILITIES
# ============================================

def normalize_url(url: str) -> str:
    """Normalize URL for matching (lowercase, strip protocol/trailing slash)."""
    url = url.lower().strip()
    url = url.replace('http://', '').replace('https://', '')
    url = url.rstrip('/')
    return url


def extract_domain(url: str) -> str:
    """Extract root domain from URL (without www prefix)."""
    try:
        # Add protocol if missing for proper parsing
        if '://' not in url:
            url = f'https://{url}'
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Remove www. prefix for consistent matching
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except Exception:
        return url.lower().strip()


def build_url_lookup(urls: List[str], indices: List[int]) -> Dict[str, Dict[str, int]]:
    """
    Build lookup maps for hybrid URL matching.
    
    Returns dict with 'normalized' and 'domain' sub-dicts mapping to row indices.
    """
    normalized_map = {}
    domain_map = {}
    
    for url, idx in zip(urls, indices):
        norm = normalize_url(url)
        domain = extract_domain(url)
        
        # Store normalized URL -> index
        if norm not in normalized_map:
            normalized_map[norm] = idx
        
        # Store domain -> index (first occurrence wins for duplicates)
        if domain not in domain_map:
            domain_map[domain] = idx
    
    return {'normalized': normalized_map, 'domain': domain_map}


def match_result_to_index(result_url: str, lookup: Dict[str, Dict[str, int]]) -> Optional[int]:
    """
    Hybrid matching: try normalized URL first, fall back to domain.
    
    Returns the row index or None if no match found.
    """
    if not result_url:
        return None
    
    # Try exact normalized match first (handles most cases)
    norm = normalize_url(result_url)
    if norm in lookup['normalized']:
        return lookup['normalized'][norm]
    
    # Fall back to domain-only match (handles redirects that change path)
    domain = extract_domain(result_url)
    return lookup['domain'].get(domain)


def deduplicate_urls_by_domain(rows: List[Dict], website_col: str) -> Tuple[List[str], List[int], Dict[int, int]]:
    """
    Remove duplicate domains from URL list within a job.
    
    Returns:
        - unique_urls: List of unique URLs to crawl
        - unique_indices: List of row indices for unique URLs
        - duplicate_map: Dict mapping duplicate row index -> first occurrence index
    """
    domain_to_first_index = {}
    duplicate_map = {}  # Maps duplicate row index -> first occurrence row index
    unique_urls = []
    unique_indices = []
    
    for i, row in enumerate(rows):
        url = row.get(website_col, '').strip()
        # Clean URL
        url = url.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
        
        if not url:
            continue
        
        domain = extract_domain(url)
        
        if domain in domain_to_first_index:
            # This is a duplicate - map to first occurrence
            duplicate_map[i] = domain_to_first_index[domain]
            logger.debug(f"Duplicate domain '{domain}' at row {i}, maps to row {domain_to_first_index[domain]}")
        else:
            # First occurrence of this domain
            domain_to_first_index[domain] = i
            unique_urls.append(url)
            unique_indices.append(i)
    
    if duplicate_map:
        logger.info(f"Deduplicated {len(duplicate_map)} duplicate domains, {len(unique_urls)} unique URLs to crawl")
    
    return unique_urls, unique_indices, duplicate_map


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

# Streaming batch timeout (10 minutes for large batches)
STREAMING_BATCH_TIMEOUT = 600


# ============================================
# CRAWL4AI MONITORING & RECOVERY
# ============================================

async def get_crawl4ai_health() -> dict:
    """Get detailed health status from Crawl4AI monitor endpoint."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{settings.CRAWL4AI_URL}/monitor/health")
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.warning(f"Health check failed: {e}")
    return {"status": "unknown"}


async def trigger_crawl4ai_cleanup() -> bool:
    """Force cleanup of Crawl4AI resources via monitor endpoint."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{settings.CRAWL4AI_URL}/monitor/actions/cleanup")
            logger.info(f"🧹 Crawl4AI cleanup triggered: {response.status_code}")
            return response.status_code == 200
    except Exception as e:
        logger.error(f"❌ Crawl4AI cleanup failed: {e}")
    return False


async def restart_crawl4ai_browser() -> bool:
    """Restart the Crawl4AI browser pool via monitor endpoint."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.CRAWL4AI_URL}/monitor/actions/restart_browser",
                json={"sig": "permanent"}
            )
            logger.info(f"🔄 Crawl4AI browser restart triggered: {response.status_code}")
            return response.status_code == 200
    except Exception as e:
        logger.error(f"❌ Crawl4AI browser restart failed: {e}")
    return False


class FailureRateTracker:
    """
    Track rolling failure rate across batches for auto-recovery.
    
    When failure rate exceeds threshold, triggers cleanup or browser restart
    to recover from Crawl4AI resource exhaustion.
    """
    
    def __init__(self, window_size: int = 5):
        self.window_size = window_size
        self.batch_results = []  # List of (success_count, total_count) tuples
        self.cleanup_triggered = False
    
    def add_batch(self, success: int, total: int):
        """Record batch results for rolling average calculation."""
        self.batch_results.append((success, total))
        if len(self.batch_results) > self.window_size:
            self.batch_results.pop(0)
    
    def get_failure_rate(self) -> float:
        """Calculate rolling failure rate across recent batches."""
        if not self.batch_results:
            return 0.0
        total_success = sum(s for s, _ in self.batch_results)
        total_count = sum(t for _, t in self.batch_results)
        return 1 - (total_success / total_count) if total_count > 0 else 0.0
    
    async def check_and_recover(self) -> bool:
        """
        Check failure rate and trigger recovery if needed.
        
        Recovery strategy:
        1. First, try cleanup (lighter operation)
        2. If still failing, restart browser pool (heavier but more effective)
        
        Returns True if recovery action was taken.
        """
        failure_rate = self.get_failure_rate()
        
        if failure_rate > 0.4:  # >40% failure rate triggers recovery
            logger.warning(f"⚠️ High failure rate detected: {failure_rate:.1%}")
            
            if not self.cleanup_triggered:
                # First attempt: cleanup
                logger.info("🧹 Attempting Crawl4AI cleanup...")
                success = await trigger_crawl4ai_cleanup()
                self.cleanup_triggered = True
                if success:
                    await asyncio.sleep(5)  # Wait for cleanup to take effect
                return True
            else:
                # Second attempt: full browser restart
                logger.info("🔄 Cleanup didn't help, restarting browser pool...")
                success = await restart_crawl4ai_browser()
                self.cleanup_triggered = False  # Reset for next cycle
                self.batch_results.clear()  # Clear history after restart
                if success:
                    await asyncio.sleep(10)  # Wait for browser restart
                return True
        
        # Reset cleanup flag if failure rate is acceptable
        if failure_rate < 0.2:
            self.cleanup_triggered = False
        
        return False


def prepare_urls_for_crawl(urls: List[str]) -> Tuple[List[str], int]:
    """
    Clean and prepare URLs for crawling.
    
    Returns:
        Tuple of (cleaned URLs with protocol, count of malformed/invalid URLs)
    """
    prepared = []
    malformed_count = 0
    
    for url in urls:
        url = url.strip()
        if not url:
            continue
        
        # Remove newlines, carriage returns, tabs
        url = url.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
        
        # Basic URL validation
        # Check for obviously malformed URLs
        if ' ' in url or len(url) < 4:
            malformed_count += 1
            logger.debug(f"Malformed URL skipped: '{url[:50]}...'")
            continue
        
        # Check for valid domain pattern (at least has a dot)
        if '.' not in url:
            malformed_count += 1
            logger.debug(f"Invalid URL (no domain): '{url[:50]}...'")
            continue
        
        # Add protocol if missing
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        prepared.append(url)
    
    if malformed_count > 0:
        logger.warning(f"⚠️ {malformed_count} malformed/invalid URLs skipped during preparation")
    
    return prepared, malformed_count


async def crawl_batch_streaming(
    urls: List[str], 
    indices: List[int],
    on_result: callable
) -> Dict[str, int]:
    """
    Stream crawl results from Crawl4AI batch endpoint.
    
    Uses /crawl/stream for true concurrent batch processing with SSE streaming.
    Results are processed via callback as they arrive (out of order).
    
    Args:
        urls: List of URLs to crawl
        indices: Corresponding row indices in the output
        on_result: Callback function(index, result_dict) called for each result
        
    Returns:
        Dict with stats including:
        - processed: Total URLs processed
        - with_content: URLs that returned actual markdown content
        - empty_content: URLs that succeeded but had no/empty content
        - failed: URLs that failed to crawl
        - unmatched: Results that couldn't be matched to input
        - malformed: URLs that were malformed and skipped
    """
    if not settings.CRAWL4AI_URL:
        logger.error("CRAWL4AI_URL not configured")
        return {'processed': 0, 'with_content': 0, 'empty_content': 0, 'failed': 0, 'unmatched': 0, 'malformed': 0}
    
    # Prepare URLs (clean and add protocol)
    prepared_urls, malformed_count = prepare_urls_for_crawl(urls)
    
    if not prepared_urls:
        logger.warning("No valid URLs to crawl after preparation")
        return {'processed': 0, 'with_content': 0, 'empty_content': 0, 'failed': 0, 'unmatched': 0, 'malformed': malformed_count}
    
    # Build lookup map for hybrid URL matching
    lookup = build_url_lookup(urls, indices)
    
    # Prepare request payload for Crawl4AI batch endpoint
    # Using flat structure per Railway Crawl4AI Swagger API schema
    request_payload = {
        "urls": prepared_urls,
        "browser_config": {
            "text_mode": True,       # Skip images for speed
            "light_mode": True,      # Reduce browser overhead
            "headless": True,
            "java_script_enabled": True
        },
        "crawler_config": {
            "cache_mode": "BYPASS",
            "screenshot": False,     # Don't capture screenshots
            "verbose": False
        }
    }
    
    logger.info(f"🌐 Sending batch of {len(prepared_urls)} URLs to Crawl4AI /crawl/stream")
    
    stats = {
        'processed': 0, 
        'with_content': 0,      # Crawl succeeded AND has markdown content
        'empty_content': 0,     # Crawl succeeded but no/empty markdown
        'failed': 0,            # Crawl failed
        'unmatched': 0,         # Could not match to input URL
        'malformed': malformed_count  # Malformed URLs skipped
    }
    
    try:
        async with httpx.AsyncClient(timeout=STREAMING_BATCH_TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{settings.CRAWL4AI_URL}/crawl/stream",
                json=request_payload,
                timeout=STREAMING_BATCH_TIMEOUT
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(f"❌ Crawl4AI returned status {response.status_code}: {error_text[:500]}")
                    return stats
                
                # Process SSE stream - each line is a JSON result
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Skip SSE event markers if present
                    if line.startswith('event:') or line.startswith(':'):
                        continue
                    
                    # Handle SSE data: prefix
                    if line.startswith('data:'):
                        line = line[5:].strip()
                    
                    if not line:
                        continue
                    
                    try:
                        result = json.loads(line)
                    except json.JSONDecodeError as e:
                        logger.warning(f"Failed to parse streaming result: {e}")
                        continue
                    
                    stats['processed'] += 1
                    
                    # Match result back to original row index using hybrid matching
                    result_url = result.get('url', '')
                    idx = match_result_to_index(result_url, lookup)
                    
                    if idx is None:
                        stats['unmatched'] += 1
                        logger.warning(f"Could not match result URL '{result_url}' to any input row")
                        continue
                    
                    # Extract result data
                    success = result.get('success', False)
                    markdown_raw = result.get('markdown', '')
                    # Handle Crawl4AI returning markdown as dict (MarkdownGenerationResult)
                    if isinstance(markdown_raw, dict):
                        markdown = markdown_raw.get('raw_markdown', '') or markdown_raw.get('fit_markdown', '') or ''
                    else:
                        markdown = markdown_raw if markdown_raw else ''
                    error_msg = result.get('error_message')
                    
                    # Track detailed content stats
                    if success:
                        # Check if we actually got content
                        content_length = len(markdown.strip()) if markdown else 0
                        if content_length > 50:  # Meaningful content threshold
                            stats['with_content'] += 1
                        else:
                            stats['empty_content'] += 1
                            if content_length == 0:
                                logger.debug(f"Empty content from {result_url[:50]}...")
                    else:
                        stats['failed'] += 1
                    
                    # Call the result handler with content info
                    on_result(idx, {
                        'url': result_url,
                        'success': success,
                        'markdown': markdown,
                        'error': error_msg,
                        'has_content': bool(markdown and len(markdown.strip()) > 50)
                    })
                    
    except httpx.TimeoutException:
        logger.error(f"❌ Streaming batch timed out after {STREAMING_BATCH_TIMEOUT}s")
    except Exception as e:
        logger.error(f"❌ Error during streaming batch crawl: {e}")
        import traceback
        traceback.print_exc()
    
    total_success = stats['with_content'] + stats['empty_content']
    logger.info(f"📊 Batch complete: {stats['processed']} processed | {stats['with_content']} with content, {stats['empty_content']} empty, {stats['failed']} failed, {stats['unmatched']} unmatched")
    return stats


# Legacy single-URL crawl (kept for fallback if needed)
async def crawl_url(url: str) -> Tuple[bool, str, Optional[str]]:
    """
    Crawl a single URL using Crawl4AI service.
    
    NOTE: For batch operations, use crawl_batch_streaming instead for better performance.
    
    Returns:
        Tuple of (success, markdown_content, error_message)
    """
    if not settings.CRAWL4AI_URL:
        return False, '', 'CRAWL4AI_URL not configured'
    
    # Clean URL
    url = url.strip()
    if not url:
        return False, '', 'Empty URL'
    
    url = url.replace('\n', '').replace('\r', '').replace('\t', ' ').strip()
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    try:
        # Use the correct payload format for Railway Crawl4AI
        request_payload = {"urls": [url]}
        
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.CRAWL4AI_URL}/crawl",
                json=request_payload
            )
            
            if response.status_code == 200:
                results = response.json()
                # Response is a list of results
                if results and len(results) > 0:
                    result = results[0]
                    if result.get('success'):
                        return True, result.get('markdown', ''), None
                    else:
                        return False, '', result.get('error_message', 'Crawl failed')
                return False, '', 'Empty response'
            else:
                return False, '', f'HTTP {response.status_code}'
                
    except httpx.TimeoutException:
        return False, '', 'Timeout'
    except Exception as e:
        return False, '', str(e)


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
        
        logger.info(f"📊 Processing {len(rows)} rows with website column '{website_col}'")
        
        # Initialize output with original data
        output_rows = []
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
        
        # Deduplicate URLs by domain to prevent duplicate contacts
        unique_urls, unique_indices, duplicate_map = deduplicate_urls_by_domain(rows, website_col)
        
        if not unique_urls:
            logger.error(f"No valid URLs found in CSV for job {job_id}")
            job.status = "failed"
            job.error_message = "No valid website URLs found in the selected column"
            db.commit()
            return False
        
        # Mark duplicate rows
        for dup_idx in duplicate_map:
            output_rows[dup_idx]['extraction_status'] = 'duplicate'
        
        logger.info(f"📊 Found {len(unique_urls)} unique domains to crawl ({len(duplicate_map)} duplicates)")
        
        # Split unique URLs into batches
        batches = []
        for i in range(0, len(unique_urls), BATCH_SIZE):
            batch_urls = unique_urls[i:i + BATCH_SIZE]
            batch_indices = unique_indices[i:i + BATCH_SIZE]
            batches.append((batch_urls, batch_indices))
        
        # Initialize performance tracking
        crawl_stats = CrawlStats(
            total_urls=len(rows),
            urls_skipped_no_website=sum(1 for row in rows if not row.get(website_col, '').strip()),
            urls_duplicate=len(duplicate_map)
        )
        
        # Track progress
        total_processed = 0
        total_with_contacts = 0
        total_unique = len(unique_urls)
        
        # Result handler callback for streaming
        def handle_crawl_result(idx: int, result: Dict):
            nonlocal total_processed, total_with_contacts
            
            if result['success'] and result.get('has_content', False):
                # Ensure markdown is a string (defensive check)
                markdown = result['markdown']
                if isinstance(markdown, dict):
                    markdown = markdown.get('raw_markdown', '') or markdown.get('fit_markdown', '') or ''
                
                # Extract contacts from markdown
                contacts = extract_contacts(markdown)
                
                output_rows[idx]['email_1'] = contacts['email_1']
                output_rows[idx]['email_2'] = contacts['email_2']
                output_rows[idx]['phone_1'] = contacts['phone_1']
                output_rows[idx]['phone_2'] = contacts['phone_2']
                
                # Track extraction stats
                if contacts['email_1']:
                    crawl_stats.emails_extracted += 1
                if contacts['email_2']:
                    crawl_stats.emails_extracted += 1
                if contacts['phone_1']:
                    crawl_stats.phones_extracted += 1
                if contacts['phone_2']:
                    crawl_stats.phones_extracted += 1
                
                # Determine status based on whether contacts were found
                has_contacts = bool(contacts['email_1'] or contacts['email_2'] or 
                                   contacts['phone_1'] or contacts['phone_2'])
                if has_contacts:
                    output_rows[idx]['extraction_status'] = 'success'
                    total_with_contacts += 1
                    crawl_stats.rows_with_contacts += 1
                else:
                    output_rows[idx]['extraction_status'] = 'not_found'
            elif result['success']:
                # Crawl succeeded but no meaningful content
                output_rows[idx]['extraction_status'] = 'no_content'
            else:
                output_rows[idx]['extraction_status'] = 'error'
            
            total_processed += 1
        
        # Track failed URLs for retry
        failed_urls_for_retry = []  # List of (url, index) tuples
        consecutive_bad_batches = 0
        
        # Initialize failure rate tracker for auto-recovery
        failure_tracker = FailureRateTracker(window_size=5)
        
        # Process each batch using streaming
        for batch_num, (batch_urls, batch_indices) in enumerate(batches):
            # Check if cancelled
            if is_job_cancelled(job_id):
                logger.info(f"Job {job_id} was cancelled during processing")
                job.status = "cancelled"
                db.commit()
                return False
            
            logger.info(f"🌐 Crawling batch {batch_num + 1}/{len(batches)} ({len(batch_urls)} URLs)")
            
            # Track which URLs failed in this batch for potential retry
            batch_failed_urls = []
            
            def handle_crawl_result_with_retry(idx: int, result: Dict):
                """Wrapper to track failures for retry."""
                handle_crawl_result(idx, result)
                if not result['success'] and ENABLE_RETRY:
                    # Find the URL for this index
                    for url, i in zip(batch_urls, batch_indices):
                        if i == idx:
                            batch_failed_urls.append((url, idx))
                            break
            
            # Crawl batch using streaming endpoint
            batch_failure_rate = 0
            try:
                batch_stats = await crawl_batch_streaming(batch_urls, batch_indices, handle_crawl_result_with_retry)
                
                # Accumulate batch stats into overall stats
                crawl_stats.urls_with_content += batch_stats.get('with_content', 0)
                crawl_stats.urls_empty_content += batch_stats.get('empty_content', 0)
                crawl_stats.urls_failed += batch_stats.get('failed', 0)
                crawl_stats.urls_malformed += batch_stats.get('malformed', 0)
                
                # Calculate batch failure rate for adaptive cooldown
                batch_processed = batch_stats.get('processed', 0)
                batch_failed = batch_stats.get('failed', 0)
                batch_success = batch_stats.get('with_content', 0) + batch_stats.get('empty_content', 0)
                batch_failure_rate = (batch_failed / batch_processed) if batch_processed > 0 else 0
                
                # Track for auto-recovery
                failure_tracker.add_batch(batch_success, batch_processed)
                
                # Collect failed URLs for retry
                failed_urls_for_retry.extend(batch_failed_urls)
                
            except Exception as e:
                logger.error(f"❌ Batch {batch_num + 1} crawl failed: {e}")
                import traceback
                traceback.print_exc()
                # Mark all in batch as error
                for idx in batch_indices:
                    if output_rows[idx]['extraction_status'] == 'not_found':
                        output_rows[idx]['extraction_status'] = 'error'
                        total_processed += 1
                        crawl_stats.urls_failed += 1
                batch_failure_rate = 1.0  # Complete failure
                # Add all URLs to retry queue
                if ENABLE_RETRY:
                    failed_urls_for_retry.extend(zip(batch_urls, batch_indices))
            
            # Update progress after each batch
            progress = int((total_processed / total_unique) * 100) if total_unique > 0 else 0
            hit_rate = (total_with_contacts / total_processed * 100) if total_processed > 0 else 0
            
            job.completed_leads = total_processed
            job.progress_percentage = progress
            job.hit_rate_percentage = Decimal(str(round(hit_rate, 2)))
            db.commit()
            
            logger.info(f"📊 Progress: {progress}% ({total_processed}/{total_unique}), Hit rate: {hit_rate:.1f}%")
            
            # === AUTO-RECOVERY CHECK ===
            # Check if we need to trigger cleanup or browser restart based on rolling failure rate
            if await failure_tracker.check_and_recover():
                logger.info("🔧 Recovery action taken, continuing with next batch...")
            
            # === ADAPTIVE COOLDOWN LOGIC ===
            
            # Track consecutive bad batches for health monitoring
            if batch_failure_rate > 0.7:  # >70% failure
                consecutive_bad_batches += 1
                if consecutive_bad_batches >= CONSECUTIVE_FAILURE_THRESHOLD:
                    logger.warning(f"⚠️ {consecutive_bad_batches} consecutive bad batches - Crawl4AI may be unhealthy, pausing for {HEALTH_PAUSE_SECONDS}s")
                    await asyncio.sleep(HEALTH_PAUSE_SECONDS)
                    consecutive_bad_batches = 0
            else:
                consecutive_bad_batches = 0
            
            # Apply cooldown between batches (skip after last batch)
            if batch_num < len(batches) - 1:
                cooldown = BATCH_COOLDOWN_SECONDS
                
                # Adaptive: increase cooldown if failure rate is high
                if batch_failure_rate > ADAPTIVE_COOLDOWN_THRESHOLD:
                    cooldown = min(BATCH_COOLDOWN_SECONDS * 2, MAX_COOLDOWN_SECONDS)
                    logger.info(f"⏳ High failure rate ({batch_failure_rate:.1%}), extended cooldown: {cooldown}s")
                else:
                    logger.debug(f"⏳ Batch cooldown: {cooldown}s")
                
                await asyncio.sleep(cooldown)
        
        # === RETRY FAILED URLs ===
        if ENABLE_RETRY and failed_urls_for_retry and MAX_RETRY_ATTEMPTS > 0:
            logger.info(f"🔄 Retrying {len(failed_urls_for_retry)} failed URLs with smaller batches")
            
            for retry_attempt in range(MAX_RETRY_ATTEMPTS):
                if not failed_urls_for_retry:
                    break
                    
                logger.info(f"🔄 Retry attempt {retry_attempt + 1}/{MAX_RETRY_ATTEMPTS} for {len(failed_urls_for_retry)} URLs")
                
                # Create smaller batches for retries
                retry_batches = []
                for i in range(0, len(failed_urls_for_retry), RETRY_BATCH_SIZE):
                    batch = failed_urls_for_retry[i:i + RETRY_BATCH_SIZE]
                    retry_urls = [url for url, idx in batch]
                    retry_indices = [idx for url, idx in batch]
                    retry_batches.append((retry_urls, retry_indices))
                
                # Clear for next round
                still_failed = []
                
                for retry_batch_num, (retry_urls, retry_indices) in enumerate(retry_batches):
                    # Check if cancelled
                    if is_job_cancelled(job_id):
                        logger.info(f"Job {job_id} was cancelled during retry")
                        job.status = "cancelled"
                        db.commit()
                        return False
                    
                    logger.info(f"🔄 Retry batch {retry_batch_num + 1}/{len(retry_batches)} ({len(retry_urls)} URLs)")
                    
                    # Track failures in retry
                    retry_failed = []
                    
                    def handle_retry_result(idx: int, result: Dict):
                        """Handle retry results."""
                        if result['success'] and result.get('has_content', False):
                            # Success on retry! Update the row
                            markdown = result['markdown']
                            if isinstance(markdown, dict):
                                markdown = markdown.get('raw_markdown', '') or markdown.get('fit_markdown', '') or ''
                            
                            contacts = extract_contacts(markdown)
                            output_rows[idx]['email_1'] = contacts['email_1']
                            output_rows[idx]['email_2'] = contacts['email_2']
                            output_rows[idx]['phone_1'] = contacts['phone_1']
                            output_rows[idx]['phone_2'] = contacts['phone_2']
                            
                            has_contacts = bool(contacts['email_1'] or contacts['email_2'] or 
                                               contacts['phone_1'] or contacts['phone_2'])
                            if has_contacts:
                                output_rows[idx]['extraction_status'] = 'success_retry'
                                nonlocal total_with_contacts
                                total_with_contacts += 1
                                crawl_stats.rows_with_contacts += 1
                            else:
                                output_rows[idx]['extraction_status'] = 'not_found_retry'
                            
                            crawl_stats.urls_with_content += 1
                            crawl_stats.urls_failed -= 1  # Recovered from failure
                            logger.debug(f"✅ Retry success for index {idx}")
                        elif result['success']:
                            output_rows[idx]['extraction_status'] = 'no_content_retry'
                            crawl_stats.urls_empty_content += 1
                            crawl_stats.urls_failed -= 1
                        else:
                            # Still failed, track for potential next retry round
                            for url, i in zip(retry_urls, retry_indices):
                                if i == idx:
                                    retry_failed.append((url, idx))
                                    break
                    
                    try:
                        await crawl_batch_streaming(retry_urls, retry_indices, handle_retry_result)
                        still_failed.extend(retry_failed)
                    except Exception as e:
                        logger.warning(f"Retry batch failed: {e}")
                        still_failed.extend(zip(retry_urls, retry_indices))
                    
                    # Longer cooldown between retry batches
                    await asyncio.sleep(BATCH_COOLDOWN_SECONDS * 2)
                
                failed_urls_for_retry = still_failed
                
            if failed_urls_for_retry:
                logger.info(f"📊 {len(failed_urls_for_retry)} URLs still failed after retries")
        
        # Copy contacts from first occurrence to duplicate rows
        if duplicate_map:
            logger.info(f"📋 Copying contacts to {len(duplicate_map)} duplicate rows")
            for dup_idx, first_idx in duplicate_map.items():
                # Copy contact data from first occurrence
                output_rows[dup_idx]['email_1'] = output_rows[first_idx]['email_1']
                output_rows[dup_idx]['email_2'] = output_rows[first_idx]['email_2']
                output_rows[dup_idx]['phone_1'] = output_rows[first_idx]['phone_1']
                output_rows[dup_idx]['phone_2'] = output_rows[first_idx]['phone_2']
                # Keep status as 'duplicate' but copy success info
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
        from datetime import datetime
        job.status = "completed"
        job.output_file_path = output_file_path
        job.completed_leads = total_processed
        job.progress_percentage = 100
        hit_rate = (total_with_contacts / total_processed * 100) if total_processed > 0 else 0
        job.hit_rate_percentage = Decimal(str(round(hit_rate, 2)))
        job.completed_at = datetime.utcnow()
        db.commit()
        
        # Log comprehensive performance summary
        crawl_stats.log_summary(job_id)
        
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
    logger.info(f"⚙️ Batch size: {BATCH_SIZE}, Cooldown: {BATCH_COOLDOWN_SECONDS}s, Retry: {ENABLE_RETRY}")
    logger.info(f"🔧 Auto-recovery enabled: cleanup + browser restart on high failure rate")
    
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
