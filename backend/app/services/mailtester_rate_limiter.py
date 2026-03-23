"""
MailTester Rate Limiter & Concurrency Control for Enrichment API

Async Python port of the Node.js GlobalRateLimiter.acquireForKey() logic,
using the SAME Redis keys so both systems share rate-limit budget automatically.

Also provides per-user and global concurrency management via Redis counters.
"""
import asyncio
import hashlib
import time
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import redis.asyncio as aioredis

from app.core.config import settings
from app.services.usage_tracker import get_key_hash, get_today_date_gmt2, get_all_mailtester_keys

logger = logging.getLogger(__name__)

WINDOW_MS = 30_000
KEY_PREFIX = "mailtester:global_rate"


@dataclass
class KeyConfig:
    spacing_ms: int = 250
    requests_per_30s: int = 165
    daily_limit: int = 500_000


def _parse_key_configs() -> Dict[str, KeyConfig]:
    """Build per-key config map from env vars, mirroring Node.js KEY_CONFIGS."""
    keys = get_all_mailtester_keys()
    if not keys:
        return {}

    spacings_raw = settings.MAILTESTER_KEY_SPACINGS
    spacings = [int(s.strip()) for s in spacings_raw.split(",") if s.strip()] if spacings_raw else []

    rps_raw = settings.MAILTESTER_KEY_REQUESTS_PER_30S
    rps = [int(s.strip()) for s in rps_raw.split(",") if s.strip()] if rps_raw else []

    limits_raw = settings.MAILTESTER_KEY_DAILY_LIMITS
    limits = [int(s.strip()) for s in limits_raw.split(",") if s.strip()] if limits_raw else []

    configs: Dict[str, KeyConfig] = {}
    for i, key in enumerate(keys):
        configs[key] = KeyConfig(
            spacing_ms=spacings[i] if i < len(spacings) else 250,
            requests_per_30s=rps[i] if i < len(rps) else 165,
            daily_limit=limits[i] if i < len(limits) else 500_000,
        )
    return configs


