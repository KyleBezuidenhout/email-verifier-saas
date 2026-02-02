#!/usr/bin/env python3
"""
ZenRows API Client for Website Contact Scraping

Implements tiered scraping strategy:
- Tier 1: Basic (1 credit) - No JS rendering, no proxy
- Tier 2: JS Render (5 credits) - JavaScript rendering enabled
- Tier 3: Premium Proxy (10 credits) - JS + Premium residential proxy
- Tier 4: Residential (25 credits) - JS + Premium proxy + US geotargeting

Features:
- Domain intelligence caching (Redis) - remembers which tier works for each domain
- Response classification (blocked, JS-required, success, no-content)
- Contact page fallback (/contact, /contact-us, /about)
- Built-in rate limiting via asyncio.Semaphore
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple, Any
from urllib.parse import urlparse, urljoin
import httpx
import redis

logger = logging.getLogger(__name__)

# ============================================
# TIER CONFIGURATION
# ============================================

@dataclass
class ScrapingTier:
    """Configuration for a scraping tier."""
    level: int
    credits: int
    params: Dict[str, Any]
    name: str

# Tiered scraping configuration - escalate only on failure
SCRAPING_TIERS = [
    ScrapingTier(level=1, credits=1, params={}, name="Basic"),
    ScrapingTier(level=2, credits=5, params={"js_render": "true", "wait": "2000"}, name="JS Render"),
    ScrapingTier(level=3, credits=10, params={"js_render": "true", "premium_proxy": "true", "wait": "2000"}, name="Premium Proxy"),
    ScrapingTier(level=4, credits=25, params={"js_render": "true", "premium_proxy": "true", "proxy_country": "us", "wait": "3000"}, name="Residential US"),
]

# Contact page fallback paths (tried if homepage has 0 contacts)
CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/about-us"]

# ZenRows API endpoint
ZENROWS_API_URL = "https://api.zenrows.com/v1/"

# ============================================
# RESPONSE CLASSIFICATION
# ============================================

class ResponseClassification:
    SUCCESS = "SUCCESS"           # Got valid HTML content
    BLOCKED = "BLOCKED"           # Access denied, need higher tier
    JS_REQUIRED = "JS_REQUIRED"   # Page requires JavaScript rendering
    NO_CONTENT = "NO_CONTENT"     # Page loaded but empty/error page
    ERROR = "ERROR"               # Request failed


def classify_response(html: Optional[str], status_code: int) -> str:
    """
    Classify the scraping response to determine next action.
    
    CRITICAL: If we get valid HTML but no contacts, return SUCCESS (don't escalate).
    The contacts just don't exist on that page.
    """
    # HTTP-level failures
    if status_code == 403 or status_code == 429:
        return ResponseClassification.BLOCKED
    
    if status_code >= 400:
        return ResponseClassification.ERROR
    
    # No content at all
    if not html or len(html.strip()) < 100:
        return ResponseClassification.NO_CONTENT
    
    html_lower = html.lower()
    
    # Blocked patterns - need to escalate tier
    blocked_patterns = [
        'access denied',
        '403 forbidden',
        'rate limit',
        'too many requests',
        'captcha',
        'cloudflare',
        'ddos protection',
        'verify you are human',
        'please complete the security check',
        'blocked',
        'unusual traffic',
    ]
    
    for pattern in blocked_patterns:
        if pattern in html_lower:
            return ResponseClassification.BLOCKED
    
    # JS required patterns - only if page is suspiciously short
    if len(html) < 5000:
        js_required_patterns = [
            'please enable javascript',
            'javascript is required',
            'javascript must be enabled',
            'this site requires javascript',
            '__next_data__',  # Next.js placeholder
            'window.__initial_state__',  # React hydration
            'loading...</div>',
            '<noscript>',
        ]
        
        for pattern in js_required_patterns:
            if pattern in html_lower:
                return ResponseClassification.JS_REQUIRED
    
    # If we got here, we have valid content
    return ResponseClassification.SUCCESS


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


def extract_contacts_from_response(data: Dict[str, Any]) -> ExtractedContacts:
    """
    Extract contacts from ZenRows response.
    
    ZenRows can return structured data via 'output' param, or we parse HTML.
    Prioritizes:
    1. ZenRows built-in email/phone extraction
    2. mailto: and tel: links
    3. Regex on page text
    """
    contacts = ExtractedContacts()
    seen_emails = set()
    seen_phones = set()
    
    # 1. ZenRows built-in extraction (if available)
    zenrows_emails = data.get('emails', [])
    zenrows_phones = data.get('phones', [])
    
    for email in zenrows_emails:
        if isinstance(email, str):
            email_clean = email.lower().strip()
            if email_clean not in seen_emails and not is_junk_email(email_clean):
                contacts.emails.append(email)
                seen_emails.add(email_clean)
    
    for phone in zenrows_phones:
        if isinstance(phone, str):
            phone_clean = clean_phone(phone)
            if phone_clean:
                phone_digits = re.sub(r'[^\d]', '', phone_clean)
                if phone_digits not in seen_phones:
                    contacts.phones.append(phone_clean)
                    seen_phones.add(phone_digits)
    
    # 2. Parse HTML for mailto/tel links and regex (if we have HTML)
    html = data.get('html', '')
    if html:
        # Extract mailto links (highest priority)
        mailto_matches = MAILTO_REGEX.findall(html)
        for email in mailto_matches:
            email_clean = email.lower().strip()
            if email_clean not in seen_emails and not is_junk_email(email_clean):
                contacts.emails.append(email)
                seen_emails.add(email_clean)
        
        # Extract tel links
        tel_matches = TEL_REGEX.findall(html)
        for phone in tel_matches:
            phone_clean = clean_phone(phone)
            if phone_clean:
                phone_digits = re.sub(r'[^\d]', '', phone_clean)
                if phone_digits not in seen_phones:
                    contacts.phones.append(phone_clean)
                    seen_phones.add(phone_digits)
        
        # Regex fallback for emails in text
        text_emails = EMAIL_REGEX.findall(html)
        for email in text_emails:
            email_clean = email.lower().strip()
            if email_clean not in seen_emails and not is_junk_email(email_clean):
                contacts.emails.append(email)
                seen_emails.add(email_clean)
        
        # Regex fallback for phones in text
        text_phones = PHONE_REGEX.findall(html)
        for phone in text_phones:
            phone_clean = clean_phone(phone)
            if phone_clean:
                phone_digits = re.sub(r'[^\d]', '', phone_clean)
                if phone_digits not in seen_phones:
                    contacts.phones.append(phone_clean)
                    seen_phones.add(phone_digits)
        
        # Extract social links
        links = data.get('links', [])
        if not links:
            # Parse links from HTML
            link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
            links = link_pattern.findall(html)
        
        for link in links:
            if isinstance(link, str):
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


# ============================================
# DOMAIN INTELLIGENCE CACHE
# ============================================

class DomainCache:
    """
    Redis-based cache for domain tier intelligence.
    
    Remembers which scraping tier works for each domain to avoid
    wasting credits on tiers that will fail.
    """
    
    def __init__(self, redis_client: redis.Redis, ttl_seconds: int = 604800):
        """
        Initialize domain cache.
        
        Args:
            redis_client: Redis connection
            ttl_seconds: Cache TTL in seconds (default 7 days)
        """
        self.redis = redis_client
        self.ttl = ttl_seconds
        self.prefix = "zenrows:domain:tier:"
    
    def get_tier(self, domain: str) -> Optional[int]:
        """Get cached minimum tier for a domain."""
        try:
            key = f"{self.prefix}{domain}"
            tier = self.redis.get(key)
            if tier:
                return int(tier)
        except Exception as e:
            logger.warning(f"Failed to get cached tier for {domain}: {e}")
        return None
    
    def set_tier(self, domain: str, tier: int):
        """Cache the minimum working tier for a domain."""
        try:
            key = f"{self.prefix}{domain}"
            self.redis.setex(key, self.ttl, tier)
            logger.debug(f"Cached tier {tier} for domain {domain}")
        except Exception as e:
            logger.warning(f"Failed to cache tier for {domain}: {e}")


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
# ZENROWS CLIENT
# ============================================

@dataclass
class ScrapeResult:
    """Result of a scraping attempt."""
    success: bool
    url: str
    contacts: ExtractedContacts
    tier_used: int
    credits_spent: int
    classification: str
    error: Optional[str] = None
    fallback_used: bool = False


class ZenRowsClient:
    """
    ZenRows API client with tiered scraping and domain caching.
    """
    
    def __init__(
        self,
        api_key: str,
        redis_client: redis.Redis,
        concurrency_limit: int = 50,
        cache_ttl: int = 604800,
    ):
        """
        Initialize ZenRows client.
        
        Args:
            api_key: ZenRows API key
            redis_client: Redis connection for domain caching
            concurrency_limit: Max concurrent requests (match your ZenRows plan)
            cache_ttl: Domain cache TTL in seconds
        """
        self.api_key = api_key
        self.semaphore = asyncio.Semaphore(concurrency_limit)
        self.domain_cache = DomainCache(redis_client, cache_ttl)
        self.http_client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self.http_client = httpx.AsyncClient(
            timeout=60.0,
            limits=httpx.Limits(max_connections=25, max_keepalive_connections=10)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.http_client:
            await self.http_client.aclose()
    
    async def _make_request(
        self,
        url: str,
        tier: ScrapingTier,
        session_id: Optional[str] = None,
    ) -> Tuple[int, Optional[str], Dict[str, Any]]:
        """
        Make a single ZenRows API request.
        
        Returns:
            Tuple of (status_code, html_content, parsed_data)
        """
        params = {
            "apikey": self.api_key,
            "url": url,
        }
        
        # Add tier-specific parameters
        params.update(tier.params)
        
        # Add session ID for maintaining IP across fallback pages
        if session_id:
            params["session_id"] = session_id
        
        try:
            response = await self.http_client.get(ZENROWS_API_URL, params=params)
            
            if response.status_code == 200:
                # Without json_response, ZenRows returns plain HTML
                html = response.text
                return response.status_code, html, {'html': html}
            else:
                return response.status_code, None, {}
                
        except httpx.TimeoutException:
            logger.warning(f"Timeout scraping {url} at tier {tier.level}")
            return 408, None, {}
        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            return 500, None, {}
    
    async def scrape_url(
        self,
        url: str,
        starting_tier: int = 1,
        session_id: Optional[str] = None,
    ) -> ScrapeResult:
        """
        Scrape a URL with tiered escalation.
        
        Args:
            url: URL to scrape
            starting_tier: Minimum tier to start at (1-4)
            session_id: Optional session ID for IP persistence
        
        Returns:
            ScrapeResult with contacts and metadata
        """
        async with self.semaphore:
            domain = extract_domain(url)
            
            # Check domain cache for minimum tier
            cached_tier = self.domain_cache.get_tier(domain)
            if cached_tier and cached_tier > starting_tier:
                starting_tier = cached_tier
                logger.debug(f"Using cached tier {cached_tier} for {domain}")
            
            total_credits = 0
            current_tier_idx = starting_tier - 1  # 0-indexed
            
            while current_tier_idx < len(SCRAPING_TIERS):
                tier = SCRAPING_TIERS[current_tier_idx]
                total_credits += tier.credits
                
                logger.debug(f"Scraping {url} at tier {tier.level} ({tier.name})")
                
                status_code, html, data = await self._make_request(url, tier, session_id)
                classification = classify_response(html, status_code)
                
                if classification == ResponseClassification.SUCCESS:
                    # Cache the successful tier
                    self.domain_cache.set_tier(domain, tier.level)
                    
                    contacts = extract_contacts_from_response(data)
                    return ScrapeResult(
                        success=True,
                        url=url,
                        contacts=contacts,
                        tier_used=tier.level,
                        credits_spent=total_credits,
                        classification=classification,
                    )
                
                elif classification == ResponseClassification.JS_REQUIRED:
                    # Jump to tier 2 if we're at tier 1
                    if current_tier_idx < 1:
                        current_tier_idx = 1
                    else:
                        current_tier_idx += 1
                    continue
                
                elif classification == ResponseClassification.BLOCKED:
                    # Escalate to next tier
                    current_tier_idx += 1
                    continue
                
                else:
                    # NO_CONTENT or ERROR - don't escalate, page just doesn't have what we need
                    return ScrapeResult(
                        success=False,
                        url=url,
                        contacts=ExtractedContacts(),
                        tier_used=tier.level,
                        credits_spent=total_credits,
                        classification=classification,
                        error=f"Response classification: {classification}",
                    )
            
            # All tiers exhausted
            return ScrapeResult(
                success=False,
                url=url,
                contacts=ExtractedContacts(),
                tier_used=SCRAPING_TIERS[-1].level,
                credits_spent=total_credits,
                classification=ResponseClassification.BLOCKED,
                error="All tiers exhausted, site still blocking",
            )
    
    async def scrape_with_fallback(
        self,
        url: str,
        session_id: Optional[str] = None,
    ) -> ScrapeResult:
        """
        Scrape URL with contact page fallback.
        
        If the main URL returns 0 emails AND 0 phones, tries common
        contact page paths before giving up.
        
        Args:
            url: Base URL to scrape
            session_id: Session ID for IP persistence across requests
        
        Returns:
            ScrapeResult with contacts from either main page or fallback
        """
        # Generate session ID if not provided (maintains same IP for fallback pages)
        if not session_id:
            session_id = extract_domain(url)[:8]
        
        # Try main URL first
        result = await self.scrape_url(url, starting_tier=1, session_id=session_id)
        
        # If we got contacts, we're done
        if result.contacts.has_contacts():
            return result
        
        # If scraping failed entirely, don't try fallbacks
        if not result.success:
            return result
        
        # Try contact pages
        try:
            if '://' not in url:
                url = f'https://{url}'
            parsed = urlparse(url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return result
        
        # Determine starting tier from main page result
        starting_tier = result.tier_used
        total_credits = result.credits_spent
        
        for path in CONTACT_PATHS:
            contact_url = urljoin(base_url, path)
            
            logger.debug(f"Trying contact fallback: {contact_url}")
            
            fallback_result = await self.scrape_url(
                contact_url,
                starting_tier=starting_tier,
                session_id=session_id,
            )
            
            total_credits += fallback_result.credits_spent
            
            if fallback_result.contacts.has_contacts():
                return ScrapeResult(
                    success=True,
                    url=url,  # Return original URL
                    contacts=fallback_result.contacts,
                    tier_used=fallback_result.tier_used,
                    credits_spent=total_credits,
                    classification=fallback_result.classification,
                    fallback_used=True,
                )
        
        # No contacts found anywhere
        return ScrapeResult(
            success=True,  # Scraping succeeded, just no contacts
            url=url,
            contacts=ExtractedContacts(),
            tier_used=result.tier_used,
            credits_spent=total_credits,
            classification=result.classification,
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
            # Make a minimal request to test auth
            params = {
                "apikey": api_key,
                "url": "https://httpbin.org/ip",
            }
            response = await client.get(ZENROWS_API_URL, params=params)
            
            if response.status_code == 200:
                return True, "ZenRows API connected"
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
