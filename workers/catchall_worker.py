#!/usr/bin/env python3
"""
Catchall Verification Worker

Dedicated worker that processes catchall verification jobs from a Redis queue,
completely separate from the verification/enrichment pipeline.

Architecture:
  - Polls `catchall-verification-queue` via Redis BRPOP
  - Enforces global concurrency cap (default 10 jobs)
  - Per-client concurrency uses the same max_concurrent_jobs setting but tracked separately
  - Registers active jobs in `catchall:active_jobs` Redis hash
  - Promotes waiting-room jobs when slots free up
  - Sends completion email on finish
"""

import asyncio
import os
import sys
import time
import smtplib
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings
from app.models.job import Job
from app.models.lead import Lead
from app.models.user import User
from email_utils import send_job_failure_email, send_admin_credit_exhaustion_email

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------
CATCHALL_QUEUE = os.environ.get("CATCHALL_QUEUE", "catchall-verification-queue")
CATCHALL_GLOBAL_CONCURRENCY = int(os.environ.get("CATCHALL_GLOBAL_CONCURRENCY", "10"))
POLL_TIMEOUT_S = 5
HEARTBEAT_TTL_S = 120
HEARTBEAT_REFRESH_S = 15
REQUEUE_DELAY_S = 2

GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
APP_URL = os.environ.get("APP_URL", "https://www.billionverifier.io")

# -------------------------------------------------------------------
# Database & Redis
# -------------------------------------------------------------------
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


# -------------------------------------------------------------------
# Concurrency helpers
# -------------------------------------------------------------------

def _active_job_count() -> int:
    """Total catchall jobs currently running globally."""
    return redis_client.hlen("catchall:active_jobs")


def _user_active_and_queued(user_id: str) -> int:
    """Count how many catchall jobs this user has active + queued."""
    active_jobs = redis_client.hgetall("catchall:active_jobs") or {}
    queue_items = redis_client.lrange(CATCHALL_QUEUE, 0, -1) or []

    user_active = sum(1 for uid in active_jobs.values() if uid == str(user_id))
    user_queued = 0
    db = SessionLocal()
    try:
        for jid in queue_items:
            j = db.query(Job).filter(Job.id == jid).first()
            if j and str(j.user_id) == str(user_id):
                user_queued += 1
    finally:
        db.close()
    return user_active + user_queued


def register_active(job_id: str, user_id: str):
    redis_client.hset("catchall:active_jobs", job_id, str(user_id))
    redis_client.set(f"catchall:heartbeat:{job_id}", "alive", ex=HEARTBEAT_TTL_S)


def unregister_active(job_id: str):
    redis_client.hdel("catchall:active_jobs", job_id)
    redis_client.delete(f"catchall:heartbeat:{job_id}")


def refresh_heartbeat(job_id: str):
    redis_client.set(f"catchall:heartbeat:{job_id}", "alive", ex=HEARTBEAT_TTL_S)


def is_cancelled(job_id: str) -> bool:
    return redis_client.get(f"job:cancelled:{job_id}") is not None


# -------------------------------------------------------------------
# Waiting-room promotion
# -------------------------------------------------------------------

def promote_waiting_jobs(finished_user_id: str | None = None):
    """
    After a job finishes, check if any waiting-room jobs can be promoted.
    Tries the user who just finished first, then scans all waiting keys.
    """
    if _active_job_count() >= CATCHALL_GLOBAL_CONCURRENCY:
        return

    user_ids_to_check = []
    if finished_user_id:
        user_ids_to_check.append(finished_user_id)

    for key in redis_client.scan_iter(match="catchall:waiting:*"):
        uid = key.split(":")[-1]
        if uid not in user_ids_to_check:
            user_ids_to_check.append(uid)

    db = SessionLocal()
    try:
        for uid in user_ids_to_check:
            if _active_job_count() >= CATCHALL_GLOBAL_CONCURRENCY:
                break

            waiting_key = f"catchall:waiting:{uid}"
            user = db.query(User).filter(User.id == uid).first()
            max_jobs = getattr(user, 'max_concurrent_jobs', 3) if user else 3

            while _active_job_count() < CATCHALL_GLOBAL_CONCURRENCY:
                current_load = _user_active_and_queued(uid)
                if current_load >= max_jobs:
                    break

                next_job_id = redis_client.lpop(waiting_key)
                if not next_job_id:
                    break

                db.query(Job).filter(Job.id == next_job_id).update({"status": "queued"})
                db.commit()
                redis_client.rpush(CATCHALL_QUEUE, next_job_id)
                logger.info("Promoted catchall job %s for user %s from waiting room", next_job_id, uid)
    finally:
        db.close()


