from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError
from typing import Optional
import uuid

from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User
from app.core.config import settings, ADMIN_EMAIL

security = HTTPBearer(auto_error=False)
security_required = HTTPBearer()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current user via either JWT Bearer token or API key.
    Supports both authentication methods for web UI (JWT) and integrations (API key).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Provide either Bearer token or X-API-Key header.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    resolved_user = None

    # Try API key authentication first (for integrations like Clay.com)
    if x_api_key:
        try:
            api_key_uuid = uuid.UUID(x_api_key)
            user = db.query(User).filter(User.api_key == api_key_uuid).first()
            if user and user.is_active:
                resolved_user = user
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key or account inactive"
                )
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key format"
            )

    # Fall back to JWT Bearer token (for web UI)
    if resolved_user is None and credentials:
        token = credentials.credentials
        payload = decode_token(token)

        if payload is None:
            raise credentials_exception

        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise credentials_exception

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )

        resolved_user = user

    if resolved_user is None:
        raise credentials_exception

    if not getattr(resolved_user, 'email_verified', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address not verified"
        )

    return resolved_user


async def require_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Require the current user to be an admin.
    Checks both is_admin flag and hardcoded admin email as fallback.
    """
    is_admin = getattr(current_user, 'is_admin', False) or current_user.email == ADMIN_EMAIL
    
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return current_user