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


class ZenRowsClient:
    """
    ZenRows API client using Adaptive Stealth Mode (mode=auto).
    
    No tier escalation - ZenRows automatically handles anti-bot detection.
    """
    
    def __init__(
        self,
        api_key: str,
        concurrency_limit: int = MAX_CONCURRENT_REQUESTS,
    ):
        """
        Initialize ZenRows client.
        
        Args:
            api_key: ZenRows API key
            concurrency_limit: Max concurrent requests (default 40)
        """
        self.api_key = api_key
        self.semaphore = asyncio.Semaphore(concurrency_limit)
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
    
    async def scrape_url(self, url: str) -> ScrapeResult:
        """
        Scrape a URL using ZenRows Adaptive Stealth Mode (mode=auto).
        
        Single API call - ZenRows automatically selects the best scraping approach.
        
        Args:
            url: URL to scrape
        
        Returns:
            ScrapeResult with contacts and metadata
        """
        async with self.semaphore:
            try:
                # Build request URL with mode=auto (Adaptive Stealth Mode)
                # Using the exact curl format provided:
                # curl "https://api.zenrows.com/v1/?apikey=XXX&url=YYY&mode=auto"
                params = {
                    "apikey": self.api_key,
                    "url": url,
                    "mode": "auto",  # Adaptive Stealth Mode
                }
                
                logger.debug(f"Scraping {url} with mode=auto")
                
                response = await self.http_client.get(ZENROWS_API_URL, params=params)
                
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
                    
                    # Extract contacts from HTML using our Python extraction
                    contacts = extract_contacts_from_html(html)
                    
                    return ScrapeResult(
                        success=True,
                        url=url,
                        contacts=contacts,
                        classification="SUCCESS",
                    )
                
                elif response.status_code == 422:
                    # Unprocessable - URL might be invalid or unreachable
                    return ScrapeResult(
                        success=False,
                        url=url,
                        contacts=ExtractedContacts(),
                        classification="UNPROCESSABLE",
                        error=f"ZenRows could not process URL (422)",
                    )
                
                elif response.status_code == 429:
                    # Rate limited
                    return ScrapeResult(
                        success=False,
                        url=url,
                        contacts=ExtractedContacts(),
                        classification="RATE_LIMITED",
                        error="Rate limited by ZenRows",
                    )
                
                else:
                    return ScrapeResult(
                        success=False,
                        url=url,
                        contacts=ExtractedContacts(),
                        classification="ERROR",
                        error=f"HTTP {response.status_code}",
                    )
                    
            except httpx.TimeoutException:
                logger.warning(f"Timeout scraping {url}")
                return ScrapeResult(
                    success=False,
                    url=url,
                    contacts=ExtractedContacts(),
                    classification="TIMEOUT",
                    error="Request timeout",
                )
            except Exception as e:
                logger.error(f"Error scraping {url}: {e}")
                return ScrapeResult(
                    success=False,
                    url=url,
                    contacts=ExtractedContacts(),
                    classification="ERROR",
                    error=str(e),
                )


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
