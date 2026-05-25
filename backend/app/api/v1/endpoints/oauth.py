import secrets
import hashlib
import hmac
import time
import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from app.db.session import get_db
from app.models.user import User
from app.core.config import settings
from app.core.security import create_access_token
from app.schemas.auth import (
    OAuthAuthorizeResponse,
    OAuthCallbackRequest,
    TokenResponse,
    BLOCKED_EMAIL_DOMAINS,
)
from app.api.v1.endpoints.auth import _build_user_response
from app.services.email_service import send_new_signup_notification

logger = logging.getLogger(__name__)

router = APIRouter()

SUPPORTED_PROVIDERS = {"google", "microsoft"}

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

MICROSOFT_AUTH_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
MICROSOFT_TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
MICROSOFT_USERINFO_URL = "https://graph.microsoft.com/v1.0/me"

STATE_TTL_SECONDS = 600  # 10 minutes


def _sign_state(nonce: str) -> str:
    """Create an HMAC-signed state token containing a nonce and timestamp."""
    ts = str(int(time.time()))
    payload = f"{nonce}:{ts}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{payload}:{sig}"


def _verify_state(state: str) -> bool:
    """Verify HMAC signature and check expiry of a state token."""
    parts = state.split(":")
    if len(parts) != 3:
        return False
    nonce, ts, sig = parts
    try:
        created = int(ts)
    except ValueError:
        return False
    if time.time() - created > STATE_TTL_SECONDS:
        return False
    expected = hmac.new(settings.SECRET_KEY.encode(), f"{nonce}:{ts}".encode(), hashlib.sha256).hexdigest()[:16]
    return hmac.compare_digest(sig, expected)


def _get_redirect_uri(provider: str) -> str:
    frontend = settings.FRONTEND_URL.rstrip("/")
    return f"{frontend}/auth/callback/{provider}"


def _is_email_allowed(email: str) -> bool:
    domain = email.lower().split("@")[-1]
    if domain == "gmail.com":
        return True
    return domain not in BLOCKED_EMAIL_DOMAINS


def _validate_provider(provider: str):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}. Use 'google' or 'microsoft'.",
        )


@router.get("/{provider}/authorize", response_model=OAuthAuthorizeResponse)
def oauth_authorize(provider: str):
    _validate_provider(provider)

    nonce = secrets.token_urlsafe(24)
    state = _sign_state(nonce)

    redirect_uri = _get_redirect_uri(provider)

    if provider == "google":
        if not settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=500, detail="Google OAuth is not configured.")
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
        auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    else:
        if not settings.MICROSOFT_CLIENT_ID:
            raise HTTPException(status_code=500, detail="Microsoft OAuth is not configured.")
        tenant = settings.MICROSOFT_TENANT_ID or "organizations"
        params = {
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile User.Read",
            "state": state,
            "prompt": "select_account",
        }
        auth_url = f"{MICROSOFT_AUTH_URL_TEMPLATE.format(tenant=tenant)}?{urlencode(params)}"

    return OAuthAuthorizeResponse(auth_url=auth_url, state=state)


@router.post("/{provider}/callback", response_model=TokenResponse)
async def oauth_callback(provider: str, body: OAuthCallbackRequest, db: Session = Depends(get_db)):
    _validate_provider(provider)

    if not _verify_state(body.state):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state. Please try signing in again.",
        )

    redirect_uri = _get_redirect_uri(provider)

    try:
        if provider == "google":
            user_info = await _exchange_google(body.code, redirect_uri)
        else:
            user_info = await _exchange_microsoft(body.code, redirect_uri)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth token exchange failed for {provider}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to authenticate with {provider.title()}. Please try again.",
        )

    email = user_info["email"].lower().strip()
    provider_id = user_info["sub"]
    full_name = user_info.get("name", "")
    picture_url = user_info.get("picture", "") or None

    if not _is_email_allowed(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please use a company email address. Personal email providers are not allowed.",
        )

    existing_user = db.query(User).filter(User.email == email).first()

    if existing_user:
        if not getattr(existing_user, 'oauth_provider', None):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Please sign in with your email and password.",
            )
        if existing_user.oauth_provider != provider:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An account with this email already exists via {existing_user.oauth_provider.title()} Sign-In.",
            )

        if not existing_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive.",
            )

        existing_user.oauth_provider_id = provider_id
        if full_name and not existing_user.full_name:
            existing_user.full_name = full_name
        if picture_url:
            existing_user.profile_picture_url = picture_url
        db.commit()
        db.refresh(existing_user)

        access_token = create_access_token(
            data={"sub": str(existing_user.id)},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=_build_user_response(existing_user),
        )

    new_user = User(
        email=email,
        hashed_password=None,
        full_name=full_name,
        oauth_provider=provider,
        oauth_provider_id=provider_id,
        profile_picture_url=picture_url,
        email_verified=True,
        onboarding_completed=False,
        credits=500,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    send_new_signup_notification(
        user_email=new_user.email,
        full_name=new_user.full_name,
        company_name=new_user.company_name,
        company_website=new_user.company_website,
        referral_source=new_user.referral_source,
        daily_cold_emails=new_user.daily_cold_emails,
        oauth_provider=new_user.oauth_provider,
    )

    access_token = create_access_token(
        data={"sub": str(new_user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_response(new_user),
    )


async def _exchange_google(code: str, redirect_uri: str) -> dict:
    """Exchange Google auth code for tokens and return user info."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })

        if token_resp.status_code != 200:
            logger.error(f"Google token exchange failed: {token_resp.status_code} {token_resp.text}")
            raise HTTPException(status_code=502, detail="Google authentication failed.")

        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="Google did not return an access token.")

        info_resp = await client.get(GOOGLE_USERINFO_URL, headers={
            "Authorization": f"Bearer {access_token}",
        })

        if info_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch Google user info.")

        info = info_resp.json()
        email = info.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Google account does not have an email address.")

        return {"email": email, "sub": info.get("sub", ""), "name": info.get("name", ""), "picture": info.get("picture", "")}


async def _exchange_microsoft(code: str, redirect_uri: str) -> dict:
    """Exchange Microsoft auth code for tokens and return user info."""
    tenant = settings.MICROSOFT_TENANT_ID or "organizations"
    token_url = MICROSOFT_TOKEN_URL_TEMPLATE.format(tenant=tenant)

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(token_url, data={
            "code": code,
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "client_secret": settings.MICROSOFT_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": "openid email profile User.Read",
        })

        if token_resp.status_code != 200:
            logger.error(f"Microsoft token exchange failed: {token_resp.status_code} {token_resp.text}")
            raise HTTPException(status_code=502, detail="Microsoft authentication failed.")

        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="Microsoft did not return an access token.")

        info_resp = await client.get(MICROSOFT_USERINFO_URL, headers={
            "Authorization": f"Bearer {access_token}",
        })

        if info_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch Microsoft user info.")

        info = info_resp.json()
        email = info.get("mail") or info.get("userPrincipalName", "")
        if not email:
            raise HTTPException(status_code=400, detail="Microsoft account does not have an email address.")

        return {
            "email": email,
            "sub": info.get("id", ""),
            "name": info.get("displayName", ""),
        }
