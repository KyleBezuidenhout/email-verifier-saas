"""
WorkerConfig Model

Stores per-client configuration for dedicated worker routing.
Each client can have their own verification queue and worker settings.
"""

from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class WorkerConfig(Base):
    """
    Configuration for dedicated worker routing.
    
    When a client has a WorkerConfig entry:
    - Their enrichment jobs are routed to their dedicated verification queue
    - Their verification-only jobs go directly to their dedicated queue
    - They have isolated processing with their own API keys (configured in worker env vars)
    """
    __tablename__ = "worker_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Reference to user - one config per user
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    
    # Worker mode: 'dedicated' (default) or 'shared'
    worker_mode = Column(String(20), default="dedicated", nullable=False)
    
    # Queue name for verification jobs (e.g., "verification-queue:client-abc123")
    verification_queue = Column(String(255), nullable=False, index=True)
    
    # Optional: custom enrichment queue (usually shared)
    enrichment_queue = Column(String(255), nullable=True)
    
    # Display hint for API key (last 4 chars, for admin dashboard)
    api_key_hint = Column(String(50), nullable=True)
    
    # Admin notes about this client's setup
    notes = Column(Text, nullable=True)
    
    # Whether this dedicated setup is active
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationship to user
    user = relationship("User", backref="worker_config")
    
    def __repr__(self):
        return f"<WorkerConfig user_id={self.user_id} queue={self.verification_queue}>"
    
    @classmethod
    def get_for_user(cls, db, user_id) -> "WorkerConfig":
        """Get worker config for a user, or None if not configured."""
        return db.query(cls).filter(
            cls.user_id == user_id,
            cls.is_active == True
        ).first()
    
    @classmethod
    def get_verification_queue(cls, db, user_id) -> str:
        """
        Get the verification queue name for a user.
        Returns the dedicated queue if configured, otherwise the shared queue.
        """
        config = cls.get_for_user(db, user_id)
        if config:
            return config.verification_queue
        return "simple-email-verification-queue"  # Shared queue fallback
    
    @classmethod
    def get_enrichment_queue(cls, db, user_id) -> str:
        """
        Get the enrichment queue name for a user.
        Returns the custom enrichment queue if configured, otherwise the shared queue.
        """
        config = cls.get_for_user(db, user_id)
        if config and config.enrichment_queue:
            return config.enrichment_queue
        return "enrichment-job-creation"  # Shared queue (default)

