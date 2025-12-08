#!/usr/bin/env python3
"""
Database initialization script.
Creates all tables from the SQLAlchemy models.
"""

from app.db.base import Base
from app.db.session import engine
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead


def init_db():
    """Create all database tables."""
    print("Creating database tables...")
    
    # Create all tables defined in the models
    Base.metadata.create_all(bind=engine)
    
    print("✓ Database tables created successfully!")
    print("  - users")
    print("  - jobs")
    print("  - leads")


if __name__ == "__main__":
    init_db()


