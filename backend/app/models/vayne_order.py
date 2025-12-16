from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class VayneOrder(Base):
    __tablename__ = "vayne_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    vayne_order_id = Column(String(255), unique=True, nullable=True, index=True)  # Vayne's order ID (e.g., "123")
    status = Column(String(50))
    url = Column(Text)
    export_format = Column(String(20))
    qualified_leads_only = Column(Boolean, default=False)
    estimated_leads = Column(Integer)
    leads_found = Column(Integer)
    leads_qualified = Column(Integer)
    progress_percentage = Column(Integer)
    credits_charged = Column(Integer)
    file_url = Column(Text)  # URL to CSV file (set by n8n when order completes)
    targeting = Column(String(255))  # Job name/description
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True))


