from sqlalchemy import Column, String, Integer, DateTime, Boolean, Numeric
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=True)
    company_name = Column(String(255), nullable=True)
    company_website = Column(String(255), nullable=True)
    referral_source = Column(String(500), nullable=True)
    oauth_provider = Column(String(50), nullable=True)
    oauth_provider_id = Column(String(255), nullable=True)
    daily_cold_emails = Column(Integer, nullable=True)
    credits = Column(Numeric(12, 1), default=2000)
    plan = Column(String(20), default="trial", nullable=False, server_default="trial")
    custom_credit_price = Column(Numeric(10, 5), nullable=True)
    whop_membership_id = Column(String(255), nullable=True, unique=True)
    whop_user_id = Column(String(255), nullable=True)
    subscription_status = Column(String(30), default="none", nullable=False, server_default="none")
    billing_period_end = Column(DateTime(timezone=True), nullable=True)
    manage_url = Column(String(500), nullable=True)
    billing_interval = Column(String(10), default="monthly", nullable=False, server_default="monthly")
    yearly_credits_start = Column(DateTime(timezone=True), nullable=True)
    yearly_credits_granted = Column(Integer, default=0, nullable=False, server_default="0")
    api_key = Column(UUID(as_uuid=True), unique=True, default=uuid.uuid4)
    catchall_verifier_api_key = Column(String(255), nullable=True)
    max_concurrent_jobs = Column(Integer, default=3, nullable=False, server_default="3")
    password_reset_token = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False, server_default="true")
    email_verification_token = Column(String(255), nullable=True)
    email_verification_expires = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


