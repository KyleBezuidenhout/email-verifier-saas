"""
Vayne API Usage Tracker Service

Tracks daily API calls to Vayne API for admin dashboard statistics.
"""
import redis
from datetime import datetime
from typing import Dict
from zoneinfo import ZoneInfo
from app.core.config import settings


# GMT+2 timezone
GMT_PLUS_2 = ZoneInfo("Africa/Johannesburg")


def get_redis_client():
    """Get Redis client."""
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_today_date_gmt2() -> str:
    """Get today's date in GMT+2 timezone (YYYY-MM-DD format)."""
    now = datetime.now(GMT_PLUS_2)
    return now.strftime("%Y-%m-%d")


class VayneUsageTracker:
    """Track Vayne API usage per day."""
    
    def __init__(self):
        self.redis = get_redis_client()
    
    def _get_usage_key(self, date: str = None) -> str:
        """Get Redis key for usage tracking."""
        date_str = date or get_today_date_gmt2()
        return f"vayne:usage:{date_str}"
    
    def increment_usage(self, amount: int = 1) -> int:
        """
        Increment usage counter for today.
        Returns the new count.
        """
        redis_key = self._get_usage_key()
        new_count = self.redis.incrby(redis_key, amount)
        
        # Set expiry to 48 hours (to ensure cleanup after day ends)
        self.redis.expire(redis_key, 48 * 60 * 60)
        
        return new_count
    
    def get_usage_today(self) -> int:
        """Get current usage for today."""
        redis_key = self._get_usage_key()
        usage = self.redis.get(redis_key)
        return int(usage) if usage else 0
    
    def get_usage(self, date: str = None) -> int:
        """Get usage for a specific date (defaults to today)."""
        redis_key = self._get_usage_key(date)
        usage = self.redis.get(redis_key)
        return int(usage) if usage else 0
    
    def get_daily_stats(self) -> Dict:
        """Get daily usage statistics."""
        today = get_today_date_gmt2()
        calls_today = self.get_usage_today()
        
        return {
            "date": today,
            "calls_today": calls_today,
        }


# Singleton instance
_vayne_usage_tracker: VayneUsageTracker = None


def get_vayne_usage_tracker() -> VayneUsageTracker:
    """Get or create Vayne usage tracker singleton."""
    global _vayne_usage_tracker
    if _vayne_usage_tracker is None:
        _vayne_usage_tracker = VayneUsageTracker()
    return _vayne_usage_tracker