class MailTesterRateLimiter:
    """
    Distributed rate limiter for MailTester API keys.
    Uses identical Redis keys as the Node.js worker so both systems
    coordinate without any explicit communication.
    """

    def __init__(self, redis_client: aioredis.Redis):
        self.redis = redis_client
        self.key_configs = _parse_key_configs()
        self.api_keys = list(self.key_configs.keys())

    @property
    def num_keys(self) -> int:
        return len(self.api_keys)

    def _get_key_spacing(self, api_key: str) -> int:
        cfg = self.key_configs.get(api_key)
        return cfg.spacing_ms if cfg else 250

    def _get_key_requests_per_30s(self, api_key: str) -> int:
        cfg = self.key_configs.get(api_key)
        return cfg.requests_per_30s if cfg else 165

    def _get_key_daily_limit(self, api_key: str) -> int:
        cfg = self.key_configs.get(api_key)
        return cfg.daily_limit if cfg else 500_000

    # ── Redis key builders (must match Node.js exactly) ──

    @staticmethod
    def _lock_key(api_key: str) -> str:
        return f"{KEY_PREFIX}:lock:{get_key_hash(api_key)}"

    @staticmethod
    def _last_request_key(api_key: str) -> str:
        return f"{KEY_PREFIX}:last_request:{get_key_hash(api_key)}"

    @staticmethod
    def _window_key(api_key: str, window_start: int) -> str:
        return f"{KEY_PREFIX}:key:{get_key_hash(api_key)}:{window_start}"

    @staticmethod
    def _usage_key(api_key: str) -> str:
        return f"mailtester:usage:{get_key_hash(api_key)}:{get_today_date_gmt2()}"

    @staticmethod
    def _error_key(api_key: str) -> str:
        minute_window = int(time.time()) // 60
        return f"mailtester:errors:{get_key_hash(api_key)}:{minute_window}"

    @staticmethod
    def _unhealthy_key(api_key: str) -> str:
        return f"mailtester:unhealthy:{get_key_hash(api_key)}"

    # ── Core: acquire_for_key (port of Node.js acquireForKey) ──

    async def acquire_for_key(self, api_key: str, timeout_seconds: float = 30.0) -> bool:
        """
        Wait for an available rate-limit slot on a specific MailTester key.
        Uses the same Redis locks/counters as the Node.js worker.
        Returns True on success, False if timeout exhausted.
        """
        spacing_ms = self._get_key_spacing(api_key)
        requests_per_30s = self._get_key_requests_per_30s(api_key)
        lock_key = self._lock_key(api_key)
        retry_wait_s = max(0.02, spacing_ms / 4000)
        max_retries = int(timeout_seconds / retry_wait_s)
        retries = 0

        while retries < max_retries:
            now_ms = int(time.time() * 1000)
            window_start = (now_ms // WINDOW_MS) * WINDOW_MS
            window_key = self._window_key(api_key, window_start)
            last_req_key = self._last_request_key(api_key)

            # STEP 1: Acquire distributed lock (SETNX)
            lock_acquired = await self.redis.set(
                lock_key, str(now_ms), nx=True, px=spacing_ms + 50
            )
            if not lock_acquired:
                await asyncio.sleep(retry_wait_s)
                retries += 1
                continue

            try:
                # STEP 2: Check spacing constraint
                last_req_str = await self.redis.get(last_req_key)
                if last_req_str:
                    last_req_time = int(last_req_str)
                    elapsed = int(time.time() * 1000) - last_req_time
                    if elapsed < spacing_ms:
                        await self.redis.delete(lock_key)
                        wait_s = (spacing_ms - elapsed + 10) / 1000
                        await asyncio.sleep(wait_s)
                        retries += 1
                        continue

                # STEP 3: Check 30s window counter
                current_str = await self.redis.get(window_key)
                current_count = int(current_str) if current_str else 0
                if current_count >= requests_per_30s:
                    await self.redis.delete(lock_key)
                    next_window = window_start + WINDOW_MS
                    wait_ms = next_window - int(time.time() * 1000) + 50
                    if 0 < wait_ms < WINDOW_MS:
                        await asyncio.sleep(wait_ms / 1000)
                    retries += 1
                    continue

                # STEP 4: Increment window counter
                count = await self.redis.incr(window_key)
                if count == 1:
                    await self.redis.expire(window_key, (WINDOW_MS // 1000) + 1)

                # STEP 5: Check post-increment overflow
                if count > requests_per_30s:
                    await self.redis.decr(window_key)
                    await self.redis.delete(lock_key)
                    next_window = window_start + WINDOW_MS
                    wait_ms = next_window - int(time.time() * 1000) + 50
                    if 0 < wait_ms < WINDOW_MS:
                        await asyncio.sleep(wait_ms / 1000)
                    retries += 1
                    continue

                # STEP 6: Success — record last request time
                await self.redis.set(
                    last_req_key, str(int(time.time() * 1000)),
                    ex=(WINDOW_MS // 1000)
                )
                await self.redis.delete(lock_key)
                return True

            except Exception:
                await self.redis.delete(lock_key)
                raise

        logger.error("acquire_for_key exhausted %d retries for key ...%s", max_retries, api_key[-4:])
        return False

    # ── Usage tracking (Review #4) ──

    async def track_api_usage(self, api_key: str) -> None:
        """Increment daily usage counter — same Redis key as Node.js trackApiUsage."""
        usage_key = self._usage_key(api_key)
        await self.redis.incr(usage_key)
        await self.redis.expire(usage_key, 172_800)  # 48h

    # ── Key health tracking (Review #5) ──

    async def track_key_error(self, api_key: str) -> None:
        err_key = self._error_key(api_key)
        count = await self.redis.incr(err_key)
        await self.redis.expire(err_key, 120)
        if count >= 5:
            await self.mark_key_unhealthy(api_key)

    async def is_key_healthy(self, api_key: str) -> bool:
        unhealthy = await self.redis.get(self._unhealthy_key(api_key))
        if unhealthy:
            return False
        err_str = await self.redis.get(self._error_key(api_key))
        return (int(err_str) if err_str else 0) < 5

    async def mark_key_unhealthy(self, api_key: str) -> None:
        logger.warning("Marking key ...%s unhealthy for 300s", api_key[-4:])
        await self.redis.set(self._unhealthy_key(api_key), "1", ex=300)

    # ── Key selection ──

    async def get_best_key(self) -> Optional[str]:
        """Pick the healthy key with the most remaining daily capacity."""
        best_key: Optional[str] = None
        best_remaining = -1

        for api_key in self.api_keys:
            if not await self.is_key_healthy(api_key):
                continue
            usage_str = await self.redis.get(self._usage_key(api_key))
            usage = int(usage_str) if usage_str else 0
            daily_limit = self._get_key_daily_limit(api_key)
            remaining = daily_limit - usage
            if remaining > best_remaining:
                best_remaining = remaining
                best_key = api_key

        if best_remaining <= 0:
            for api_key in self.api_keys:
                usage_str = await self.redis.get(self._usage_key(api_key))
                usage = int(usage_str) if usage_str else 0
                daily_limit = self._get_key_daily_limit(api_key)
                remaining = daily_limit - usage
                if remaining > best_remaining:
                    best_remaining = remaining
                    best_key = api_key

        return best_key if best_remaining > 0 else None


class UserConcurrencyManager:
    """Redis-based per-user concurrency limiter (distributed across processes)."""

    def __init__(self, redis_client: aioredis.Redis, max_per_user: int = 5):
        self.redis = redis_client
        self.max_per_user = max_per_user

    def _key(self, user_id: str) -> str:
        return f"enrich:concurrency:{user_id}"

    async def acquire(self, user_id: str) -> bool:
        key = self._key(user_id)
        count = await self.redis.incr(key)
        await self.redis.expire(key, 60)
        if count > self.max_per_user:
            await self.redis.decr(key)
            return False
        return True

    async def release(self, user_id: str) -> None:
        key = self._key(user_id)
        val = await self.redis.decr(key)
        if val < 0:
            await self.redis.set(key, 0, ex=60)


class GlobalAdmissionControl:
    """
    Redis-based global concurrent enrichment cap.
    Auto-scales: max = num_keys * per_key_multiplier.
    """

    REDIS_KEY = "enrich:concurrency:global"

    def __init__(
        self,
        redis_client: aioredis.Redis,
        rate_limiter: MailTesterRateLimiter,
        per_key_multiplier: int = 10,
    ):
        self.redis = redis_client
        self.rate_limiter = rate_limiter
        self.per_key_multiplier = per_key_multiplier

    @property
    def max_concurrent(self) -> int:
        return max(self.rate_limiter.num_keys * self.per_key_multiplier, 5)

    async def acquire(self) -> bool:
        count = await self.redis.incr(self.REDIS_KEY)
        await self.redis.expire(self.REDIS_KEY, 60)
        if count > self.max_concurrent:
            await self.redis.decr(self.REDIS_KEY)
            return False
        return True

    async def release(self) -> None:
        val = await self.redis.decr(self.REDIS_KEY)
        if val < 0:
            await self.redis.set(self.REDIS_KEY, 0, ex=60)


class UserRateLimiter:
    """Per-user sliding-window rate limiter (Redis-based)."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        per_second: int = 5,
        per_minute: int = 120,
    ):
        self.redis = redis_client
        self.per_second = per_second
        self.per_minute = per_minute

    async def check(self, user_id: str) -> Tuple[bool, float]:
        """Returns (allowed, retry_after_seconds). retry_after is 0 if allowed."""
        now = time.time()
        epoch_second = int(now)
        epoch_minute = int(now) // 60

        sec_key = f"enrich:ratelimit:{user_id}:s:{epoch_second}"
        min_key = f"enrich:ratelimit:{user_id}:m:{epoch_minute}"

        pipe = self.redis.pipeline()
        pipe.incr(sec_key)
        pipe.expire(sec_key, 2)
        pipe.incr(min_key)
        pipe.expire(min_key, 61)
        results = await pipe.execute()
        sec_count, _, min_count, _ = results

        if sec_count > self.per_second:
            await self.redis.decr(sec_key)
            return False, 1.0

        if min_count > self.per_minute:
            await self.redis.decr(min_key)
            seconds_left = 60 - (int(now) % 60)
            return False, float(seconds_left)

        return True, 0.0
