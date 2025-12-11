from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company_name: Optional[str] = None


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
    created_at: str

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    catchall_verifier_api_key: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

