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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days (30 * 24 * 60 = 43200 minutes)

    

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

    

    # App
    APP_NAME: str = "Email Verifier SaaS"
    DEBUG: bool = False

    

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()



