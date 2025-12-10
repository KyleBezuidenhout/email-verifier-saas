"""
API Usage Tracker Service

Tracks MailTester API key usage with:
- 500,000 daily limit per key
- Reset at midnight GMT+2
- Support for multiple keys
"""
import redis
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo
from app.core.config import settings


# GMT+2 timezone
GMT_PLUS_2 = ZoneInfo("Africa/Johannesburg")  # Uses GMT+2

# Daily limit per key
DAILY_LIMIT = 500_000


def get_redis_client():
    """Get Redis client."""
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_key_hash(api_key: str) -> str:
    """Get a short hash of the API key for storage (last 8 chars of SHA256)."""
    return hashlib.sha256(api_key.encode()).hexdigest()[-8:]


def get_today_date_gmt2() -> str:
    """Get today's date in GMT+2 timezone (YYYY-MM-DD format)."""
    now = datetime.now(GMT_PLUS_2)
    return now.strftime("%Y-%m-%d")


def get_midnight_gmt2_timestamp() -> datetime:
    """Get the next midnight in GMT+2 timezone."""
    now = datetime.now(GMT_PLUS_2)
    tomorrow = now.date() + timedelta(days=1)
    midnight = datetime.combine(tomorrow, datetime.min.time(), tzinfo=GMT_PLUS_2)
    return midnight


def get_all_mailtester_keys() -> List[str]:
    """Get all configured MailTester API keys."""
    keys = []
    
    # Get from comma-separated list
    if settings.MAILTESTER_API_KEYS:
        keys.extend([k.strip() for k in settings.MAILTESTER_API_KEYS.split(",") if k.strip()])
    
    # Fallback to single key if no list provided
    if not keys and settings.MAILTESTER_API_KEY:
        keys.append(settings.MAILTESTER_API_KEY)
    
    return keys


class UsageTracker:
    """Track API usage per key per day."""
    
    def __init__(self):
        self.redis = get_redis_client()
    
    def _get_usage_key(self, api_key: str, date: Optional[str] = None) -> str:
        """Get Redis key for usage tracking."""
        key_hash = get_key_hash(api_key)
        date_str = date or get_today_date_gmt2()
        return f"mailtester:usage:{key_hash}:{date_str}"
    
    def increment_usage(self, api_key: str, amount: int = 1) -> int:
        """
        Increment usage counter for a key.
        Returns the new count.
        """
        redis_key = self._get_usage_key(api_key)
        new_count = self.redis.incrby(redis_key, amount)
        
        # Set expiry to 48 hours (to ensure cleanup after day ends)
        self.redis.expire(redis_key, 48 * 60 * 60)
        
        return new_count
    
    def get_usage(self, api_key: str, date: Optional[str] = None) -> int:
        """Get current usage for a key."""
        redis_key = self._get_usage_key(api_key, date)
        usage = self.redis.get(redis_key)
        return int(usage) if usage else 0
    
    def get_remaining(self, api_key: str) -> int:
        """Get remaining verifications for a key today."""
        usage = self.get_usage(api_key)
        return max(0, DAILY_LIMIT - usage)
    
    def get_all_keys_usage(self) -> List[Dict]:
        """
        Get usage stats for all configured keys.
        Returns list of dicts with key info and usage.
        """
        keys = get_all_mailtester_keys()
        results = []
        
        today = get_today_date_gmt2()
        midnight = get_midnight_gmt2_timestamp()
        
        for api_key in keys:
            key_hash = get_key_hash(api_key)
            usage = self.get_usage(api_key)
            remaining = DAILY_LIMIT - usage
            
            results.append({
                "key_id": key_hash,
                "key_preview": f"...{api_key[-8:]}" if len(api_key) > 8 else api_key,
                "usage_today": usage,
                "remaining": max(0, remaining),
                "limit": DAILY_LIMIT,
                "usage_percentage": round((usage / DAILY_LIMIT) * 100, 2),
                "resets_at": midnight.isoformat(),
                "date": today
            })
        
        return results
    
    def get_best_key(self) -> Optional[str]:
        """
        Get the key with the most remaining capacity.
        Useful for load balancing across keys.
        """
        keys = get_all_mailtester_keys()
        if not keys:
            return None
        
        best_key = None
        best_remaining = -1
        
        for key in keys:
            remaining = self.get_remaining(key)
            if remaining > best_remaining:
                best_remaining = remaining
                best_key = key
        
        return best_key if best_remaining > 0 else None


# Singleton instance
_tracker: Optional[UsageTracker] = None


def get_usage_tracker() -> UsageTracker:
    """Get singleton usage tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = UsageTracker()
    return _tracker

