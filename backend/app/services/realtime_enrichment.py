"""
Real-time single-email enrichment service.

Mirrors the Node.js processPersonWithEarlyExit flow:
  - Cache lookup → catchall fast-path → 8-permutation early-exit → lead INSERT
  - retry-with-fallback across healthy MailTester keys
  - 45 s wall-clock guard (returns not_found on timeout)
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.mailtester_client import MailTesterClient
from app.services.mailtester_rate_limiter import MailTesterRateLimiter
from app.services.permutation import generate_email_permutations, normalize_domain

import redis as sync_redis
import time as _time
from app.core.config import settings as _settings

logger = logging.getLogger(__name__)


def extract_provider_from_mx(mx_hostname: str) -> str:
    if not mx_hostname or not mx_hostname.strip():
        return "other"
    mx = mx_hostname.lower()
    if "mail.protection.outlook.com" in mx or "outlook.com" in mx:
        return "outlook"
    if ".google.com" in mx or ".gmail.com" in mx:
        return "google"
    return "other"


@dataclass
class EnrichmentResult:
    email: str = ""
    status: str = "not_found"
    pattern: Optional[str] = None
    mx_provider: Optional[str] = None
    mx_record: Optional[str] = None
    first_name: str = ""
    last_name: str = ""
    domain: str = ""


async def _verify_with_fallback(
    email: str,
    preferred_key: str,
    rate_limiter: MailTesterRateLimiter,
    client: MailTesterClient,
) -> dict:
    """
    Try preferred_key first. On API error, rotate to another healthy key (once).
    Always tracks usage + errors in Redis.
    """
    keys_tried = set()

    async def _attempt(api_key: str) -> dict:
        keys_tried.add(api_key)
        acquired = await rate_limiter.acquire_for_key(api_key, timeout_seconds=30.0)
        if not acquired:
            return {"status": "unverified", "email": email, "message": "rate-limit timeout", "mx": ""}

        result = await client.verify_email(email, api_key=api_key)

        # Dead key → bench immediately, don't count it as usage (no work was done).
        if result.get("key_dead"):
            await rate_limiter.mark_key_unhealthy(api_key)
            return result

        await rate_limiter.track_api_usage(api_key)

        # Our-side failure (rate-limit/error exhaustion) counts against key health.
        if result.get("status") == "unverified":
            await rate_limiter.track_key_error(api_key)
        return result

    def _should_rotate(r: dict) -> bool:
        # Rotate to another key when the answer is non-definitive:
        #   key_dead     — key is broken
        #   unverified   — our-side failure
        #   inconclusive — timeout / spam block / mx error; a different IP may clear it
        return bool(r.get("key_dead")) or r.get("status") in ("unverified", "inconclusive")

    result = await _attempt(preferred_key)

    if _should_rotate(result):
        for alt_key in rate_limiter.api_keys:
            if alt_key in keys_tried:
                continue
            if not await rate_limiter.is_key_healthy(alt_key):
                continue
            result = await _attempt(alt_key)
            if not _should_rotate(result):
                break

    return result


def _build_enrichment_key(first: str, last: str, domain: str) -> str:
    return f"{first.lower()}_{last.lower()}_{domain.lower()}"


async def _cache_lookup(db: Session, enrichment_key: str, loop: asyncio.AbstractEventLoop) -> Optional[dict]:
    """Check leads table for a cached final result."""
    def _query():
        row = db.execute(
            text(
                "SELECT email, pattern_used, verification_status, mx_record, mx_provider "
                "FROM leads "
                "WHERE enrichment_key = :ek AND is_final_result = true "
                "AND verification_status = 'valid' "
                "ORDER BY created_at DESC LIMIT 1"
            ),
            {"ek": enrichment_key},
        ).fetchone()
        return row

    row = await loop.run_in_executor(None, _query)
    if row:
        return {
            "email": row[0],
            "pattern": row[1],
            "status": row[2],
            "mx_record": row[3],
            "mx_provider": row[4],
        }
    return None


async def _insert_lead(
    db: Session,
    user_id: str,
    first_name: str,
    last_name: str,
    domain: str,
    enrichment_key: str,
    result: EnrichmentResult,
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Persist the enrichment result to the leads table for cache + analytics."""
    def _insert():
        db.execute(
            text(
                "INSERT INTO leads "
                "(user_id, first_name, last_name, domain, email, pattern_used, "
                "verification_status, mx_record, mx_provider, enrichment_key, is_final_result) "
                "VALUES (:uid, :fn, :ln, :d, :email, :pat, :status, :mx, :mxp, :ek, true)"
            ),
            {
                "uid": user_id,
                "fn": first_name,
                "ln": last_name,
                "d": domain,
                "email": result.email,
                "pat": result.pattern,
                "status": result.status,
                "mx": result.mx_record or "",
                "mxp": result.mx_provider,
                "ek": enrichment_key,
            },
        )
        db.commit()
    try:
        await loop.run_in_executor(None, _insert)
    except Exception:
        logger.exception("Failed to insert lead record for %s", enrichment_key)


