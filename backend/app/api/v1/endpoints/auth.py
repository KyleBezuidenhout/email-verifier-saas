from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
import secrets

from app.db.session import get_db
from app.models.user import User
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.schemas.auth import (
    UserRegister, UserLogin, TokenResponse, UserResponse, UserUpdate,
    ForgotPasswordRequest, ResetPasswordRequest,
    RegisterPendingResponse, VerifyEmailRequest, ResendVerificationRequest,
    ForgotPasswordResponse,
)
from app.api.dependencies import get_current_user
from app.services.email_service import (
    send_password_reset_email,
    send_verification_email,
    send_new_signup_notification,
)

router = APIRouter()
security = HTTPBearer()


def _build_user_response(user: User, **overrides) -> UserResponse:
    data = dict(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        company_name=user.company_name,
        company_website=user.company_website,
        credits=float(user.credits) if user.credits is not None else 0.0,
        plan=getattr(user, 'plan', 'trial') or 'trial',
        custom_credit_price=float(user.custom_credit_price) if getattr(user, 'custom_credit_price', None) else None,
        api_key=user.api_key,
        catchall_verifier_api_key=user.catchall_verifier_api_key,
        is_active=user.is_active,
        is_admin=getattr(user, 'is_admin', False),
        email_verified=getattr(user, 'email_verified', True),
        oauth_provider=getattr(user, 'oauth_provider', None),
        created_at=user.created_at.isoformat(),
    )
    data.update(overrides)
    return UserResponse(**data)


@router.post("/register", response_model=RegisterPendingResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()

    if existing_user:
        if getattr(existing_user, 'oauth_provider', None):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This email is already registered via {existing_user.oauth_provider.title()} Sign-In. Please sign in with {existing_user.oauth_provider.title()} instead.",
            )
        if not getattr(existing_user, 'email_verified', True):
            token = secrets.token_urlsafe(48)
            existing_user.email_verification_token = token
            existing_user.email_verification_expires = datetime.utcnow() + timedelta(hours=48)
            existing_user.hashed_password = get_password_hash(user_data.password)
            existing_user.full_name = user_data.full_name
            existing_user.company_name = user_data.company_name
            existing_user.company_website = user_data.company_website
            existing_user.referral_source = user_data.referral_source
            existing_user.daily_cold_emails = user_data.daily_cold_emails
            db.commit()
            send_verification_email(existing_user.email, token)
            return RegisterPendingResponse(
                message="A verification link has been sent to your email address.",
                email=existing_user.email,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    hashed_password = get_password_hash(user_data.password)
    token = secrets.token_urlsafe(48)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        company_website=user_data.company_website,
        referral_source=user_data.referral_source,
        daily_cold_emails=user_data.daily_cold_emails,
        credits=5000,
        email_verified=False,
        email_verification_token=token,
        email_verification_expires=datetime.utcnow() + timedelta(hours=48),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    send_verification_email(new_user.email, token)
    send_new_signup_notification(
        user_email=new_user.email,
        full_name=new_user.full_name,
        company_name=new_user.company_name,
        company_website=new_user.company_website,
        referral_source=new_user.referral_source,
        daily_cold_emails=new_user.daily_cold_emails,
        oauth_provider=getattr(new_user, "oauth_provider", None),
    )

    return RegisterPendingResponse(
        message="A verification link has been sent to your email address.",
        email=new_user.email,
    )


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    # Find user
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.hashed_password:
        provider = getattr(user, 'oauth_provider', 'OAuth') or 'OAuth'
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This account uses {provider.title()} Sign-In. Please use the {provider.title()} button to sign in.",
        )

    if not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    if not getattr(user, 'email_verified', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please confirm your email address before signing in."
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return _build_user_response(current_user)


@router.put("/me", response_model=UserResponse)
def update_user_info(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user information."""
    if user_update.catchall_verifier_api_key is not None:
        current_user.catchall_verifier_api_key = user_update.catchall_verifier_api_key
    if user_update.company_website is not None:
        current_user.company_website = user_update.company_website
    if user_update.referral_source is not None:
        current_user.referral_source = user_update.referral_source

    db.commit()
    db.refresh(current_user)

    return _build_user_response(current_user)


@router.post("/logout")
async def logout():
    # In a stateless JWT system, logout is handled client-side by removing the token
    # If you need server-side logout, you'd need to maintain a token blacklist
    return {"message": "Successfully logged out"}


@router.post("/regenerate-api-key", response_model=UserResponse)
def regenerate_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate the user's API key. Old key will no longer work."""
    import uuid
    current_user.api_key = uuid.uuid4()
    db.commit()
    db.refresh(current_user)

    return _build_user_response(current_user)


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generate a password reset token and email it to the user. Always returns 200 to avoid email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()

    if user:
        if getattr(user, 'oauth_provider', None) and not user.hashed_password:
            return ForgotPasswordResponse(
                message="If an account with that email exists, a password reset link has been sent.",
                oauth_provider=user.oauth_provider,
            )

        token = secrets.token_urlsafe(48)
        user.password_reset_token = token
        user.password_reset_expires = datetime.utcnow() + timedelta(hours=24)
        db.commit()
        send_password_reset_email(user.email, token)

    return ForgotPasswordResponse(
        message="If an account with that email exists, a password reset link has been sent.",
    )


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate the reset token and set a new password."""
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )

    user = db.query(User).filter(
        User.password_reset_token == data.token,
        User.password_reset_expires > datetime.utcnow(),
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link. Please request a new one.",
        )

    if getattr(user, 'oauth_provider', None) and not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This account uses {user.oauth_provider.title()} Sign-In and has no password to reset.",
        )

    user.hashed_password = get_password_hash(data.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    db.commit()

    return {"message": "Password has been reset successfully. You can now sign in."}


@router.post("/verify-email", response_model=TokenResponse)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verify the user's email address using the token from the confirmation link."""
    user = db.query(User).filter(
        User.email_verification_token == data.token,
        User.email_verification_expires > datetime.utcnow(),
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link. Please request a new one.",
        )

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expires = None
    db.commit()
    db.refresh(user)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_response(user, email_verified=True),
    )


@router.post("/resend-verification")
def resend_verification(data: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Resend the verification email. Always returns 200 to avoid email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()

    if user and not getattr(user, 'email_verified', True):
        token = secrets.token_urlsafe(48)
        user.email_verification_token = token
        user.email_verification_expires = datetime.utcnow() + timedelta(hours=48)
        db.commit()
        send_verification_email(user.email, token)

    return {"message": "If an account with that email exists and is not yet verified, a new verification link has been sent."}
