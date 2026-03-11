import time
import httpx
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
    """Parse Vayne API keys from config (comma-separated list, falling back to single key)."""
    keys = []
    if settings.VAYNE_API_KEYS:
        keys = [k.strip() for k in settings.VAYNE_API_KEYS.split(",") if k.strip()]
    if not keys and settings.VAYNE_API_KEY:
        keys = [settings.VAYNE_API_KEY]
    return keys


def get_vayne_clients() -> List[VayneClient]:
    """Get a list of VayneClient instances, one per configured API key."""
    return [VayneClient(key) for key in _parse_api_keys()]


def get_vayne_client() -> VayneClient:
    """Get a single VayneClient (first key). Backwards-compatible."""
    keys = _parse_api_keys()
    if not keys:
        raise ValueError("No Vayne API keys configured")
    return VayneClient(keys[0])
