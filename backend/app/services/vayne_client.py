import time
import httpx
from typing import Optional, Dict, Any
from app.core.config import settings


class VayneClient:
    def __init__(self):
        self.base_url = settings.VAYNE_API_BASE_URL.rstrip("/")
        self.api_key = settings.VAYNE_API_KEY
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

            # For non-2xx and not retriable
            try:
                data = resp.json()
            except Exception:
                data = {"detail": resp.text}
            raise httpx.HTTPStatusError(message=str(data), request=resp.request, response=resp)

        # If loop exits
        resp.raise_for_status()

    def check_linkedin_auth(self):
        return self._request("GET", "/api/linkedin_authentication")

    def update_linkedin_session(self, session_cookie: str):
        return self._request("PATCH", "/api/linkedin_authentication", json={"session_cookie": session_cookie})

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
        """
        Create a new scraping order with Vayne API.
        
        Args:
            url: Sales Navigator URL to scrape
            name: Name/targeting description for the order
            limit: Maximum number of leads to scrape (None = no limit)
            email_enrichment: Whether to enrich emails
            saved_search: Whether this is a saved search
            secondary_webhook: Secondary webhook URL (empty string if not used)
            export_format: Export format ("simple" or "advanced")
        """
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
        # Return streaming response to caller
        return self._request("POST", f"/api/orders/{order_id}/export", json={"format": "csv", "include_headers": True}, stream=True)


vayne_client = VayneClient()


def get_vayne_client() -> VayneClient:
    """Get a VayneClient instance. Returns the singleton instance."""
    return vayne_client

