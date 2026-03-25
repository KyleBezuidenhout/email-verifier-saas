from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID

# Personal email domains that are blocked (except gmail.com which is allowed)
BLOCKED_EMAIL_DOMAINS = [
    # Apple
    "icloud.com", "me.com", "mac.com",
    # Microsoft
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    # Yahoo
    "yahoo.com", "ymail.com",
    # Other personal providers
    "aol.com", "protonmail.com", "proton.me",
    "zoho.com", "mail.com", "gmx.com", "gmx.net",
    "inbox.com", "fastmail.com",
    # ISP emails
    "att.net", "verizon.net", "comcast.net", "cox.net",
    "sbcglobal.net", "bellsouth.net", "earthlink.net",
]


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company_name: Optional[str] = None
    company_website: str
    referral_source: str
    daily_cold_emails: Optional[int] = None

    @field_validator("email")
    @classmethod
    def validate_email_domain(cls, v: str) -> str:
        domain = v.lower().split("@")[1]
        if domain == "gmail.com":
            return v
        if domain in BLOCKED_EMAIL_DOMAINS:
            raise ValueError("Please Enter A Company Email")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    credits: int
    api_key: UUID
    catchall_verifier_api_key: Optional[str] = None
    is_active: bool
    is_admin: bool = False
    email_verified: bool = True
    created_at: str

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    catchall_verifier_api_key: Optional[str] = None

    class Config:
        from_attributes = True


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class RegisterPendingResponse(BaseModel):
    message: str
    email: str


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr

