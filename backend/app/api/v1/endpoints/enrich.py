"""
POST /api/v1/enrich -- Single email enrichment endpoint.

Layers:
  0a. GlobalAdmissionControl   (Redis, auto-scales with num_keys)
  0b. UserConcurrencyManager   (Redis, per-user distributed semaphore)
   1. UserRateLimiter           (Redis, 5 req/s + 120 req/min sliding window)
   2. MailTester per-key rate   (acquireForKey inside enrichment service)
   3. 45 s wall-clock timeout   (asyncio.wait_for inside enrichment service)
"""
import asyncio
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.dependencies import get_current_user
from app.core.config import settings, ADMIN_EMAIL
from app.db.session import get_db
from app.models.user import User
from app.schemas.enrich import EnrichRequest, EnrichResponse
from app.services.mailtester_client import MailTesterClient
from app.services.mailtester_rate_limiter import (
    MailTesterRateLimiter,
    UserConcurrencyManager,
    GlobalAdmissionControl,
    UserRateLimiter,
)
from app.services.name_parser import parse_full_name
from app.services.permutation import normalize_domain
from app.services.realtime_enrichment import enrich_single

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Module-level singletons (initialised on first request) ──
_redis: aioredis.Redis | None = None
_mt_rate_limiter: MailTesterRateLimiter | None = None
_user_concurrency: UserConcurrencyManager | None = None
_global_admission: GlobalAdmissionControl | None = None
_user_rate_limiter: UserRateLimiter | None = None
_mt_client: MailTesterClient | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _get_mt_rate_limiter() -> MailTesterRateLimiter:
    global _mt_rate_limiter
    if _mt_rate_limiter is None:
        _mt_rate_limiter = MailTesterRateLimiter(_get_redis())
    return _mt_rate_limiter


def _get_user_concurrency() -> UserConcurrencyManager:
    global _user_concurrency
    if _user_concurrency is None:
        _user_concurrency = UserConcurrencyManager(
            _get_redis(),
            max_per_user=getattr(settings, "ENRICH_API_MAX_CONCURRENT_PER_USER", 5),
        )
    return _user_concurrency


def _get_global_admission() -> GlobalAdmissionControl:
    global _global_admission
    if _global_admission is None:
        _global_admission = GlobalAdmissionControl(
            _get_redis(),
            _get_mt_rate_limiter(),
            per_key_multiplier=getattr(settings, "ENRICH_API_CONCURRENT_PER_KEY", 10),
        )
    return _global_admission


def _get_user_rate_limiter() -> UserRateLimiter:
    global _user_rate_limiter
    if _user_rate_limiter is None:
        _user_rate_limiter = UserRateLimiter(
            _get_redis(),
            per_second=getattr(settings, "ENRICH_API_RATE_LIMIT_PER_SECOND", 5),
            per_minute=getattr(settings, "ENRICH_API_RATE_LIMIT_PER_MINUTE", 120),
        )
    return _user_rate_limiter


def _get_mt_client() -> MailTesterClient:
    global _mt_client
    if _mt_client is None:
        _mt_client = MailTesterClient()
    return _mt_client


async def shutdown_enrich() -> None:
    """Call from app shutdown event to close connections cleanly."""
    global _redis, _mt_client
    if _mt_client:
        await _mt_client.close()
        _mt_client = None
    if _redis:
        await _redis.close()
        _redis = None


def _is_admin(user: User) -> bool:
    return getattr(user, "is_admin", False) or user.email == ADMIN_EMAIL


@router.post("/enrich", response_model=EnrichResponse)
async def enrich_endpoint(
    body: EnrichRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loop = asyncio.get_event_loop()
    user_id = str(current_user.id)
    is_admin = _is_admin(current_user)

    # ── Parse name ──
    try:
        parsed = parse_full_name(
            name=body.name,
            first_name=body.first_name,
            last_name=body.last_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    domain = normalize_domain(body.company_website)
    if not domain:
        raise HTTPException(status_code=422, detail="Invalid company_website")

    # ── Layer 1: Per-user rate limit ──
    allowed, retry_after = await _get_user_rate_limiter().check(user_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Retry after {retry_after:.0f}s",
            headers={"Retry-After": str(int(retry_after))},
        )

    # ── Layer 0a: Global admission ──
    if not await _get_global_admission().acquire():
        raise HTTPException(
            status_code=503,
            detail="Service at capacity. Please retry in a few seconds.",
            headers={"Retry-After": "3"},
        )

    global_acquired = True
    user_acquired = False

    try:
        # ── Layer 0b: Per-user concurrency ──
        if not await _get_user_concurrency().acquire(user_id):
            raise HTTPException(
                status_code=429,
                detail="Too many concurrent enrichments. Please wait for previous requests to complete.",
                headers={"Retry-After": "2"},
            )
        user_acquired = True

        # ── Credit check (skip for admin) ──
        if not is_admin:
            def _check_credits():
                return db.execute(
                    text("SELECT credits FROM users WHERE id = :uid"),
                    {"uid": user_id},
                ).scalar()

            credits = await loop.run_in_executor(None, _check_credits)
            if credits is None or credits < 1:
                raise HTTPException(status_code=402, detail="Insufficient credits")

        # ── Enrich ──
        timeout = getattr(settings, "ENRICH_API_REQUEST_TIMEOUT_SECONDS", 45.0)
        result = await enrich_single(
            first_name=parsed.first_name,
            last_name=parsed.last_name,
            domain=domain,
            user_id=user_id,
            db=db,
            rate_limiter=_get_mt_rate_limiter(),
            client=_get_mt_client(),
            timeout_seconds=timeout,
        )

        # ── Credit deduction (skip for admin) ──
        credits_remaining = 0
        credits_used = 0
        if not is_admin:
            def _deduct():
                row = db.execute(
                    text(
                        "UPDATE users SET credits = GREATEST(0, credits - 1) "
                        "WHERE id = :uid AND credits >= 1 "
                        "RETURNING credits"
                    ),
                    {"uid": user_id},
                ).fetchone()
                db.commit()
                return row

            row = await loop.run_in_executor(None, _deduct)
            if row:
                credits_remaining = row[0]
                credits_used = 1
            else:
                logger.warning("TOCTOU: credits exhausted during enrichment for user %s", user_id)
                credits_remaining = 0
                credits_used = 1
        else:
            def _get_credits():
                return db.execute(
                    text("SELECT credits FROM users WHERE id = :uid"),
                    {"uid": user_id},
                ).scalar() or 0
            credits_remaining = await loop.run_in_executor(None, _get_credits)

        return EnrichResponse(
            first_name=parsed.first_name,
            last_name=parsed.last_name,
            company_website=body.company_website,
            email=result.email,
            status=result.status,
            pattern=result.pattern,
            mx_provider=result.mx_provider,
            credits_used=credits_used,
            credits_remaining=credits_remaining,
        )

    finally:
        if user_acquired:
            await _get_user_concurrency().release(user_id)
        if global_acquired:
            await _get_global_admission().release()
