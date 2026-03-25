from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.db.base import Base


class QueueDepthSnapshot(Base):
    __tablename__ = "queue_depth_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    active_jobs = Column(Integer, nullable=False, default=0)
    queued_jobs = Column(Integer, nullable=False, default=0)
    waiting_room_jobs = Column(Integer, nullable=False, default=0)
    vayne_queued = Column(Integer, nullable=False, default=0)
    catchall_queued = Column(Integer, nullable=False, default=0)
