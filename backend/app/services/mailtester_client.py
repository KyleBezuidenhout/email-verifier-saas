import httpx

from typing import Dict, Optional

from app.core.config import settings


class MailTesterClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.MAILTESTER_API_KEY
        self.base_url = settings.MAILTESTER_BASE_URL
        self.client = httpx.AsyncClient(timeout=30.0)

    

    async def verify_email(self, email: str) -> Dict[str, str]:
        """Verify a single email address."""
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

            # Check for API errors first - these should NOT be marked as invalid
            # Common API error patterns: expired keys, auth failures, rate limits, timeouts
            api_error_patterns = [
                'expired', 'invalid key', 'invalid api', 'unauthorized',
                'authentication', 'rate limit', 'too many', 'quota',
                'timeout', 'timed out', 'api error', 'service unavailable',
                'temporarily', 'try again', 'limit exceeded', 'access denied', 'forbidden'
            ]
            is_api_error = any(pattern in message_lower for pattern in api_error_patterns)

            if is_api_error:
                # API error - don't mark as invalid, mark as error so user knows verification failed
                status = "error"
                print(f"⚠️ API error for {email}: {message}")
            elif code == "ok":
                status = "valid"
            elif code == "mb" or "catch" in message_lower:
                status = "catchall"
            else:
                # Legitimate "email doesn't exist" response
                status = "invalid"

            

            return {
                "email": email,
                "status": status,
                "message": message,
                "mx": data.get("mx", ""),
            }

        

        except Exception as e:
            print(f"Error verifying {email}: {e}")
            return {
                "email": email,
                "status": "error",
                "message": str(e),
            }

    

    async def close(self):
        await self.client.aclose()



