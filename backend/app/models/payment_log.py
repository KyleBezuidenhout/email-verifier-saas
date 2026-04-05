from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSON
from datetime import datetime
import uuid

from app.db.base import Base


class PaymentLog(Base):
    __tablename__ = "payment_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    whop_payment_id = Column(String(255), unique=True, nullable=False)
    event_type = Column(String(50), nullable=False)
    amount_dollars = Column(Numeric(10, 2), nullable=False)
    credits_delta = Column(Numeric(12, 1), nullable=False)
    old_balance = Column(Numeric(12, 1), nullable=False)
    new_balance = Column(Numeric(12, 1), nullable=False)
    plan_name = Column(String(20), nullable=True)
    whop_membership_id = Column(String(255), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("ix_payment_logs_user_created", "user_id", created_at.desc()),
    )
