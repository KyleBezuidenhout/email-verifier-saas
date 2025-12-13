from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 14400  # 10 days (10 * 24 * 60 = 14400 minutes)

    # Cloudflare R2
    CLOUDFLARE_R2_ACCESS_KEY_ID: str
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: str
    CLOUDFLARE_R2_BUCKET_NAME: str
    CLOUDFLARE_R2_ACCOUNT_ID: str
    CLOUDFLARE_R2_ENDPOINT_URL: str

    # MailTester (supports multiple keys comma-separated)
    MAILTESTER_API_KEYS: str = ""  # Comma-separated: "key1,key2,key3"
    MAILTESTER_API_KEY: str = ""  # Legacy single key (fallback)
    MAILTESTER_BASE_URL: str = "https://happy.mailtester.ninja/ninja"

    # OmniVerifier
    OMNIVERIFIER_API_KEY: str
    OMNIVERIFIER_BASE_URL: str = "https://api.omniverifier.com"  # Base URL without /v1 (we add /v1 in paths)

    # Vayne API (Sales Nav Scraper)
    VAYNE_API_KEY: str = ""
    VAYNE_API_BASE_URL: str = "https://www.vayne.io"
    VAYNE_API_POLLING_INTERVAL: int = 5000  # 5 seconds in milliseconds (deprecated, kept for compatibility)
    VAYNE_API_POLLING_MAX_INTERVAL: int = 30000  # 30 seconds max in milliseconds (deprecated)
    WEBHOOK_BASE_URL: str = "https://www.billionverifier.io"  # Base URL for webhook endpoints
    
    # Vayne Worker Configuration
    VAYNE_WORKER_POLL_INTERVAL: int = 10  # Seconds between status polls (matches test file poll_interval=10)
    VAYNE_WORKER_MAX_RETRIES: int = 3  # Max retries for failed operations
    VAYNE_WORKER_BACKOFF_FACTOR: float = 2.0  # Exponential backoff multiplier
    VAYNE_WORKER_MAX_WAIT_MINUTES: int = 30  # Maximum wait time for order completion (matches test file max_wait_minutes=30)
    
    # Vayne Queue Worker Configuration
    VAYNE_QUEUE_WORKER_POLL_INTERVAL: int = 30  # Seconds between checks for queued orders
    VAYNE_QUEUE_WORKER_ACTIVE_CHECK_INTERVAL: int = 60  # Seconds between checks for active order status

    # App
    APP_NAME: str = "Email Verifier SaaS"
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

