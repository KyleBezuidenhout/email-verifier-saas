from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class VayneOrder(Base):
    __tablename__ = "vayne_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    vayne_order_id = Column(String(255), nullable=False, unique=True, index=True)  # Vayne's order ID (required for webhook matching)
    status = Column(String(50), default="pending", index=True)  # pending, processing, completed, failed
    sales_nav_url = Column(Text, nullable=False)
    export_format = Column(String(50), default="simple")  # simple or advanced
    only_qualified = Column(Boolean, default=False)
    leads_found = Column(Integer, nullable=True)
    leads_qualified = Column(Integer, nullable=True)
    progress_percentage = Column(Integer, default=0)
    estimated_completion = Column(String(255), nullable=True)
    linkedin_cookie = Column(Text, nullable=True)  # Store li_at cookie temporarily (encrypted in production)
    csv_file_path = Column(String(500), nullable=True)  # Deprecated: kept for backwards compatibility, use csv_data instead
    csv_data = Column(Text, nullable=True)  # CSV content stored in PostgreSQL (replaces R2 storage)
    targeting = Column(String(255), nullable=True)  # Job name/targeting description
    name = Column(String(255), nullable=True)  # Order name from Vayne API (optional - for display/logging only)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

