# ZenRows Fallback Logic (Disabled - For Future Reference)

This document describes the contact page fallback system that was implemented but is currently disabled for performance testing.

## Overview

When scraping a website for contact information (emails/phones), if the homepage returns zero contacts, the system can automatically try common contact page paths before giving up.

## Fallback Paths

The following paths are tried in order if the homepage has no contacts:

1. `/contact`
2. `/contact-us`
3. `/about`
4. `/about-us`

The system stops as soon as any page returns at least one email or phone number.

## Session Persistence

- Uses ZenRows `session_id` parameter to maintain the same IP address across all requests for a domain
- This prevents the website from seeing requests from different IPs (which could trigger blocking)
- Session ID is derived from the domain name (first 8 characters)

## Tier Escalation Logic

Each tier costs more credits but has better success against protected sites:

| Tier | Credits | Parameters | Use Case |
|------|---------|------------|----------|
| 1 - Basic | 1 | None | Simple static sites |
| 2 - JS Render | 5 | `js_render=true`, `wait=2000` | JavaScript-heavy sites |
| 3 - Premium Proxy | 10 | JS + `premium_proxy=true` | Sites blocking datacenter IPs |
| 4 - Residential US | 25 | JS + premium + `proxy_country=us`, `wait=3000` | Heavily protected US sites |

### Escalation Rules

- **BLOCKED response**: Escalate to next tier (access denied, captcha, rate limit)
- **JS_REQUIRED response**: Jump to Tier 2 minimum (page needs JavaScript)
- **SUCCESS with no contacts**: Do NOT escalate - the page just doesn't have contacts
- **ERROR/NO_CONTENT**: Do NOT escalate - the page doesn't exist or is broken

## Domain Intelligence Caching

- Redis caches which tier works for each domain (key: `zenrows:domain:tier:{domain}`)
- Default TTL: 7 days (604800 seconds)
- On subsequent requests to the same domain, starts at the cached tier instead of Tier 1
- Saves credits by skipping tiers known to fail

## Code Location

The fallback logic is implemented in:
- `workers/zenrows_client.py` - `scrape_with_fallback()` method
- Contact paths defined in `CONTACT_PATHS` constant

## Re-enabling Fallback

To re-enable fallback scraping, in `workers/website_scraper_worker.py`, change:

```python
result = await zenrows.scrape_url(url, starting_tier=1, session_id=job_id[:8])
```

back to:

```python
result = await zenrows.scrape_with_fallback(url, session_id=job_id[:8])
```

## Credit Cost Estimates

Without fallback:
- Best case: 1 credit per URL (Tier 1 works)
- Worst case: 41 credits per URL (all tiers fail)

With fallback (up to 5 pages per domain):
- Best case: 1 credit per URL
- Worst case: 205 credits per URL (all tiers × all pages)

This is why fallback is disabled during initial testing - to understand baseline costs first.
