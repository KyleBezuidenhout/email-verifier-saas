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
)
from app.api.dependencies import get_current_user
from app.services.email_service import send_password_reset_email

router = APIRouter()
security = HTTPBearer()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        company_website=user_data.company_website,
        referral_source=user_data.referral_source,
        daily_cold_emails=user_data.daily_cold_emails,
        credits=100,
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(new_user.id)}, expires_delta=access_token_expires
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=new_user.id,
            email=new_user.email,
            full_name=new_user.full_name,
            company_name=new_user.company_name,
            credits=new_user.credits,
            api_key=new_user.api_key,
            catchall_verifier_api_key=new_user.catchall_verifier_api_key,
            is_active=new_user.is_active,
            is_admin=False,
            created_at=new_user.created_at.isoformat(),
        )
    )


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    # Find user
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verify password
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
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            company_name=user.company_name,
            credits=user.credits,
            api_key=user.api_key,
            catchall_verifier_api_key=user.catchall_verifier_api_key,
            is_active=user.is_active,
            is_admin=getattr(user, 'is_admin', False),
            created_at=user.created_at.isoformat(),
        )
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        company_name=current_user.company_name,
        credits=current_user.credits,
        api_key=current_user.api_key,
        catchall_verifier_api_key=current_user.catchall_verifier_api_key,
        is_active=current_user.is_active,
        is_admin=getattr(current_user, 'is_admin', False),
        created_at=current_user.created_at.isoformat(),
    )


@router.put("/me", response_model=UserResponse)
async def update_user_info(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user information (currently only catchall_verifier_api_key)."""
    # Update catchall verifier API key if provided
    if user_update.catchall_verifier_api_key is not None:
        current_user.catchall_verifier_api_key = user_update.catchall_verifier_api_key
    
    db.commit()
    db.refresh(current_user)
    
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        company_name=current_user.company_name,
        credits=current_user.credits,
        api_key=current_user.api_key,
        catchall_verifier_api_key=current_user.catchall_verifier_api_key,
        is_active=current_user.is_active,
        is_admin=getattr(current_user, 'is_admin', False),
        created_at=current_user.created_at.isoformat(),
    )


@router.post("/logout")
async def logout():
    # In a stateless JWT system, logout is handled client-side by removing the token
    # If you need server-side logout, you'd need to maintain a token blacklist
    return {"message": "Successfully logged out"}


@router.post("/regenerate-api-key", response_model=UserResponse)
async def regenerate_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate the user's API key. Old key will no longer work."""
    import uuid
    current_user.api_key = uuid.uuid4()
    db.commit()
    db.refresh(current_user)
    
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        company_name=current_user.company_name,
        credits=current_user.credits,
        api_key=current_user.api_key,
        catchall_verifier_api_key=current_user.catchall_verifier_api_key,
        is_active=current_user.is_active,
        is_admin=getattr(current_user, 'is_admin', False),
        created_at=current_user.created_at.isoformat(),
    )


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generate a password reset token and email it to the user. Always returns 200 to avoid email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()

    if user:
        token = secrets.token_urlsafe(48)
        user.password_reset_token = token
        user.password_reset_expires = datetime.utcnow() + timedelta(hours=24)
        db.commit()
        send_password_reset_email(user.email, token)

    return {"message": "If an account with that email exists, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
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

    user.hashed_password = get_password_hash(data.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    db.commit()

    return {"message": "Password has been reset successfully. You can now sign in."}