# -------------------------------------------------------------------
# Job processing
# -------------------------------------------------------------------

async def process_job(job_id: str):
    """Run the OmniVerifier catchall verification for a single job."""
    from app.services.catchall_verification_service import verify_catchall_emails, JobCancelled

    db = SessionLocal()
    heartbeat_task = None
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.warning("Job %s not found in DB, skipping", job_id)
            return

        if job.status == "cancelled":
            logger.info("Job %s already cancelled, skipping", job_id)
            return

        user_id_str = str(job.user_id)
        register_active(job_id, user_id_str)

        job.status = "processing"
        db.commit()

        async def _heartbeat_loop():
            while True:
                await asyncio.sleep(HEARTBEAT_REFRESH_S)
                refresh_heartbeat(job_id)

        heartbeat_task = asyncio.create_task(_heartbeat_loop())

        leads = db.query(Lead).filter(Lead.job_id == job_id).all()
        emails = [lead.email for lead in leads if lead.email]

        if not emails:
            logger.warning("Job %s has no emails to verify", job_id)
            job.status = "completed"
            job.processed_leads = 0
            job.completed_at = datetime.utcnow()
            db.commit()
            return

        def _is_cancelled():
            return is_cancelled(job_id)

        def _on_chunk_complete(processed_count):
            try:
                j = db.query(Job).filter(Job.id == job_id).first()
                if j:
                    j.processed_leads = processed_count
                    db.commit()
            except Exception:
                db.rollback()

        try:
            result = await verify_catchall_emails(
                emails=emails,
                title_prefix=f"Job {job_id[:8]}",
                on_chunk_complete=_on_chunk_complete,
                is_cancelled=_is_cancelled,
            )
        except JobCancelled:
            logger.info("Catchall job %s cancelled by user", job_id)
            job = db.query(Job).filter(Job.id == job_id).first()
            if job and job.status != "cancelled":
                job.status = "cancelled"
                db.commit()
            return

        email_results = result.get("email_results", {})
        leads = db.query(Lead).filter(Lead.job_id == job_id).all()

        valid_count = 0
        risky_count = 0
        for lead in leads:
            lead.is_final_result = True
            r = email_results.get(lead.email.lower())
            if r:
                res_code = r.get("result")
                if res_code == 1:
                    lead.verification_status = "valid"
                    lead.verification_tag = "catchall-deliverable"
                    valid_count += 1
                elif res_code == 2:
                    lead.verification_status = "risky"
                    lead.verification_tag = "catchall-risky"
                    risky_count += 1
                else:
                    lead.verification_status = "invalid"
            else:
                lead.verification_status = "unverified"

        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        job.valid_emails_found = valid_count
        job.catchall_emails_found = risky_count
        job.processed_leads = job.total_leads
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        db.commit()

        _send_completion_email(db, job)

        errors = result.get("errors", [])
        if errors:
            logger.warning("Catchall job %s completed with errors: %s", job_id, errors)
        else:
            logger.info("Catchall job %s completed: %d valid, %d risky", job_id, valid_count, risky_count)

    except Exception as e:
        logger.exception("Catchall job %s failed: %s", job_id, e)
        error_str = str(e).lower()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "failed"
                db.commit()

                # Send failure email to the client
                user = db.query(User).filter(User.id == job.user_id).first()
                if user:
                    send_job_failure_email(
                        user_email=user.email,
                        job_type="Catchall Verification",
                        job_name=f"Job {job_id[:8]}",
                        failure_reason=str(e),
                        job_id=job_id,
                    )

                # Alert admin if it looks like OmniVerifier ran out of credits
                if any(kw in error_str for kw in ("credit", "balance", "insufficient", "quota", "payment", "limit")):
                    send_admin_credit_exhaustion_email(
                        service="OmniVerifier (Catchall Verification)",
                        detail=f"Catchall job {job_id[:8]} failed with a possible credit/balance error: {e}"
                    )
        except Exception:
            db.rollback()
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
        unregister_active(job_id)
        user_id = None
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                user_id = str(job.user_id)
        except Exception:
            pass
        db.close()

        promote_waiting_jobs(finished_user_id=user_id)


# -------------------------------------------------------------------
# Completion email
# -------------------------------------------------------------------

