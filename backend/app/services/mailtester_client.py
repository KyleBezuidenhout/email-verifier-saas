import httpx
import asyncio

from typing import Dict, Optional

from app.core.config import settings


class MailTesterClient:
    MAX_TOTAL_ATTEMPTS = 5  # 5 total attempts with exponential backoff
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.MAILTESTER_API_KEY
        self.base_url = settings.MAILTESTER_BASE_URL
        self.client = httpx.AsyncClient(timeout=30.0)

    async def verify_email(self, email: str, attempt: int = 0) -> Dict[str, str]:
        """
        Verify a single email address with retry logic.
        Returns status: valid, catchall, invalid, or unverified (if all retries exhausted).
        """
        # API error patterns that should trigger retry
        api_error_patterns = [
            'expired', 'invalid key', 'invalid api', 'unauthorized',
            'authentication', 'rate limit', 'too many', 'quota',
            'timeout', 'timed out', 'api error', 'service unavailable',
            'temporarily', 'try again', 'limit exceeded', 'access denied', 'forbidden'
        ]
        
        try:
            response = await self.client.get(
                self.base_url,
                params={"email": email, "key": self.api_key}
            )
            response.raise_for_status()
            data = response.json()

            code = data.get("code", "ko")
            message = data.get("message", "")
            message_lower = message.lower()

            # Check for API errors in response body - these need retry
            is_api_error = any(pattern in message_lower for pattern in api_error_patterns)

            if is_api_error:
                # API error - retry with exponential backoff
                if attempt < self.MAX_TOTAL_ATTEMPTS - 1:
                    backoff_seconds = 2 ** attempt  # 1s, 2s, 4s, 8s, 16s
                    print(f"⚠️ API error for {email}: {message} - retrying in {backoff_seconds}s (attempt {attempt + 1}/{self.MAX_TOTAL_ATTEMPTS})")
                    await asyncio.sleep(backoff_seconds)
                    return await self.verify_email(email, attempt + 1)
                
                # All retries exhausted
                print(f"❌ All {self.MAX_TOTAL_ATTEMPTS} attempts exhausted for {email}: {message}")
                return {
                    "email": email,
                    "status": "unverified",
                    "message": f"API error - all retries exhausted: {message}",
                    "mx": "",
                }
            
            # Definitive result from API
            if code == "ok":
                status = "valid"
            elif code == "mb" or "catch" in message_lower:
                status = "catchall"
            else:
                status = "invalid"

            return {
                "email": email,
                "status": status,
                "message": message,
                "mx": data.get("mx", ""),
            }

        except Exception as e:
            # HTTP/network error - retry with exponential backoff
            if attempt < self.MAX_TOTAL_ATTEMPTS - 1:
                backoff_seconds = 2 ** attempt
                print(f"⚠️ Error verifying {email}: {e} - retrying in {backoff_seconds}s (attempt {attempt + 1}/{self.MAX_TOTAL_ATTEMPTS})")
                await asyncio.sleep(backoff_seconds)
                return await self.verify_email(email, attempt + 1)
            
            # All retries exhausted
            print(f"❌ All {self.MAX_TOTAL_ATTEMPTS} attempts exhausted for {email}: {e}")
            return {
                "email": email,
                "status": "unverified",
                "message": f"Error - all retries exhausted: {str(e)}",
                "mx": "",
            }

    async def close(self):
        await self.client.aclose()



