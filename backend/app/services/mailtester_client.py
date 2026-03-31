import httpx
import asyncio

from typing import Dict, Optional

from app.core.config import settings


class MailTesterClient:
    MAX_TOTAL_ATTEMPTS = 3  # 3 total attempts with linear backoff (1s, 2s, 3s)
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.MAILTESTER_API_KEY
        self.base_url = settings.MAILTESTER_BASE_URL
        self.client = httpx.AsyncClient(timeout=30.0)

    async def verify_email(self, email: str, attempt: int = 0, api_key: str = None) -> Dict[str, str]:
        """
        Verify a single email address with retry logic.
        Returns status: valid, catchall, invalid, or unverified (if all retries exhausted).
        
        Args:
            api_key: Optional override key. Falls back to self.api_key if not provided.
        
        Note: Timeouts are NOT retried - they indicate the mail server won't respond.
        """
        key = api_key or self.api_key
        
        # Timeout patterns - these indicate unresponsive mail servers, don't retry
        timeout_patterns = ['timeout', 'timed out']
        
        # API error patterns that should trigger retry (excludes timeouts)
        api_error_patterns = [
            'expired', 'invalid key', 'invalid api', 'unauthorized',
            'authentication', 'rate limit', 'too many', 'quota',
            'api error', 'service unavailable',
            'temporarily', 'try again', 'limit exceeded', 'access denied', 'forbidden'
        ]
        
        try:
            response = await self.client.get(
                self.base_url,
                params={"email": email, "key": key}
            )
            response.raise_for_status()
            data = response.json()

            code = data.get("code", "ko")
            message = data.get("message", "")
            message_lower = message.lower()

            # Check for timeout responses - mail server won't respond, don't retry
            is_timeout = any(pattern in message_lower for pattern in timeout_patterns)
            if is_timeout:
                print(f"⏱️ Timeout for {email} - mail server unresponsive (no retry)")
                return {
                    "email": email,
                    "status": "unverified",
                    "message": "Email server timeout - unverifiable",
                    "mx": "",
                }

            # Check for API errors in response body - these need retry
            is_api_error = any(pattern in message_lower for pattern in api_error_patterns)

            if is_api_error:
                # API error - retry with linear backoff
                if attempt < self.MAX_TOTAL_ATTEMPTS - 1:
                    backoff_seconds = attempt + 1  # 1s, 2s, 3s
                    print(f"⚠️ API error for {email}: {message} - retrying in {backoff_seconds}s (attempt {attempt + 1}/{self.MAX_TOTAL_ATTEMPTS})")
                    await asyncio.sleep(backoff_seconds)
                    return await self.verify_email(email, attempt + 1, api_key=key)
                
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
            elif code == "mb" or "catch" in message_lower or "limited" in message_lower:
                status = "catchall"
            else:
                status = "invalid"

            return {
                "email": email,
                "status": status,
                "message": message,
                "mx": data.get("mx", ""),
            }

        except httpx.TimeoutException:
            # HTTP-level timeout - mail server unresponsive, don't retry
            print(f"⏱️ HTTP timeout for {email} - mail server unresponsive (no retry)")
            return {
                "email": email,
                "status": "unverified",
                "message": "Email server timeout - unverifiable",
                "mx": "",
            }

        except Exception as e:
            # Check if the error message indicates a timeout
            error_str = str(e).lower()
            if 'timeout' in error_str or 'timed out' in error_str:
                print(f"⏱️ Timeout error for {email} - mail server unresponsive (no retry)")
                return {
                    "email": email,
                    "status": "unverified",
                    "message": "Email server timeout - unverifiable",
                    "mx": "",
                }
            
            # Other HTTP/network errors - retry with linear backoff
            if attempt < self.MAX_TOTAL_ATTEMPTS - 1:
                backoff_seconds = attempt + 1  # 1s, 2s, 3s
                print(f"⚠️ Error verifying {email}: {e} - retrying in {backoff_seconds}s (attempt {attempt + 1}/{self.MAX_TOTAL_ATTEMPTS})")
                await asyncio.sleep(backoff_seconds)
                return await self.verify_email(email, attempt + 1, api_key=key)
            
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



