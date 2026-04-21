import time
import uuid
import httpx
import redis as sync_redis
from typing import Optional, Dict, Any, List
from app.core.config import settings


class VayneClient:
    """Client for a single Vayne API key."""

    def __init__(self, api_key: str):
        self.base_url = settings.VAYNE_API_BASE_URL.rstrip("/")
        self.api_key = api_key
        self.session = httpx.Client(timeout=30.0)

    def _headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise ValueError("VAYNE_API_KEY is not configured")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, json: Optional[Dict[str, Any]] = None, stream: bool = False):
        url = f"{self.base_url}{path}"
        headers = self._headers()
        backoff = [0, 5, 10, 30]

        for attempt, delay in enumerate(backoff):
            if delay:
                time.sleep(delay)
            resp = self.session.request(method, url, headers=headers, json=json, timeout=30.0)

            if resp.status_code == 429 and attempt < len(backoff) - 1:
                continue
            if 200 <= resp.status_code < 300:
                return resp if stream else resp.json()

            try:
                data = resp.json()
            except Exception:
                data = {"detail": resp.text}
            raise httpx.HTTPStatusError(message=str(data), request=resp.request, response=resp)

        resp.raise_for_status()

    def check_linkedin_auth(self):
        return self._request("GET", "/api/linkedin_authentication")

    def update_linkedin_session(self, session_cookie: str):
        return self._request("PATCH", "/api/linkedin_authentication", json={"linkedin_cookie": session_cookie})

    def get_credits(self):
        return self._request("GET", "/api/credits")

    def validate_url(self, url: str):
        return self._request("POST", "/api/url_checks", json={"url": url})

    def create_order(
        self,
        url: str,
        name: str,
        limit: Optional[int] = None,
        email_enrichment: bool = False,
        saved_search: bool = False,
        secondary_webhook: str = "",
        export_format: str = "simple"
    ):
        payload = {
            "name": name,
            "url": url,
            "limit": limit,
            "email_enrichment": email_enrichment,
            "saved_search": saved_search,
            "secondary_webhook": secondary_webhook,
            "export_format": export_format,
        }
        return self._request("POST", "/api/orders", json=payload)

    def get_order(self, order_id: str):
        return self._request("GET", f"/api/orders/{order_id}")

    def export_order_csv(self, order_id: str):
        return self._request("POST", f"/api/orders/{order_id}/export", json={"format": "csv", "include_headers": True}, stream=True)


def _parse_api_keys() -> List[str]:
    """Parse Vayne API keys from config (comma-separated list, falling back to single key).

    The dedicated validation key (VAYNE_VALIDATION_API_KEY) is always stripped out of
    the scraping pool, even if it was accidentally re-listed in VAYNE_API_KEYS. This
    prevents cookie-clobber races between live validation and active scraping on the
    same slot.
    """
    keys: List[str] = []
    if settings.VAYNE_API_KEYS:
        keys = [k.strip() for k in settings.VAYNE_API_KEYS.split(",") if k.strip()]
    if not keys and settings.VAYNE_API_KEY:
        keys = [settings.VAYNE_API_KEY]

    validation_key = (settings.VAYNE_VALIDATION_API_KEY or "").strip()
    if validation_key:
        keys = [k for k in keys if k != validation_key]
    return keys


def get_vayne_clients() -> List[VayneClient]:
    """Get a list of VayneClient instances, one per configured scraping API key."""
    return [VayneClient(key) for key in _parse_api_keys()]


def get_vayne_client() -> VayneClient:
    """Get a single VayneClient (first scraping key). Backwards-compatible."""
    keys = _parse_api_keys()
    if not keys:
        raise ValueError("No Vayne API keys configured")
    return VayneClient(keys[0])


def get_validation_client() -> VayneClient:
    """Return the dedicated validation-slot client.

    The validation slot is used only for synchronous cookie/URL validation at
    upload time. It is never assigned scraping work. Callers MUST hold the
    validation-slot mutex (see acquire_validation_lock) before pushing a cookie
    to this client; otherwise concurrent requests can clobber each other's
    cookies and falsely report a bad cookie as valid.
    """
    key = (settings.VAYNE_VALIDATION_API_KEY or "").strip()
    if not key:
        raise ValueError("VAYNE_VALIDATION_API_KEY is not configured")
    return VayneClient(key)


# ---------------------------------------------------------------------------
# Slot health tracking (Redis-based, modeled on MailTester health tracking)
# ---------------------------------------------------------------------------

_VAYNE_HEALTH_PREFIX = "vayne:slot:health"
_VAYNE_DAILY_ALERT_PREFIX = "vayne:daily_limit_alert"


def _get_redis() -> sync_redis.Redis:
    return sync_redis.from_url(settings.REDIS_URL, decode_responses=True)


def mark_slot_unhealthy(slot_idx: int, ttl: int = 300) -> None:
    """Mark a Vayne slot as unhealthy for `ttl` seconds (default 5 min)."""
    _get_redis().set(f"{_VAYNE_HEALTH_PREFIX}:unhealthy:{slot_idx}", "1", ex=ttl)


