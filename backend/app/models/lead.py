from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class Lead(Base):
    __tablename__ = "leads"

    

    id = Column(BigInteger, primary_key=True, index=True)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=False)
    domain = Column(String(255), nullable=False)
    company_size = Column(String(50))
    email = Column(String(255), nullable=False, index=True)
    pattern_used = Column(String(50))
    prevalence_score = Column(Integer)
    verification_status = Column(String(50), default="pending", index=True)  # pending, valid, invalid, catchall, error
    is_final_result = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


