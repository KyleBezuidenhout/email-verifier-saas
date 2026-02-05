#!/usr/bin/env python3
"""
ZenRows API Client for Website Contact Scraping

Uses ZenRows Adaptive Stealth Mode (mode=auto) for intelligent scraping.
No manual tier escalation - ZenRows automatically selects the best approach.

Features:
- Single API call with mode=auto (Adaptive Stealth Mode)
- 40 concurrent requests
- Built-in contact extraction with junk filtering
- Built-in rate limiting via asyncio.Semaphore
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple, Any
from urllib.parse import urlparse, quote
import httpx

logger = logging.getLogger(__name__)

# ZenRows API endpoint
ZENROWS_API_URL = "https://api.zenrows.com/v1/"

# Maximum concurrent requests (40 as requested)
MAX_CONCURRENT_REQUESTS = 40


# ============================================
# CONTACT EXTRACTION
# ============================================

# Email patterns to exclude (junk emails)
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
    re.compile(r'^placeholder@', re.IGNORECASE),
    re.compile(r'^email@', re.IGNORECASE),
    re.compile(r'^your@', re.IGNORECASE),
    re.compile(r'@\d+x\.', re.IGNORECASE),  # Image files like icon@2x.png
    re.compile(r'\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$', re.IGNORECASE),
    re.compile(r'@sentry\.io', re.IGNORECASE),
    re.compile(r'@wixpress\.com', re.IGNORECASE),
    re.compile(r'@w3\.org', re.IGNORECASE),
    re.compile(r'@wordpress\.com', re.IGNORECASE),
    re.compile(r'@mailchimp\.com', re.IGNORECASE),
    re.compile(r'@sendgrid\.net', re.IGNORECASE),
    re.compile(r'@(domain|company|yourcompany|example|test)\.', re.IGNORECASE),
]

# Regex patterns
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', re.IGNORECASE)
MAILTO_REGEX = re.compile(r'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', re.IGNORECASE)
TEL_REGEX = re.compile(r'tel:([+\d\s().-]+)', re.IGNORECASE)
PHONE_REGEX = re.compile(
    r'(?:\+\d{1,3}[-.\s]?)?'  # Optional country code
    r'\(?\d{3}\)?'            # Area code
    r'[-.\s]?'
    r'\d{3}'                  # Exchange
    r'[-.\s]?'
    r'\d{4}'                  # Subscriber
    r'(?:\s*(?:ext|x|extension)\.?\s*\d+)?',
    re.IGNORECASE
)


def is_junk_email(email: str) -> bool:
    """Check if email matches any junk/exclude patterns."""
    if not email or len(email) < 6 or len(email) > 254:
        return True
    if email.startswith('.') or '..' in email:
        return True
    for pattern in EMAIL_EXCLUDE_PATTERNS:
        if pattern.search(email):
            return True
    return False


def clean_phone(phone: str) -> str:
    """Clean and validate phone number."""
    phone = phone.strip()
    digits_only = re.sub(r'[^\d+]', '', phone)
    if len(digits_only) < 7:  # Too short to be valid
        return ''
    return phone


@dataclass
class ExtractedContacts:
    """Container for extracted contact information."""
    emails: List[str] = field(default_factory=list)
    phones: List[str] = field(default_factory=list)
    linkedin: Optional[str] = None
    twitter: Optional[str] = None
    facebook: Optional[str] = None
    
    def has_contacts(self) -> bool:
        """Check if any contacts were found."""
        return len(self.emails) > 0 or len(self.phones) > 0
    
    def to_dict(self) -> Dict[str, str]:
        """Convert to output dict with email_1, email_2, phone_1, phone_2 format."""
        return {
            'email_1': self.emails[0] if len(self.emails) > 0 else '',
            'email_2': self.emails[1] if len(self.emails) > 1 else '',
            'phone_1': self.phones[0] if len(self.phones) > 0 else '',
            'phone_2': self.phones[1] if len(self.phones) > 1 else '',
        }


def extract_contacts_from_html(html: str) -> ExtractedContacts:
    """
    Extract contacts from raw HTML.
    
    Priority:
    1. mailto: links (most reliable - explicit contact intent)
    2. tel: links
    3. Regex fallback on page text
    """
    contacts = ExtractedContacts()
    seen_emails = set()
    seen_phones = set()
    
    if not html:
        return contacts
    
    # 1. Extract mailto links (highest priority)
    mailto_matches = MAILTO_REGEX.findall(html)
    for email in mailto_matches:
        email_clean = email.lower().strip()
        if email_clean not in seen_emails and not is_junk_email(email_clean):
            contacts.emails.append(email)
            seen_emails.add(email_clean)
    
    # 2. Extract tel links
    tel_matches = TEL_REGEX.findall(html)
    for phone in tel_matches:
        phone_clean = clean_phone(phone)
        if phone_clean:
            phone_digits = re.sub(r'[^\d]', '', phone_clean)
            if phone_digits not in seen_phones:
                contacts.phones.append(phone_clean)
                seen_phones.add(phone_digits)
    
    # 3. Regex fallback for emails in text
    text_emails = EMAIL_REGEX.findall(html)
    for email in text_emails:
        email_clean = email.lower().strip()
        if email_clean not in seen_emails and not is_junk_email(email_clean):
            contacts.emails.append(email)
            seen_emails.add(email_clean)
    
    # 4. Regex fallback for phones in text
    text_phones = PHONE_REGEX.findall(html)
    for phone in text_phones:
        phone_clean = clean_phone(phone)
        if phone_clean:
            phone_digits = re.sub(r'[^\d]', '', phone_clean)
            if phone_digits not in seen_phones:
                contacts.phones.append(phone_clean)
                seen_phones.add(phone_digits)
    
    # 5. Extract social links
    link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
    links = link_pattern.findall(html)
    
    for link in links:
        link_lower = link.lower()
        if not contacts.linkedin and 'linkedin.com/' in link_lower:
            if '/company/' in link_lower or '/in/' in link_lower:
                contacts.linkedin = link
        elif not contacts.twitter and ('twitter.com/' in link_lower or 'x.com/' in link_lower):
            contacts.twitter = link
        elif not contacts.facebook and 'facebook.com/' in link_lower:
            contacts.facebook = link
    
    # Limit to 2 emails and 2 phones
    contacts.emails = contacts.emails[:2]
    contacts.phones = contacts.phones[:2]
    
    return contacts


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


def extract_base_url(url: str) -> str:
    """Extract base URL (scheme + netloc) from a URL."""
    try:
        if '://' not in url:
            url = f'https://{url}'
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return url


# ============================================
# SUBLINK EXTRACTION FOR CONTACT PAGES
# ============================================

# Keywords that indicate a link might lead to a contact page
CONTACT_PATH_KEYWORDS = [
    'contact', 'about', 'team', 'reach', 'touch', 
    'support', 'help', 'info', 'inquir', 'connect',
    'get-in', 'getintouch', 'email', 'mail'
]


def extract_contact_links(html: str, base_url: str, max_links: int = 3) -> List[str]:
    """
    Extract internal links from HTML that look like contact pages.
    
    Uses the href links already extracted from HTML and filters for
    paths containing contact-related keywords.
    
    Args:
        html: Raw HTML content
        base_url: Base URL of the page (e.g., https://example.com)
        max_links: Maximum number of contact links to return
    
    Returns:
        List of full URLs to potential contact pages
    """
    if not html or not base_url:
        return []
    
    # Extract all href links
    link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
    links = link_pattern.findall(html)
    
    # Parse the base URL
    try:
        parsed_base = urlparse(base_url)
        base_domain = parsed_base.netloc.lower()
        if base_domain.startswith('www.'):
            base_domain = base_domain[4:]
    except Exception:
        return []
    
    contact_links = []
    seen_paths = set()
    
    for link in links:
        link_lower = link.lower().strip()
        
        # Skip empty, javascript, or anchor-only links
        if not link_lower or link_lower.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
            continue
        
        # Check if link path contains any contact keyword
        has_contact_keyword = any(keyword in link_lower for keyword in CONTACT_PATH_KEYWORDS)
        if not has_contact_keyword:
            continue
        
        # Build full URL
        try:
            if link.startswith('//'):
                full_url = f"https:{link}"
            elif link.startswith('/'):
                full_url = f"{base_url.rstrip('/')}{link}"
            elif link.startswith('http'):
                full_url = link
            else:
                full_url = f"{base_url.rstrip('/')}/{link}"
            
            # Parse and validate it's the same domain (internal link)
            parsed_link = urlparse(full_url)
            link_domain = parsed_link.netloc.lower()
            if link_domain.startswith('www.'):
                link_domain = link_domain[4:]
            
            # Only keep internal links (same domain)
            if link_domain != base_domain:
                continue
            
            # Normalize path for deduplication
            path = parsed_link.path.lower().rstrip('/')
            if path in seen_paths:
                continue
            seen_paths.add(path)
            
            contact_links.append(full_url)
            
            if len(contact_links) >= max_links:
                break
                
        except Exception:
            continue
    
    return contact_links


# ============================================
# ZENROWS CLIENT (Simplified with mode=auto)
# ============================================

@dataclass
class ScrapeResult:
    """Result of a scraping attempt."""
    success: bool
    url: str
    contacts: ExtractedContacts
    classification: str
    error: Optional[str] = None
    html: Optional[str] = None  # Raw HTML (only populated when needed for sublink extraction)
    sublinks_scraped: int = 0  # Number of sublinks scraped for this URL


class RateLimiter:
    """
    Token bucket rate limiter for controlling requests per second.
    """
    
    def __init__(self, rate: float = 30.0):
        """
        Initialize rate limiter.
        
        Args:
            rate: Maximum requests per second (default 30)
        """
        self.rate = rate
        self.tokens = rate
        self.last_update = asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """Wait until a token is available, then consume it."""
        async with self._lock:
            now = asyncio.get_event_loop().time()
            
            # Refill tokens based on time elapsed
            time_passed = now - self.last_update
            self.tokens = min(self.rate, self.tokens + time_passed * self.rate)
            self.last_update = now
            
            if self.tokens < 1:
                # Wait for token to become available
                wait_time = (1 - self.tokens) / self.rate
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1


class ZenRowsClient:
    """
    ZenRows API client using Adaptive Stealth Mode (mode=auto).
    
    Features:
    - Concurrency limit via semaphore (default 40)
    - Rate limit of 30 requests per second
    - Retry logic for 429 errors with exponential backoff
    """
    
    # Retry configuration
    MAX_RETRIES = 3
    INITIAL_BACKOFF = 1.0  # seconds
    MAX_BACKOFF = 10.0  # seconds
    
    def __init__(
        self,
        api_key: str,
        concurrency_limit: int = MAX_CONCURRENT_REQUESTS,
        rate_limit: float = 30.0,
    ):
        """
        Initialize ZenRows client.
        
        Args:
            api_key: ZenRows API key
            concurrency_limit: Max concurrent requests (default 40)
            rate_limit: Max requests per second (default 30)
        """
        self.api_key = api_key
        self.semaphore = asyncio.Semaphore(concurrency_limit)
        self.rate_limiter = RateLimiter(rate=rate_limit)
        self.http_client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self.http_client = httpx.AsyncClient(
            timeout=60.0,
            limits=httpx.Limits(max_connections=MAX_CONCURRENT_REQUESTS, max_keepalive_connections=20)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.http_client:
            await self.http_client.aclose()
    
    async def _make_request(self, url: str) -> httpx.Response:
        """
        Make a single HTTP request to ZenRows API.
        Waits for rate limiter before sending.
        """
        # Wait for rate limiter
        await self.rate_limiter.acquire()
        
        params = {
            "apikey": self.api_key,
            "url": url,
            "mode": "auto",
        }
        
        return await self.http_client.get(ZENROWS_API_URL, params=params)
    
    async def scrape_url(self, url: str, return_html: bool = False) -> ScrapeResult:
        """
        Scrape a URL using ZenRows Adaptive Stealth Mode (mode=auto).
        
        Features:
        - Rate limited to 30 req/sec
        - Retries 429 errors with exponential backoff (up to 3 retries)
        - Respects concurrency limit via semaphore
        
        Args:
            url: URL to scrape
            return_html: If True, include raw HTML in result (for sublink extraction)
        
        Returns:
            ScrapeResult with contacts and metadata
        """
        async with self.semaphore:
            retries = 0
            backoff = self.INITIAL_BACKOFF
            
            while True:
                try:
                    logger.debug(f"Scraping {url} with mode=auto (attempt {retries + 1})")
                    
                    response = await self._make_request(url)
                    
                    if response.status_code == 200:
                        html = response.text
                        
                        # Check if we got meaningful content
                        if not html or len(html.strip()) < 100:
                            return ScrapeResult(
                                success=False,
                                url=url,
                                contacts=ExtractedContacts(),
                                classification="NO_CONTENT",
                                error="Empty or minimal response",
                            )
                        
                        # Extract contacts from HTML
                        contacts = extract_contacts_from_html(html)
                        
                        return ScrapeResult(
                            success=True,
                            url=url,
                            contacts=contacts,
                            classification="SUCCESS",
                            html=html if return_html else None,
                        )
                    
                    elif response.status_code == 422:
                        # Unprocessable - URL is invalid/unreachable, no retry
                        return ScrapeResult(
                            success=False,
                            url=url,
                            contacts=ExtractedContacts(),
                            classification="UNPROCESSABLE",
                            error="ZenRows could not process URL (422)",
                        )
                    
                    elif response.status_code == 429:
                        # Rate limited - retry with backoff
                        retries += 1
                        if retries > self.MAX_RETRIES:
                            logger.warning(f"Max retries ({self.MAX_RETRIES}) exceeded for {url}")
                            return ScrapeResult(
                                success=False,
                                url=url,
                                contacts=ExtractedContacts(),
                                classification="RATE_LIMITED",
                                error=f"Rate limited after {self.MAX_RETRIES} retries",
                            )
                        
                        logger.debug(f"Rate limited on {url}, retry {retries}/{self.MAX_RETRIES} after {backoff:.1f}s")
                        await asyncio.sleep(backoff)
                        backoff = min(backoff * 2, self.MAX_BACKOFF)
                        continue  # Retry
                    
                    else:
                        # Other HTTP errors - no retry
                        return ScrapeResult(
                            success=False,
                            url=url,
                            contacts=ExtractedContacts(),
                            classification="ERROR",
                            error=f"HTTP {response.status_code}",
                        )
                        
                except httpx.TimeoutException:
                    # Timeout - retry with backoff
                    retries += 1
                    if retries > self.MAX_RETRIES:
                        logger.warning(f"Timeout after {self.MAX_RETRIES} retries for {url}")
                        return ScrapeResult(
                            success=False,
                            url=url,
                            contacts=ExtractedContacts(),
                            classification="TIMEOUT",
                            error=f"Timeout after {self.MAX_RETRIES} retries",
                        )
                    
                    logger.debug(f"Timeout on {url}, retry {retries}/{self.MAX_RETRIES} after {backoff:.1f}s")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, self.MAX_BACKOFF)
                    continue  # Retry
                    
                except Exception as e:
                    logger.error(f"Error scraping {url}: {e}")
                    return ScrapeResult(
                        success=False,
                        url=url,
                        contacts=ExtractedContacts(),
                        classification="ERROR",
                        error=str(e),
                    )
    
    async def scrape_url_with_fallback(
        self, 
        url: str, 
        enable_sublink: bool = True,
        max_sublinks: int = 3
    ) -> Tuple[ScrapeResult, int]:
        """
        Scrape a URL with optional sublink fallback for contact pages.
        
        If main page is successfully scraped but has no emails, this method
        extracts contact-related links from the HTML and scrapes them.
        
        Args:
            url: URL to scrape
            enable_sublink: Whether to try sublinks if no email found
            max_sublinks: Maximum number of sublinks to try
        
        Returns:
            Tuple of (ScrapeResult, api_calls_made)
        """
        api_calls = 1
        
        # Scrape main page (with HTML if sublink scraping is enabled)
        result = await self.scrape_url(url, return_html=enable_sublink)
        
        # If successful but no emails found, and sublink scraping is enabled
        if (result.success and 
            not result.contacts.emails and 
            enable_sublink and 
            result.html):
            
            # Extract contact page links from the HTML
            base_url = extract_base_url(url)
            contact_links = extract_contact_links(result.html, base_url, max_links=max_sublinks)
            
            if contact_links:
                logger.debug(f"No email on {url}, trying {len(contact_links)} sublinks: {contact_links}")
                
                # Try each contact link until we find an email
                for sublink in contact_links:
                    api_calls += 1
                    sublink_result = await self.scrape_url(sublink, return_html=False)
                    
                    if sublink_result.success and sublink_result.contacts.emails:
                        # Found emails! Merge contacts back to main result
                        result.contacts.emails = sublink_result.contacts.emails
                        # Only update phones if we didn't have any
                        if not result.contacts.phones and sublink_result.contacts.phones:
                            result.contacts.phones = sublink_result.contacts.phones
                        result.classification = "SUBLINK_SUCCESS"
                        result.sublinks_scraped = api_calls - 1
                        logger.debug(f"Found email via sublink {sublink} for {url}")
                        break
                else:
                    # No emails found in any sublink
                    result.sublinks_scraped = api_calls - 1
        
        # Clear HTML from result to save memory
        result.html = None
        
        return result, api_calls


# ============================================
# HEALTH CHECK
# ============================================

async def check_zenrows_health(api_key: str) -> Tuple[bool, str]:
    """
    Check if ZenRows API is accessible and API key is valid.
    
    Returns:
        Tuple of (is_healthy, message)
    """
    if not api_key:
        return False, "ZENROWS_API_KEY not configured"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Make a minimal request to test auth using mode=auto
            params = {
                "apikey": api_key,
                "url": "https://httpbin.org/ip",
                "mode": "auto",
            }
            response = await client.get(ZENROWS_API_URL, params=params)
            
            if response.status_code == 200:
                return True, "ZenRows API connected (mode=auto)"
            elif response.status_code == 401:
                return False, "Invalid ZenRows API key"
            elif response.status_code == 402:
                return False, "ZenRows account has insufficient credits"
            else:
                return False, f"ZenRows API returned status {response.status_code}"
                
    except httpx.TimeoutException:
        return False, "ZenRows API timeout"
    except Exception as e:
        return False, f"ZenRows API error: {str(e)}"
