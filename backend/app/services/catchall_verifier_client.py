import httpx
from typing import Dict, Optional


class CatchallVerifierClient:
    """
    Generic catchall verifier API client.
    Can be adapted to work with any catchall verifier API.
    
    Default implementation assumes a simple REST API:
    - POST/GET request with email and API key
    - Returns JSON with status field
    """
    
    def __init__(self, api_key: str, base_url: Optional[str] = None):
        self.api_key = api_key
        # Default to a generic endpoint - user can provide their own
        self.base_url = base_url or "https://api.catchall-verifier.com/verify"
        self.client = httpx.AsyncClient(timeout=30.0)

    async def verify_email(self, email: str) -> Dict[str, str]:
        """
        Verify a catchall email address.
        
        Returns:
            {
                "email": str,
                "status": "valid" | "invalid" | "error",
                "message": str
            }
        """
        try:
            # Generic API call - adapt to your catchall verifier's format
            # This is a placeholder that can be customized
            response = await self.client.post(
                self.base_url,
                json={"email": email},
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            response.raise_for_status()
            data = response.json()

            # Try to extract status from common response formats
            status = data.get("status", "").lower()
            if status in ["valid", "deliverable", "exists"]:
                return {
                    "email": email,
                    "status": "valid",
                    "message": data.get("message", "Email verified as valid"),
                }
            elif status in ["invalid", "undeliverable", "not_exists"]:
                return {
                    "email": email,
                    "status": "invalid",
                    "message": data.get("message", "Email is invalid"),
                }
            else:
                # Default to invalid if status unclear
                return {
                    "email": email,
                    "status": "invalid",
                    "message": data.get("message", "Unknown status"),
                }

        except httpx.HTTPStatusError as e:
            return {
                "email": email,
                "status": "error",
                "message": f"HTTP error: {e.response.status_code}",
            }
        except Exception as e:
            return {
                "email": email,
                "status": "error",
                "message": str(e),
            }

    async def close(self):
        await self.client.aclose()