async def enrich_single(
    first_name: str,
    last_name: str,
    domain: str,
    user_id: str,
    db: Session,
    rate_limiter: MailTesterRateLimiter,
    client: MailTesterClient,
    timeout_seconds: float = 45.0,
) -> EnrichmentResult:
    """
    Full single-email enrichment with early-exit logic identical to dashboard:
      valid found   → return immediately
      catchall found → return immediately (first one wins)
      timeout       → return not_found (email empty)
      all exhausted → return not_found (email empty)
    """
    loop = asyncio.get_event_loop()
    result = EnrichmentResult(first_name=first_name, last_name=last_name, domain=domain)
    enrichment_key = _build_enrichment_key(first_name, last_name, domain)

    try:
        return await asyncio.wait_for(
            _enrich_inner(
                first_name, last_name, domain, user_id, db,
                rate_limiter, client, loop, result, enrichment_key,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning("Enrichment timed out after %.0fs for %s", timeout_seconds, enrichment_key)
        result.status = "not_found"
        result.email = ""
        return result


async def _enrich_inner(
    first_name: str,
    last_name: str,
    domain: str,
    user_id: str,
    db: Session,
    rate_limiter: MailTesterRateLimiter,
    client: MailTesterClient,
    loop: asyncio.AbstractEventLoop,
    result: EnrichmentResult,
    enrichment_key: str,
) -> EnrichmentResult:
    # ── Step 1: Cache lookup with re-verification ──
    cached = await _cache_lookup(db, enrichment_key, loop)
    if cached:
        api_key = await rate_limiter.get_best_key()
        if api_key:
            vr = await _verify_with_fallback(cached["email"], api_key, rate_limiter, client)
            status = vr.get("status", "invalid")
            mx_raw = vr.get("mx", "")

            if status == "valid":
                result.email = cached["email"]
                result.status = "valid"
                result.pattern = cached["pattern"]
                result.mx_record = mx_raw
                result.mx_provider = extract_provider_from_mx(mx_raw)
                return result

            if status == "catchall":
                result.email = cached["email"]
                result.status = "catchall"
                result.pattern = cached["pattern"]
                result.mx_record = mx_raw
                result.mx_provider = extract_provider_from_mx(mx_raw)
                return result
        # Re-verify failed or no API key available → fall through to permutations

    # ── Step 2: 8-permutation early-exit ──
    perms = generate_email_permutations(first_name, last_name, domain)
    if not perms:
        result.status = "not_found"
        return result

    api_key = await rate_limiter.get_best_key()
    if not api_key:
        logger.error("No MailTester keys with remaining capacity")
        _notify_admin_mailtester_exhausted()
        result.status = "not_found"
        return result

    best_inconclusive = None  # (email, pattern, mx) fallback when no clean verdict

    for perm in perms:
        email = perm["email"]
        pattern = perm["pattern"]

        vr = await _verify_with_fallback(email, api_key, rate_limiter, client)
        status = vr.get("status", "invalid")
        mx_raw = vr.get("mx", "")

        if status == "valid":
            result.email = email
            result.status = "valid"
            result.pattern = pattern
            result.mx_record = mx_raw
            result.mx_provider = extract_provider_from_mx(mx_raw)
            await _insert_lead(db, user_id, first_name, last_name, domain, enrichment_key, result, loop)
            return result

        if status == "catchall":
            result.email = email
            result.status = "catchall"
            result.pattern = pattern
            result.mx_record = mx_raw
            result.mx_provider = extract_provider_from_mx(mx_raw)
            await _insert_lead(db, user_id, first_name, last_name, domain, enrichment_key, result, loop)
            return result

        # Inconclusive (timeout / spam block / mx error / limited): the server
        # wouldn't give a clean answer. A single timeout used to abort the whole
        # person as not_found — instead keep it as a fallback candidate and keep
        # scanning the remaining permutations for a real valid/catchall.
        if status == "inconclusive" and best_inconclusive is None:
            best_inconclusive = (email, pattern, mx_raw)
        # invalid / unverified → continue to the next permutation

    # No confirmed valid/catchall. If any permutation was inconclusive, settle as
    # a (re-verifiable) catchall rather than discarding the person as not_found.
    if best_inconclusive is not None:
        b_email, b_pattern, b_mx = best_inconclusive
        result.email = b_email
        result.status = "catchall"
        result.pattern = b_pattern
        result.mx_record = b_mx
        result.mx_provider = extract_provider_from_mx(b_mx)
        await _insert_lead(db, user_id, first_name, last_name, domain, enrichment_key, result, loop)
        return result

    # All permutations exhausted, all genuine negatives — not_found
    result.status = "not_found"
    result.email = ""
    await _insert_lead(db, user_id, first_name, last_name, domain, enrichment_key, result, loop)
    return result


def _notify_admin_mailtester_exhausted():
    """Send a deduped daily admin alert when all MailTester keys are exhausted."""
    try:
        r = sync_redis.from_url(_settings.REDIS_URL, decode_responses=True)
        today = _time.strftime("%Y-%m-%d")
        key = f"mailtester:daily_limit_alert:enrichment:{today}"
        if r.get(key):
            return
        r.set(key, "1", ex=86400)

        import sys, os
        workers_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'workers')
        if workers_path not in sys.path:
            sys.path.insert(0, os.path.abspath(workers_path))
        from email_utils import send_admin_daily_limit_email
        send_admin_daily_limit_email(
            service="MailTester (Enrichment API)",
            detail="All MailTester API keys have exhausted their daily capacity. "
                   "Real-time enrichment requests will return not_found until limits reset."
        )
    except Exception:
        logger.exception("Failed to send MailTester daily limit admin alert")
