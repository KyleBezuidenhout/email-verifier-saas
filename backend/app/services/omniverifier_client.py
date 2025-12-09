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
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for OmniVerifier API requests."""
        return {
            "Content-Type": "application/json",
            "x-api-key": self.api_key
        }
    
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
            return response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"Failed to create catchall list: HTTP {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Error creating catchall list: {str(e)}")
    
    async def add_emails_to_list(self, list_id: str, emails: List[str]) -> Dict:
        """
        Add emails to an existing catchall list.
        
        Args:
            list_id: The ID of the catchall list
            emails: List of email addresses to add
        
        Returns:
            Response dict
        """
        try:
            response = await self.client.post(
                f"{self.base_url}/v1/validate/catchall/{list_id}/add",
                headers=self._get_headers(),
                json={
                    "emails": emails
                }
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"Failed to add emails to list: HTTP {e.response.status_code} - {e.response.text}")
        except Exception as e:
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
            response = await self.client.post(
                f"{self.base_url}/v1/validate/catchall/{list_id}/start",
                headers=self._get_headers()
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
            Status dict with fields like "status", "processed", "total", etc.
        """
        try:
            response = await self.client.get(
                f"{self.base_url}/v1/validate/catchall/{list_id}/status",
                headers=self._get_headers()
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
            response = await self.client.get(
                f"{self.base_url}/v1/catchall/list/{list_id}/results",
                headers=self._get_headers()
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

