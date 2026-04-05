#!/usr/bin/env python3
"""
Yearly Credit Drip Worker

Runs on a schedule (every 1 hour) and adds monthly credit allotments
to yearly subscribers. Each yearly subscriber receives 12 monthly drips
over their subscription year — one drip per ~30 days.

Logic:
  - Query all users with billing_interval='yearly', subscription_status='active',
    yearly_credits_granted < 12
  - For each, check if enough time has passed since their last drip
    (yearly_credits_start + yearly_credits_granted * 30 days <= now)
  - If due, add the monthly credit amount and increment yearly_credits_granted
  - After 12 drips, the user has received their full yearly credits and
    no more drips occur until their subscription renews (which resets the counter)
"""

import os
import sys
import time
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import create_engine, and_
from sqlalchemy.orm import sessionmaker

workers_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(workers_dir, '..', 'backend'))
sys.path.insert(0, workers_dir)

from app.core.config import settings
from app.core.plans import get_plan_credits
from app.models.user import User

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

DRIP_INTERVAL_DAYS = 30
MAX_DRIPS = 12
POLL_INTERVAL_SECONDS = int(os.environ.get("DRIP_POLL_INTERVAL", "3600"))


def process_drips():
    """Check all yearly subscribers and issue credit drips that are due."""
    db = SessionLocal()
    dripped_count = 0
    try:
        users = (
            db.query(User)
            .filter(
                and_(
                    User.billing_interval == "yearly",
                    User.subscription_status == "active",
                    User.yearly_credits_granted < MAX_DRIPS,
                    User.yearly_credits_start.isnot(None),
                )
            )
            .all()
        )

        if not users:
            logger.info("No yearly subscribers due for credit drip")
            return 0

        now = datetime.now(timezone.utc)

        for user in users:
            start = user.yearly_credits_start
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)

            granted = user.yearly_credits_granted or 0
            next_drip_due = start + timedelta(days=DRIP_INTERVAL_DAYS * granted)

            if now < next_drip_due:
                continue

            credits_to_add = get_plan_credits(user.plan, "yearly")
            if credits_to_add <= 0:
                logger.warning(f"No credits configured for plan={user.plan}/yearly, skipping {user.email}")
                continue

            old_balance = float(user.credits or 0)
            user.credits = old_balance + credits_to_add
            user.yearly_credits_granted = granted + 1
            dripped_count += 1

            logger.info(
                f"Drip {granted + 1}/{MAX_DRIPS}: {user.email} "
                f"plan={user.plan}/yearly +{credits_to_add:,} credits "
                f"(balance {old_balance:,.0f} -> {float(user.credits):,.0f})"
            )

        if dripped_count > 0:
            db.commit()
            logger.info(f"Committed {dripped_count} credit drips")

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing credit drips: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

    return dripped_count


def main():
    logger.info(
        f"Yearly Credit Drip Worker started "
        f"(poll interval: {POLL_INTERVAL_SECONDS}s, "
        f"drip interval: {DRIP_INTERVAL_DAYS} days, "
        f"max drips: {MAX_DRIPS})"
    )

    while True:
        try:
            count = process_drips()
            if count > 0:
                logger.info(f"Drip cycle complete: {count} users credited")
        except Exception as e:
            logger.error(f"Error in drip cycle: {e}")
            import traceback
            traceback.print_exc()

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
