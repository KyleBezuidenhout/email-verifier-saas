"""
POST /api/v1/enrich -- Single email enrichment endpoint.

Layers:
  0a. GlobalAdmissionControl   (Redis, auto-scales with num_keys — waits for slot)
  0b. UserConcurrencyManager   (Redis, per-user — waits for slot)
   1. MailTester per-key rate   (acquireForKey inside enrichment service)
   2. 45 s wall-clock timeout   (asyncio.wait_for inside enrichment service)
"""
import asyncio
import logging
import time
import uuid
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import text

from app.core.config import settings, ADMIN_EMAIL
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.enrich import EnrichRequest, EnrichResponse
from app.services.mailtester_client import MailTesterClient
from app.services.mailtester_rate_limiter import (
    MailTesterRateLimiter,
    UserConcurrencyManager,
    GlobalAdmissionControl,
)
from app.services.name_parser import parse_full_name
from app.services.permutation import normalize_domain
from app.services.realtime_enrichment import enrich_single

logger = logging.getLogger(__name__)
router = APIRouter()

_security = HTTPBearer(auto_error=False)

# ── Module-level singletons (initialised on first request) ──
_redis: aioredis.Redis | None = None
_mt_rate_limiter: MailTesterRateLimiter | None = None
_user_concurrency: UserConcurrencyManager | None = None
_global_admission: GlobalAdmissionControl | None = None
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
            max_per_user=settings.ENRICH_API_MAX_CONCURRENT_PER_USER,
            max_queued=settings.ENRICH_API_MAX_QUEUED_PER_USER,
        )
    return _user_concurrency


def _get_global_admission() -> GlobalAdmissionControl:
    global _global_admission
    if _global_admission is None:
        _global_admission = GlobalAdmissionControl(
            _get_redis(),
            _get_mt_rate_limiter(),
            per_key_multiplier=settings.ENRICH_API_CONCURRENT_PER_KEY,
        )
    return _global_admission


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


# ── Lightweight auth dependency (releases DB connection immediately) ──

async def _get_user_for_enrich(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> User:
    """Authenticate without holding a DB connection for the request lifetime.

    Opens a standalone session, queries the user, detaches it, and closes
    the session so the pool connection is returned before any queue wait.
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials. Provide either Bearer token or X-API-Key header.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    db = SessionLocal()
    try:
        if x_api_key:
            try:
                api_key_uuid = uuid.UUID(x_api_key)
                user = db.query(User).filter(User.api_key == api_key_uuid).first()
                if user and user.is_active:
                    db.expunge(user)
                    return user
                raise HTTPException(401, "Invalid API key or account inactive")
            except (ValueError, TypeError):
                raise HTTPException(401, "Invalid API key format")

        if credentials:
            payload = decode_token(credentials.credentials)
            if payload is None:
                raise credentials_exception
            user_id = payload.get("sub")
            if not user_id:
                raise credentials_exception
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise credentials_exception
            if not user.is_active:
                raise HTTPException(403, "User account is inactive")
            db.expunge(user)
            return user

        raise credentials_exception
    finally:
        db.close()


# ── Credit helpers (standalone sessions, released immediately) ──

async def _reserve_credit(user_id: str) -> Optional[int]:
    """Atomically deduct 1 credit. Returns new balance, or None if insufficient."""
    loop = asyncio.get_event_loop()

    def _do():
        db = SessionLocal()
        try:
            row = db.execute(
                text(
                    "UPDATE users SET credits = credits - 1 "
                    "WHERE id = :uid AND credits >= 1 "
                    "RETURNING credits"
                ),
                {"uid": user_id},
            ).fetchone()
            db.commit()
            return row[0] if row else None
        finally:
            db.close()

    return await loop.run_in_executor(None, _do)


async def _refund_credit(user_id: str) -> None:
    """Return 1 credit on failure. Safe to call even if reservation already refunded."""
    loop = asyncio.get_event_loop()

    def _do():
        db = SessionLocal()
        try:
            db.execute(
                text("UPDATE users SET credits = credits + 1 WHERE id = :uid"),
                {"uid": user_id},
            )
            db.commit()
        finally:
            db.close()

    try:
        await loop.run_in_executor(None, _do)
    except Exception:
        logger.exception("Failed to refund credit for user %s", user_id)


async def _get_credits(user_id: str) -> int:
    """Read current credit balance (for admin responses)."""
    loop = asyncio.get_event_loop()

    def _do():
        db = SessionLocal()
        try:
            return db.execute(
                text("SELECT credits FROM users WHERE id = :uid"),
                {"uid": user_id},
            ).scalar() or 0
        finally:
            db.close()

    return await loop.run_in_executor(None, _do)


# ── Endpoint ──

@router.post("/enrich", response_model=EnrichResponse)
async def enrich_endpoint(
    body: EnrichRequest,
    current_user: User = Depends(_get_user_for_enrich),
):
    user_id = str(current_user.id)
    is_admin = _is_admin(current_user)

    # ── Validate (fast, no resources held) ──
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

    # ── Atomic credit reservation (standalone session, released immediately) ──
    credit_reserved = False
    credits_remaining = 0
    if not is_admin:
        reserved = await _reserve_credit(user_id)
        if reserved is None:
            raise HTTPException(status_code=402, detail="Insufficient credits")
        credits_remaining = reserved
        credit_reserved = True

    # ── Wait for concurrency slots (no DB connection held) ──
    acquire_timeout = settings.ENRICH_API_ACQUIRE_TIMEOUT_SECONDS
    start = time.monotonic()
    user_acquired = False
    global_acquired = False

    try:
        # Per-user concurrency wait
        ok, reason = await _get_user_concurrency().wait_and_acquire(
            user_id, acquire_timeout,
        )
        if not ok:
            detail = (
                "Too many queued enrichments for this account."
                if reason == "queue_full"
                else "Enrichment slots busy. Please retry shortly."
            )
            raise HTTPException(status_code=503, detail=detail)
        user_acquired = True

        # Global admission wait (minimum 5s budget to avoid timeout cliff)
        elapsed = time.monotonic() - start
        global_budget = max(acquire_timeout - elapsed, 5.0)
        global_acquired = await _get_global_admission().wait_and_acquire(global_budget)
        if not global_acquired:
            raise HTTPException(
                status_code=503,
                detail="Service at capacity. Please retry shortly.",
            )

        # ── Enrich (on-demand DB session, bounded by concurrency cap) ──
        db = SessionLocal()
        try:
            result = await enrich_single(
                first_name=parsed.first_name,
                last_name=parsed.last_name,
                domain=domain,
                user_id=user_id,
                db=db,
                rate_limiter=_get_mt_rate_limiter(),
                client=_get_mt_client(),
                timeout_seconds=settings.ENRICH_API_REQUEST_TIMEOUT_SECONDS,
            )
        finally:
            db.close()

        # Success — credit consumed, prevent refund in finally block
        credit_reserved = False

        if is_admin:
            credits_remaining = await _get_credits(user_id)

        return EnrichResponse(
            first_name=parsed.first_name,
            last_name=parsed.last_name,
            company_website=body.company_website,
            email=result.email,
            status=result.status,
            pattern=result.pattern,
            mx_provider=result.mx_provider,
            credits_used=0 if is_admin else 1,
            credits_remaining=credits_remaining,
        )

    finally:
        if global_acquired:
            await _get_global_admission().release()
        if user_acquired:
            await _get_user_concurrency().release(user_id)
        if credit_reserved:
            logger.info("Refunding credit for user %s (enrichment did not complete)", user_id)
            await _refund_credit(user_id)
