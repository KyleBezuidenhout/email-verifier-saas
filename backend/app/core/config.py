from pydantic_settings import BaseSettings
from typing import Optional

# Admin email constant - defined here to avoid circular imports in workers
ADMIN_EMAIL = "ben@superwave.io"


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

    # Vayne (Sales Nav Scraper)
    VAYNE_API_KEYS: str = ""  # Comma-separated: "key1,key2"
    VAYNE_API_KEY: str = ""  # Legacy single key (fallback if VAYNE_API_KEYS is empty)
    VAYNE_API_BASE_URL: str = "https://www.vayne.io"
    VAYNE_PER_CLIENT_DAILY_LIMIT: int = 15000  # Max leads per client per rolling 24h window
    VAYNE_POLLING_INTERVAL_MS: int = 5000
    VAYNE_POLLING_MAX_INTERVAL_MS: int = 30000
    VAYNE_QUEUE_WORKER_POLL_INTERVAL: int = 30  # seconds
    VAYNE_QUEUE_WORKER_ACTIVE_CHECK_INTERVAL: int = 60  # seconds
    
    # Webhook authentication
    WEBHOOK_SECRET_TOKEN: str = ""  # Secret token for webhook authentication

    # OmniVerifier
    OMNIVERIFIER_API_KEY: str
    OMNIVERIFIER_BASE_URL: str = "https://api.omniverifier.com"  # Base URL without /v1 (we add /v1 in paths)

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""  # Optional for now, needed for production webhooks
    FRONTEND_URL: str = "http://localhost:3000"  # For redirect URLs
    
    # Apify API (Google Maps Scraper)
    APIFY_API_TOKEN: str = ""  # Apify API token for compass/crawler-google-places
    APIFY_WEBHOOK_SECRET: str = ""  # Secret for verifying Apify webhook callbacks
    
    # ZenRows API (Website contact scraping)
    ZENROWS_API_KEY: str = ""  # ZenRows API key
    ZENROWS_CONCURRENCY: int = 40  # Max concurrent requests (using mode=auto)
    
    # Cloudflare R2 Public URL for file access
    CLOUDFLARE_R2_PUBLIC_URL: str = ""  # Public URL for accessing R2 files

    # MailTester per-key tuning (comma-separated, one per key — defaults used if empty)
    MAILTESTER_KEY_SPACINGS: str = ""             # ms between requests per key (default 250)
    MAILTESTER_KEY_REQUESTS_PER_30S: str = ""     # max requests in 30 s window per key (default 165)
    MAILTESTER_KEY_DAILY_LIMITS: str = ""         # daily cap per key (default 500000)

    # Enrichment API rate limiting / concurrency
    ENRICH_API_RATE_LIMIT_PER_SECOND: int = 5
    ENRICH_API_RATE_LIMIT_PER_MINUTE: int = 120
    ENRICH_API_MAX_CONCURRENT_PER_USER: int = 5
    ENRICH_API_CONCURRENT_PER_KEY: int = 10       # global cap = num_keys * this
    ENRICH_API_ACQUIRE_TIMEOUT_SECONDS: float = 30.0
    ENRICH_API_REQUEST_TIMEOUT_SECONDS: float = 45.0

    # App
    APP_NAME: str = "Email Verifier SaaS"
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()


