"""
Error Logger Service

Logs verification errors with context for admin dashboard:
- User/job information
- Error type and message
- Timestamp
- Aggregation support
"""
import redis
import json
from datetime import datetime
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo
from app.core.config import settings


# GMT+2 timezone
GMT_PLUS_2 = ZoneInfo("Africa/Johannesburg")

# Max errors to keep per day
MAX_ERRORS_PER_DAY = 10000


def get_redis_client():
    """Get Redis client."""
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_today_date_gmt2() -> str:
    """Get today's date in GMT+2 timezone (YYYY-MM-DD format)."""
    now = datetime.now(GMT_PLUS_2)
    return now.strftime("%Y-%m-%d")


class ErrorLogger:
    """Log and retrieve verification errors."""
    
    def __init__(self):
        self.redis = get_redis_client()
    
    def _get_errors_key(self, date: Optional[str] = None) -> str:
        """Get Redis key for error logs."""
        date_str = date or get_today_date_gmt2()
        return f"verification:errors:{date_str}"
    
    def _get_error_counts_key(self, date: Optional[str] = None) -> str:
        """Get Redis key for error counts."""
        date_str = date or get_today_date_gmt2()
        return f"verification:error_counts:{date_str}"
    
    def log_error(
        self,
        user_id: str,
        user_email: str,
        job_id: str,
        error_type: str,
        error_message: str,
        email_attempted: Optional[str] = None,
        extra_data: Optional[Dict] = None
    ):
        """
        Log a verification error.
        """
        now = datetime.now(GMT_PLUS_2)
        
        error_entry = {
            "timestamp": now.isoformat(),
            "user_id": str(user_id),
            "user_email": user_email,
            "job_id": str(job_id),
            "error_type": error_type,
            "error_message": error_message,
            "email_attempted": email_attempted,
            "extra_data": extra_data or {}
        }
        
        errors_key = self._get_errors_key()
        counts_key = self._get_error_counts_key()
        
        # Add to list (newest first)
        self.redis.lpush(errors_key, json.dumps(error_entry))
        
        # Trim to max size
        self.redis.ltrim(errors_key, 0, MAX_ERRORS_PER_DAY - 1)
        
        # Set expiry to 7 days
        self.redis.expire(errors_key, 7 * 24 * 60 * 60)
        
        # Increment error count for this user/job
        count_field = f"{user_id}:{job_id}:{error_type}"
        self.redis.hincrby(counts_key, count_field, 1)
        self.redis.expire(counts_key, 7 * 24 * 60 * 60)
    
    def get_errors(
        self,
        date: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """
        Get error logs for a date.
        Returns newest first.
        """
        errors_key = self._get_errors_key(date)
        raw_errors = self.redis.lrange(errors_key, offset, offset + limit - 1)
        
        return [json.loads(e) for e in raw_errors]
    
    def get_error_count(self, date: Optional[str] = None) -> int:
        """Get total error count for a date."""
        errors_key = self._get_errors_key(date)
        return self.redis.llen(errors_key)
    
    def get_error_summary(self, date: Optional[str] = None) -> Dict:
        """
        Get error summary with counts by type and user.
        """
        counts_key = self._get_error_counts_key(date)
        all_counts = self.redis.hgetall(counts_key)
        
        # Parse counts into structured data
        by_user = {}
        by_job = {}
        by_type = {}
        total = 0
        
        for key, count in all_counts.items():
            count = int(count)
            total += count
            
            parts = key.split(":", 2)
            if len(parts) == 3:
                user_id, job_id, error_type = parts
                
                # By user
                if user_id not in by_user:
                    by_user[user_id] = 0
                by_user[user_id] += count
                
                # By job
                if job_id not in by_job:
                    by_job[job_id] = 0
                by_job[job_id] += count
                
                # By type
                if error_type not in by_type:
                    by_type[error_type] = 0
                by_type[error_type] += count
        
        return {
            "date": date or get_today_date_gmt2(),
            "total_errors": total,
            "by_user": by_user,
            "by_job": by_job,
            "by_type": by_type
        }
    
    def get_errors_for_job(self, job_id: str, date: Optional[str] = None) -> List[Dict]:
        """Get all errors for a specific job."""
        errors = self.get_errors(date, limit=MAX_ERRORS_PER_DAY)
        return [e for e in errors if e.get("job_id") == str(job_id)]
    
    def get_errors_for_user(self, user_id: str, date: Optional[str] = None) -> List[Dict]:
        """Get all errors for a specific user."""
        errors = self.get_errors(date, limit=MAX_ERRORS_PER_DAY)
        return [e for e in errors if e.get("user_id") == str(user_id)]


# Singleton instance
_logger: Optional[ErrorLogger] = None


def get_error_logger() -> ErrorLogger:
    """Get singleton error logger instance."""
    global _logger
    if _logger is None:
        _logger = ErrorLogger()
    return _logger

