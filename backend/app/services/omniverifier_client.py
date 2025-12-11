import httpx
from typing import Dict, List, Optional
from app.core.config import settings


class OmniVerifierClient:
    """
    OmniVerifier API client for catchall email verification.
    Implements the full async batch workflow:
    1. Create catchall list
    2. Add emails to list
    3. Start list processing
    4. Poll for status
    5. Get results
    """
    
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or settings.OMNIVERIFIER_API_KEY
        self.base_url = base_url or settings.OMNIVERIFIER_BASE_URL
        self.client = httpx.AsyncClient(timeout=60.0)
    
    def _get_headers(self, include_content_type: bool = True) -> Dict[str, str]:
        """
        Get headers for OmniVerifier API requests.
        
        Args:
            include_content_type: Whether to include Content-Type header (default: True)
        """
        headers = {
            "x-api-key": self.api_key
        }
        if include_content_type:
            headers["Content-Type"] = "application/json"
        return headers
    
    async def get_credits(self) -> Dict:
        """
        Get current credit balance.
        
        Returns:
            Response dict with credit balance information
        """
        try:
            response = await self.client.get(
                f"{self.base_url}/v1/validate/credits",
                headers=self._get_headers(include_content_type=False)
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"Failed to get credits: HTTP {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Error getting credits: {str(e)}")
    
    async def create_catchall_list(self, emails_count: int, title: str) -> Dict:
        """
        Create a new catchall verification list.
        
        Args:
            emails_count: Number of emails that will be added
            title: Title for the list
        
        Returns:
            Response dict with list_id
        """
        try:
            response = await self.client.post(
                f"{self.base_url}/v1/validate/catchall/new",
                headers=self._get_headers(),
                json={
                    "emails": emails_count,
                    "title": title
                }
            )
            response.raise_for_status()
            data = response.json()
            print(f"Create list response: {data}")  # Debug: log full response
            return data
        except httpx.HTTPStatusError as e:
            error_text = e.response.text if e.response else "No response text"
            raise Exception(f"Failed to create catchall list: HTTP {e.response.status_code} - {error_text}")
        except Exception as e:
            raise Exception(f"Error creating catchall list: {str(e)}")
    
    async def add_emails_to_list(self, list_id: str, emails: List[str]) -> Dict:
        """
        Add emails to an existing catchall list.
        
        Args:
            list_id: The ID of the catchall list (will be converted to string)
            emails: List of email addresses to add
        
        Returns:
            Response dict
        """
        try:
            # Use list_id directly (keep as string, but ensure it's clean)
            list_id_str = str(list_id).strip()
            # According to the guide, the endpoint is: POST /v1/validate/catchall/{listId}/add
            # But the guide shows BASE_URL = "https://api.omniverifier.com/v1"
            # So the full URL should be: https://api.omniverifier.com/v1/validate/catchall/{listId}/add
            # We're using base_url = "https://api.omniverifier.com" and adding /v1, which should be the same
            url = f"{self.base_url}/v1/validate/catchall/{list_id_str}/add"
            print(f"Adding {len(emails)} emails to list {list_id_str} via {url}")
            print(f"Request headers: {self._get_headers()}")
            print(f"Request payload (first 3 emails): {emails[:3] if len(emails) > 3 else emails}")
            
            # Try the request
            response = await self.client.post(
                url,
                headers=self._get_headers(),
                json={
                    "emails": emails
                }
            )
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            response.raise_for_status()
            result = response.json()
            print(f"Add emails response: {result}")  # Debug: log full response
            return result
        except httpx.HTTPStatusError as e:
            error_text = e.response.text if e.response else "No response text"
            print(f"HTTP Error {e.response.status_code}: {error_text}")  # Debug: log error details
            print(f"Response URL: {e.response.url if e.response else 'N/A'}")
            
            # If 404, maybe the list needs more time or the endpoint format is different
            if e.response.status_code == 404:
                print(f"404 error - List ID: {list_id_str}, URL: {url}")
                print(f"Full error response: {error_text}")
                # The guide shows the endpoint should work, so this might be:
                # 1. List not ready yet (needs more delay)
                # 2. List ID format issue
                # 3. API endpoint changed
                raise Exception(f"Failed to add emails to list: HTTP 404 - List {list_id_str} not found. The list may need more time to initialize, or the endpoint may have changed. Error: {error_text}")
            
            raise Exception(f"Failed to add emails to list: HTTP {e.response.status_code} - {error_text}")
        except Exception as e:
            print(f"Exception in add_emails_to_list: {str(e)}")  # Debug: log exception
            raise Exception(f"Error adding emails to list: {str(e)}")
    
    async def start_list(self, list_id: str) -> Dict:
        """
        Start processing a catchall list.
        
        Args:
            list_id: The ID of the catchall list
        
        Returns:
            Response dict
        """
        try:
            # Start list endpoint only needs x-api-key header (no Content-Type)
            response = await self.client.post(
                f"{self.base_url}/v1/validate/catchall/{list_id}/start",
                headers=self._get_headers(include_content_type=False)
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"Failed to start list: HTTP {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Error starting list: {str(e)}")
    
    async def get_list_status(self, list_id: str) -> Dict:
        """
        Get the status of a catchall list.
        
        Args:
            list_id: The ID of the catchall list
        
        Returns:
            Status dict with fields like "status", "progress", "processed", "total", etc.
        """
        try:
            response = await self.client.get(
                f"{self.base_url}/v1/validate/catchall/{list_id}/status",
                headers=self._get_headers(include_content_type=False)
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"Failed to get list status: HTTP {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Error getting list status: {str(e)}")
    
    async def get_list_results(self, list_id: str) -> List[Dict]:
        """
        Get the results of a completed catchall list.
        
        Args:
            list_id: The ID of the catchall list
        
        Returns:
            List of result dicts, each containing email and validation status
        """
        try:
            # Note: Results endpoint uses different path: /v1/catchall/list/{id}/results
            # (not /v1/validate/catchall/{id}/results)
            response = await self.client.get(
                f"{self.base_url}/v1/catchall/list/{list_id}/results",
                headers=self._get_headers(include_content_type=False)
            )
            response.raise_for_status()
            data = response.json()
            # API returns {"results": [...]}, extract the results array
            return data.get("results", [])
        except httpx.HTTPStatusError as e:
            raise Exception(f"Failed to get list results: HTTP {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Error getting list results: {str(e)}")
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