def _send_completion_email(db, job):
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.info("Gmail credentials not configured — skipping catchall completion email")
        return

    try:
        user = db.query(User).filter(User.id == job.user_id).first()
        if not user:
            return

        valid = job.valid_emails_found or 0
        risky = job.catchall_emails_found or 0
        total = job.total_leads or 0
        job_id_short = str(job.id)[:8]

        subject = f"Catchall verification complete: {valid} deliverable emails found"
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0077cc 0%, #0099ff 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 22px;">Catchall Verification Complete!</h2>
          </div>
          <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #475569; font-size: 16px; margin-top: 0;">Your catchall verification job has finished processing.</p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <h3 style="margin: 0 0 12px 0; color: #1e293b; font-size: 16px;">Results Summary</h3>
              <ul style="list-style: none; padding: 0; margin: 0; color: #475569;">
                <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">Deliverable: <strong>{valid}</strong></li>
                <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">Risky: <strong>{risky}</strong></li>
                <li style="padding: 8px 0;">Total processed: <strong>{total}</strong></li>
              </ul>
            </div>
            <a href="{APP_URL}/results/{job.id}"
               style="display: inline-block; background: linear-gradient(135deg, #0077cc 0%, #0099ff 100%);
                      color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px;
                      font-weight: 600; font-size: 15px;">
              View &amp; Download Results
            </a>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; margin-bottom: 0;">
              Job ID: {job_id_short}...
            </p>
          </div>
        </div>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Billion Verifier <{GMAIL_USER}>"
        msg["To"] = user.email
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, user.email, msg.as_string())

        logger.info("Sent catchall completion email to %s", user.email)
    except Exception as e:
        logger.error("Failed to send catchall completion email: %s", e)


# -------------------------------------------------------------------
# Zombie cleanup
# -------------------------------------------------------------------

def cleanup_zombie_jobs():
    """Remove stale entries from catchall:active_jobs whose heartbeat expired."""
    active = redis_client.hgetall("catchall:active_jobs") or {}
    for jid, uid in active.items():
        if not redis_client.exists(f"catchall:heartbeat:{jid}"):
            logger.warning("Zombie catchall job detected: %s (user %s) — cleaning up", jid, uid)
            redis_client.hdel("catchall:active_jobs", jid)
            db = SessionLocal()
            try:
                job = db.query(Job).filter(Job.id == jid).first()
                if job and job.status == "processing":
                    job.status = "failed"
                    db.commit()
                    logger.info("Marked zombie job %s as failed", jid)

                    user = db.query(User).filter(User.id == job.user_id).first()
                    if user:
                        send_job_failure_email(
                            user_email=user.email,
                            job_type="Catchall Verification",
                            job_name=f"Job {jid[:8]}",
                            failure_reason="The verification job was interrupted and could not be recovered. Please retry.",
                            job_id=jid,
                        )
            finally:
                db.close()


# -------------------------------------------------------------------
# Main polling loop
# -------------------------------------------------------------------

async def main_loop():
    logger.info("Catchall worker starting")
    logger.info("  Queue: %s", CATCHALL_QUEUE)
    logger.info("  Global concurrency cap: %d", CATCHALL_GLOBAL_CONCURRENCY)

    last_zombie_check = 0
    ZOMBIE_CHECK_INTERVAL_S = 60

    while True:
        now = time.time()
        if now - last_zombie_check > ZOMBIE_CHECK_INTERVAL_S:
            cleanup_zombie_jobs()
            last_zombie_check = now

        try:
            result = redis_client.brpop(CATCHALL_QUEUE, timeout=POLL_TIMEOUT_S)
        except redis.ConnectionError:
            logger.error("Redis connection lost, retrying in 5s")
            await asyncio.sleep(5)
            continue
        except Exception as e:
            logger.error("Error polling queue: %s", e)
            await asyncio.sleep(1)
            continue

        if not result:
            continue

        _, job_id = result

        if is_cancelled(job_id):
            logger.info("Job %s is already cancelled, skipping", job_id)
            continue

        if _active_job_count() >= CATCHALL_GLOBAL_CONCURRENCY:
            logger.info("Global cap reached (%d/%d), re-queuing job %s",
                        _active_job_count(), CATCHALL_GLOBAL_CONCURRENCY, job_id)
            redis_client.lpush(CATCHALL_QUEUE, job_id)
            await asyncio.sleep(REQUEUE_DELAY_S)
            continue

        logger.info("Processing catchall job %s (active: %d/%d)",
                     job_id, _active_job_count() + 1, CATCHALL_GLOBAL_CONCURRENCY)

        await process_job(job_id)


if __name__ == "__main__":
    asyncio.run(main_loop())
