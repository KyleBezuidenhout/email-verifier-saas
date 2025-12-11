from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default="pending", index=True)  # pending, processing, completed, failed, cancelled
    job_type = Column(String(50), default="enrichment", index=True)  # enrichment or verification
    source = Column(String(50), nullable=True, index=True)  # e.g., "Sales Nav"
    original_filename = Column(String(255), nullable=True)
    total_leads = Column(Integer, default=0)
    processed_leads = Column(Integer, default=0)
    valid_emails_found = Column(Integer, default=0)
    catchall_emails_found = Column(Integer, default=0)
    cost_in_credits = Column(Integer, default=0)
    input_file_path = Column(String(500), nullable=True)
    output_file_path = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

