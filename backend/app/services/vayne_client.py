"""
Vayne API Client

Service layer for interacting with Vayne API (https://www.vayne.io)
All API calls are proxied through this service for security and credit control.
"""

import httpx
import asyncio
from typing import Dict, Optional, Any
from datetime import datetime

from app.core.config import settings


class VayneClient:
    def __init__(self):
        self.api_key = getattr(settings, "VAYNE_API_KEY", "")
        self.base_url = getattr(settings, "VAYNE_API_BASE_URL", "https://www.vayne.io")
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
        )

    async def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        retries: int = 3,
        backoff_factor: float = 1.0
    ) -> Dict[str, Any]:
        """Make a request to Vayne API with retry logic and exponential backoff."""
        url = f"{self.base_url}{endpoint}"
        
        for attempt in range(retries):
            try:
                response = await self.client.request(
                    method=method,
                    url=url,
                    json=data,
                    params=params
                )
                
                # Handle rate limiting (429)
                if response.status_code == 429:
                    wait_time = backoff_factor * (2 ** attempt)
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                return response.json()
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < retries - 1:
                    wait_time = backoff_factor * (2 ** attempt)
                    await asyncio.sleep(wait_time)
                    continue
                raise
            except Exception as e:
                if attempt == retries - 1:
                    raise
                wait_time = backoff_factor * (2 ** attempt)
                await asyncio.sleep(wait_time)
        
        raise Exception("Max retries exceeded")

    async def check_authentication(self, li_at_cookie: str) -> Dict[str, Any]:
        """Check if LinkedIn authentication is valid."""
        # Vayne API endpoint to check auth status
        # This is a placeholder - adjust based on actual Vayne API
        return await self._request(
            "GET",
            "/api/linkedin_authentication",
            params={"li_at": li_at_cookie}
        )

    async def update_authentication(self, li_at_cookie: str) -> Dict[str, Any]:
        """Update LinkedIn session cookie."""
        return await self._request(
            "PATCH",
            "/api/linkedin_authentication",
            data={"li_at_cookie": li_at_cookie}
        )

    async def get_credits(self) -> Dict[str, Any]:
        """Get available credits and usage limits."""
        return await self._request("GET", "/api/credits")

    async def check_url(self, sales_nav_url: str) -> Dict[str, Any]:
        """Check if a Sales Navigator URL is valid and get estimated results."""
        return await self._request(
            "POST",
            "/api/url_checks",
            data={"url": sales_nav_url}
        )

    async def create_order(
        self,
        sales_nav_url: str,
        export_format: str,
        only_qualified: bool,
        li_at_cookie: str
    ) -> Dict[str, Any]:
        """Create a new scraping order."""
        return await self._request(
            "POST",
            "/api/orders",
            data={
                "sales_nav_url": sales_nav_url,
                "export_format": export_format,
                "only_qualified": only_qualified,
                "li_at_cookie": li_at_cookie,
            }
        )

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """Get order status and details."""
        return await self._request("GET", f"/api/orders/{order_id}")

    async def export_order(self, order_id: str) -> bytes:
        """Export order results as CSV."""
        url = f"{self.base_url}/api/orders/{order_id}/export"
        response = await self.client.get(url)
        response.raise_for_status()
        return response.content

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Singleton instance
_vayne_client: Optional[VayneClient] = None


def get_vayne_client() -> VayneClient:
    """Get or create Vayne client singleton."""
    global _vayne_client
    if _vayne_client is None:
        _vayne_client = VayneClient()
    return _vayne_client

