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
        Verify a single email address.

        Returns one of:
          valid        - mailbox confirmed (code ok)
          catchall     - domain accepts all (code mb / "catch")
          invalid      - real negative (No Mx, Rejected, mailbox not found, ...)
          inconclusive - destination wouldn't give a clean answer (Limited,
                         Timeout, SPAM Block, Mx Error). Caller should retry on a
                         different key/IP and ultimately settle as catchall.
          unverified   - WE couldn't get an answer (transient API error exhausted,
                         dead key). Includes key_dead=True when the KEY is the
                         problem so the caller can bench + rotate.

        Args:
            api_key: Optional override key. Falls back to self.api_key if not provided.
        """
        key = api_key or self.api_key

        # KEY-level failures: the key is broken, not the email. Caller rotates + benches.
        dead_key_patterns = [
            'disabled', 'inactive', 'expired', 'invalid key', 'invalid api',
            'unauthorized', 'authentication',
        ]
        # Transient SERVICE-side errors: retry (same key) with linear backoff.
        api_error_patterns = [
            'rate limit', 'too many', 'quota', 'api error', 'service unavailable',
            'temporarily', 'try again', 'limit exceeded', 'access denied', 'forbidden',
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
            limit = data.get("limit")

            # ── KEY-LEVEL FAILURE (dead / disabled / expired / exhausted key) ──
            # MailTester only returns a real verdict with code ok|ko|mb. Anything
            # else (e.g. code "--" "Disabled Key"), or limit <= 0, means the key
            # is dead. Never turn this into an email verdict — bench + rotate.
            known_verdict_code = code in ("ok", "ko", "mb")
            is_dead_key = (
                not known_verdict_code
                or (isinstance(limit, (int, float)) and limit <= 0)
                or any(p in message_lower for p in dead_key_patterns)
            )
            if is_dead_key:
                print(f"🔑 Key ...{key[-4:] if key else '????'} appears dead "
                      f"(code={code}, limit={limit}, msg='{message}') — rotate")
                return {
                    "email": email,
                    "status": "unverified",
                    "message": f"Dead key: {message or code}",
                    "mx": "",
                    "key_dead": True,
                }

            # ── TRANSIENT SERVICE-SIDE ERROR → retry same key, then give up ──
            is_api_error = any(p in message_lower for p in api_error_patterns)
            if is_api_error:
                if attempt < self.MAX_TOTAL_ATTEMPTS - 1:
                    backoff_seconds = attempt + 1  # 1s, 2s, 3s
                    print(f"⚠️ API error for {email}: {message} - retrying in {backoff_seconds}s (attempt {attempt + 1}/{self.MAX_TOTAL_ATTEMPTS})")
                    await asyncio.sleep(backoff_seconds)
                    return await self.verify_email(email, attempt + 1, api_key=key)

                print(f"❌ All {self.MAX_TOTAL_ATTEMPTS} attempts exhausted for {email}: {message}")
                return {
                    "email": email,
                    "status": "unverified",
                    "message": f"API error - all retries exhausted: {message}",
                    "mx": "",
                }

            # ── DEFINITIVE EMAIL VERDICTS ──
            if code == "ok":
                status = "valid"
            elif code == "mb" or "catch" in message_lower:
                status = "catchall"
            else:
                # ── INCONCLUSIVE DESTINATION RESPONSES (not a real negative) ──
                # Limited (mailbox over quota), Timeout (no response), SPAM Block
                # (strong spam protection), Mx Error (mail server error). Distinct
                # from "No Mx" (no mail server) and "Rejected" (hard bounce).
                is_mx_error = "mx" in message_lower and "error" in message_lower
                is_inconclusive = (
                    "limited" in message_lower
                    or "timeout" in message_lower
                    or "timed out" in message_lower
                    or "spam" in message_lower
                    or is_mx_error
                )
                status = "inconclusive" if is_inconclusive else "invalid"

            return {
                "email": email,
                "status": status,
                "message": message,
                "mx": data.get("mx", ""),
            }

        except httpx.TimeoutException:
            # Our request to MailTester timed out — inconclusive, retry on another
            # key (different IP can succeed). Not the key's fault, not a verdict.
            print(f"⏱️ HTTP timeout for {email} - inconclusive, eligible for cross-key retry")
            return {
                "email": email,
                "status": "inconclusive",
                "message": "HTTP timeout",
                "mx": "",
            }

        except Exception as e:
            # A timeout-ish error → inconclusive (retry on another key/IP), not a verdict.
            error_str = str(e).lower()
            if 'timeout' in error_str or 'timed out' in error_str:
                print(f"⏱️ Timeout error for {email} - inconclusive, eligible for cross-key retry")
                return {
                    "email": email,
                    "status": "inconclusive",
                    "message": "Timeout error",
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



