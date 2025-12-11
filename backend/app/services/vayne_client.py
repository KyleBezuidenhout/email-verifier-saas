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
from app.services.vayne_usage_tracker import get_vayne_usage_tracker


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
                result = response.json()
                
                # Track API usage (increment after successful call)
                try:
                    tracker = get_vayne_usage_tracker()
                    tracker.increment_usage()
                except Exception as e:
                    # Don't fail the request if tracking fails
                    print(f"Warning: Failed to track Vayne API usage: {e}")
                
                return result
                
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

    async def check_authentication(self, linkedin_cookie: str) -> Dict[str, Any]:
        """Check if LinkedIn authentication is valid."""
        # Vayne API returns: { "linkedin_authentication": "active" | "checking", ... }
        response = await self._request(
            "GET",
            "/api/linkedin_authentication"
        )
        
        # Map to our expected format
        linkedin_auth = response.get("linkedin_authentication", "")
        
        return {
            "is_connected": linkedin_auth == "active" or linkedin_auth == "checking",
            "linkedin_email": None  # Not provided by Vayne API
        }

    async def update_authentication(self, linkedin_cookie: str) -> Dict[str, Any]:
        """
        Update LinkedIn session cookie.
        Raises exception with descriptive message if cookie is invalid or expired.
        """
        # Validate cookie format (basic check)
        if not linkedin_cookie or len(linkedin_cookie.strip()) < 10:
            raise Exception("Invalid LinkedIn cookie format - cookie is too short or empty")
        
        # Vayne API expects: { "session_cookie": "..." }
        # Vayne API returns: { "linkedin_authentication": "active" | "checking", ... }
        try:
            response = await self._request(
                "PATCH",
                "/api/linkedin_authentication",
                data={"session_cookie": linkedin_cookie}
            )
            
            # Check if authentication was successful
            linkedin_auth = response.get("linkedin_authentication", "")
            if linkedin_auth == "invalid" or linkedin_auth == "expired":
                raise Exception(f"LinkedIn cookie is {linkedin_auth}. Please get a fresh li_at cookie from LinkedIn.")
            
            # Return the cookie that was set
            return {
                "linkedin_cookie": linkedin_cookie,  # Return the cookie we sent
                "linkedin_authentication": linkedin_auth,
                "message": "LinkedIn authentication updated successfully"
            }
        except Exception as e:
            error_msg = str(e).lower()
            # Provide more helpful error messages
            if "401" in error_msg or "unauthorized" in error_msg:
                raise Exception("LinkedIn cookie is invalid or expired. Please get a fresh li_at cookie from LinkedIn.")
            raise

    async def get_credits(self) -> Dict[str, Any]:
        """Get available credits and usage limits."""
        return await self._request("GET", "/api/credits")

    async def check_url(self, sales_nav_url: str) -> Dict[str, Any]:
        """Check if a Sales Navigator URL is valid and get estimated results."""
        # Vayne API returns: { "total": 1234, "type": "leads" }
        response = await self._request(
            "POST",
            "/api/url_checks",
            data={"url": sales_nav_url}
        )
        
        total = response.get("total", 0)
        
        return {
            "is_valid": total > 0,
            "estimated_results": total,
            "type": response.get("type", "leads"),
            "error": None if total > 0 else "No leads found for this URL"
        }

    async def create_order(
        self,
        sales_nav_url: str,
        linkedin_cookie: str
    ) -> Dict[str, Any]:
        """Create a new scraping order with hardcoded advanced format."""
        # Vayne API expects: url, export_format, qualified_leads_only
        # Hardcode export_format to "advanced" and qualified_leads_only to False per specification
        order_data = {
            "url": sales_nav_url,
            "export_format": "advanced",
            "qualified_leads_only": False,
        }
        
        # Vayne API returns: { "order": { "id": 123, ... } }
        response = await self._request(
            "POST",
            "/api/orders",
            data=order_data
        )
        
        # Extract order from nested response
        order = response.get("order", {})
        
        # Convert numeric ID to string for consistency
        if "id" in order:
            order["id"] = str(order["id"])
        
        return order

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """Get order status and details."""
        # Vayne API returns: { "order": { "id": 123, "scraping_status": "finished", ... } }
        response = await self._request("GET", f"/api/orders/{order_id}")
        
        # Extract order from nested response
        order = response.get("order", {})
        
        # Keep scraping_status in response for frontend polling
        scraping_status = order.get("scraping_status", "initialization")
        order["scraping_status"] = scraping_status  # Keep original from Vayne
        
        # Map scraping_status to our status values (for backward compatibility)
        status_mapping = {
            "initialization": "pending",
            "scraping": "processing",
            "finished": "completed",
            "failed": "failed"
        }
        order["status"] = status_mapping.get(scraping_status, "pending")
        
        # Map progress percentage: (scraped / total) * 100
        scraped = order.get("scraped", 0)
        total = order.get("total", 0)
        if total > 0:
            order["progress_percentage"] = int((scraped / total) * 100)
        else:
            order["progress_percentage"] = 0
        
        # Map matching to leads_found
        order["leads_found"] = order.get("matching", order.get("total", 0))
        order["leads_qualified"] = order.get("matching", 0) if order.get("only_qualified") else order.get("matching", 0)
        
        # Convert numeric ID to string
        if "id" in order:
            order["id"] = str(order["id"])
        
        return order

    async def check_export_ready(self, order_id: str, export_format: str = "advanced") -> Optional[str]:
        """
        Check if export is ready and return the file URL if available.
        Returns None if export is not ready yet.
        """
        try:
            order_response = await self._request("GET", f"/api/orders/{order_id}")
            order_data = order_response.get("order", {})
            exports = order_data.get("exports", {})
            
            # Check requested format first
            requested_export = exports.get(export_format, {})
            if requested_export.get("status") == "completed" and requested_export.get("file_url"):
                return requested_export.get("file_url")
            
            # Fallback to any available format
            for fmt in ["advanced", "simple"]:
                export_info = exports.get(fmt, {})
                if export_info.get("status") == "completed" and export_info.get("file_url"):
                    print(f"⚠️ {export_format} not ready, using {fmt} format")
                    return export_info.get("file_url")
            
            return None
        except Exception as e:
            print(f"⚠️ Error checking export status: {e}")
            return None

    async def export_order_with_retry(
        self,
        order_id: str,
        export_format: str = "advanced",
        max_retries: int = 5,
        initial_delay: float = 2.0,
        max_delay: float = 30.0
    ) -> bytes:
        """
        Export order results as CSV with retry logic.
        Waits for export to be ready with exponential backoff.
        """
        delay = initial_delay
        
        for attempt in range(max_retries):
            # First check if export is already available
            file_url = await self.check_export_ready(order_id, export_format)
            
            if file_url:
                print(f"✅ Export ready on attempt {attempt + 1}, downloading from {file_url[:50]}...")
                file_response = await self.client.get(file_url)
                file_response.raise_for_status()
                return file_response.content
            
            # Try to trigger export generation
            if attempt == 0:
                print(f"🔄 Triggering export generation for order {order_id}...")
                try:
                    await self._request(
                        "POST",
                        f"/api/orders/{order_id}/export",
                        data={"export_format": export_format}
                    )
                except Exception as e:
                    print(f"⚠️ Export trigger failed: {e}")
            
            if attempt < max_retries - 1:
                print(f"⏳ Export not ready, waiting {delay:.1f}s before retry {attempt + 2}/{max_retries}...")
                await asyncio.sleep(delay)
                delay = min(delay * 2, max_delay)  # Exponential backoff with max
        
        raise Exception(f"Export not available after {max_retries} attempts for order {order_id}")

    async def export_order(self, order_id: str, export_format: str = "advanced") -> bytes:
        """Export order results as CSV. Tries requested format first, falls back to available format."""
        # First, check what exports are available
        order_response = await self._request("GET", f"/api/orders/{order_id}")
        order_data = order_response.get("order", {})
        exports = order_data.get("exports", {})
        
        # Determine which format to use
        requested_export = exports.get(export_format, {})
        requested_status = requested_export.get("status")
        requested_url = requested_export.get("file_url")
        
        # If requested format is available, use it
        if requested_status == "completed" and requested_url:
            file_url = requested_url
            print(f"✅ Using {export_format} format export")
        else:
            # Fallback to any available format
            for fmt in ["advanced", "simple"]:
                export_info = exports.get(fmt, {})
                if export_info.get("status") == "completed" and export_info.get("file_url"):
                    file_url = export_info.get("file_url")
                    print(f"⚠️ {export_format} format not available, using {fmt} format instead")
                    break
            else:
                # Try to trigger export for requested format
                response = await self._request(
                    "POST",
                    f"/api/orders/{order_id}/export",
                    data={"export_format": export_format}
                )
                order_export = response.get("order", {})
                exports_after = order_export.get("exports", {})
                export_info_after = exports_after.get(export_format, {})
                file_url = export_info_after.get("file_url")
                
                if not file_url:
                    # Check all formats one more time
                    for fmt in ["advanced", "simple"]:
                        export_info = exports_after.get(fmt, {})
                        if export_info.get("status") == "completed" and export_info.get("file_url"):
                            file_url = export_info.get("file_url")
                            print(f"⚠️ Using {fmt} format after export trigger")
                            break
                    
                    if not file_url:
                        raise Exception(f"Export file URL not available. Requested: {export_format}, Available: {[(k, v.get('status')) for k, v in exports_after.items()]}")
        
        # Download file from S3 URL
        file_response = await self.client.get(file_url)
        file_response.raise_for_status()
        return file_response.content

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

