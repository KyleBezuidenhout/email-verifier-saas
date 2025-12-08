from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Text
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
    original_filename = Column(Text)
    total_leads = Column(Integer, nullable=False)
    processed_leads = Column(Integer, default=0)
    valid_emails_found = Column(Integer, default=0)
    catchall_emails_found = Column(Integer, default=0)
    cost_in_credits = Column(Integer, default=0)
    input_file_path = Column(Text)  # Path in Cloudflare R2
    output_file_path = Column(Text)  # Path in Cloudflare R2
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    completed_at = Column(DateTime(timezone=True))


