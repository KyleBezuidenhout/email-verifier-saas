from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
import uuid

from app.db.base import Base


class Lead(Base):
    __tablename__ = "leads"

    

    id = Column(BigInteger, primary_key=True, index=True)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=False)
    domain = Column(String(255), nullable=False)
    company_size = Column(String(50))
    email = Column(String(255), nullable=False, index=True)
    pattern_used = Column(String(50))
    prevalence_score = Column(Integer)
    verification_status = Column(String(50), default="pending", index=True)  # pending, valid, invalid, catchall, error
    verification_tag = Column(String(50), nullable=True)  # catchall-verified, etc.
    mx_record = Column(String(255), nullable=True)  # MX hostname (e.g., "aspmx.l.google.com")
    mx_provider = Column(String(50), nullable=True, index=True)  # Provider category: "outlook", "google", "other"
    extra_data = Column(JSONB, default={})  # Stores all additional CSV columns not in standard schema
    is_final_result = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