def is_slot_healthy(slot_idx: int) -> bool:
    return not _get_redis().get(f"{_VAYNE_HEALTH_PREFIX}:unhealthy:{slot_idx}")


def should_send_daily_limit_alert() -> bool:
    """Return True if we haven't sent a Vayne daily limit admin alert today."""
    r = _get_redis()
    today = time.strftime("%Y-%m-%d")
    key = f"{_VAYNE_DAILY_ALERT_PREFIX}:{today}"
    if r.get(key):
        return False
    r.set(key, "1", ex=86400)
    return True


# ---------------------------------------------------------------------------
# Validation slot mutex (token-based)
#
# Serializes the PATCH + GET sequence against the dedicated validation slot.
# Without this, a concurrent PATCH from another user would overwrite the cookie
# we're validating, causing us to read the wrong status and wrongly approve /
# reject a user's cookie. The mutex protects the whole sequence, not just the
# PATCH — the follow-up GET must be on the same cookie the caller pushed.
#
# The lock value is a per-acquisition UUID token, and release is an atomic
# "check-and-delete" via a Lua script. This prevents a stale holder (whose
# TTL expired while it was still running) from accidentally releasing the
# lock that a later acquirer now owns.
#
# TTL is sized (90s) to comfortably exceed the worst-case happy-path sequence:
#   5s initial sleep + ~1s PATCH + 3s retry + ~1s GET ≈ 10s typical
#   With moderate Vayne latency (a few slow responses), ~30s.
#   Under a 429 storm (VayneClient backoff = [0, 5, 10, 30] × 30s HTTP timeout)
#     a single HTTP call can in the absolute worst case take ~45s. The TTL
#     still can't cover that; if you see it, token release keeps you safe.
# ---------------------------------------------------------------------------

_VAYNE_VALIDATION_LOCK_KEY = "vayne:validation_slot:lock"
_VAYNE_VALIDATION_LOCK_TTL = 90  # seconds; self-heals if holder crashes mid-sequence

# Atomic "release iff we still own the lock". Prevents stale owners (whose
# TTL expired) from zapping a newer acquirer's lock.
_RELEASE_LOCK_LUA = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
"""


def acquire_validation_lock(timeout_s: Optional[float] = None) -> Optional[str]:
    """Acquire the Redis mutex guarding the dedicated validation slot.

    Polls every 500ms until `timeout_s` elapses. Returns the owner token on
    success (must be passed back to release_validation_lock), or None on
    timeout. The default timeout comes from
    settings.VAYNE_VALIDATION_LOCK_ACQUIRE_TIMEOUT_S.
    """
    if timeout_s is None:
        timeout_s = settings.VAYNE_VALIDATION_LOCK_ACQUIRE_TIMEOUT_S
    r = _get_redis()
    token = uuid.uuid4().hex
    deadline = time.monotonic() + timeout_s
    while True:
        acquired = r.set(
            _VAYNE_VALIDATION_LOCK_KEY,
            token,
            nx=True,
            ex=_VAYNE_VALIDATION_LOCK_TTL,
        )
        if acquired:
            return token
        if time.monotonic() >= deadline:
            return None
        time.sleep(0.5)


def release_validation_lock(token: Optional[str]) -> None:
    """Release the validation-slot mutex, but ONLY if we still own it.

    Safe to call with None (no-op) or after the TTL expired (Lua script will
    see the mismatch and do nothing). This protects against a stale holder
    zapping a newer acquirer's lock.
    """
    if not token:
        return
    try:
        _get_redis().eval(_RELEASE_LOCK_LUA, 1, _VAYNE_VALIDATION_LOCK_KEY, token)
    except Exception:
        # Never let lock release failures break the caller's happy path.
        pass


# ---------------------------------------------------------------------------
# Oversize-order admin alert cooldown
#
# Fired from the queue dispatcher when a queued order cannot fit on any slot's
# remaining daily capacity. We send at most one admin email per order, then
# let the order continue to sit in "queued" so it self-heals when capacity
# frees up. 7-day TTL is a safety net — an order stuck 7+ days means bigger
# problems and we want the reminder.
# ---------------------------------------------------------------------------

_VAYNE_OVERSIZE_ALERT_PREFIX = "vayne:oversize_order_alert"
_VAYNE_OVERSIZE_ALERT_TTL = 7 * 24 * 60 * 60  # 7 days


def should_send_oversize_order_alert(order_id) -> bool:
    """Return True iff no oversize-order alert has been sent for this order yet.

    Sets the guard atomically via SET NX, so concurrent dispatcher passes do
    not send duplicate alerts.
    """
    r = _get_redis()
    key = f"{_VAYNE_OVERSIZE_ALERT_PREFIX}:{order_id}"
    return bool(r.set(key, "1", nx=True, ex=_VAYNE_OVERSIZE_ALERT_TTL))
