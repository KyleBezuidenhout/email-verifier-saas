"""
Shared email notification utilities for all Python workers.

Uses Gmail SMTP (same credentials as existing workers).
All functions are fire-and-forget — they log errors but never raise.
"""

import os
import smtplib
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
APP_URL = os.environ.get("APP_URL", "https://www.billionverifier.io")
ADMIN_EMAIL = "ben@superwave.io"


def _send_html_email(to: str, subject: str, html: str) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.info("Gmail credentials not configured — skipping email to %s", to)
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Billion Verifier <{GMAIL_USER}>"
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to, msg.as_string())
        logger.info("Sent email to %s: %s", to, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)
        return False


# ---------------------------------------------------------------------------
# Client-facing: job failure notification
# ---------------------------------------------------------------------------

def send_job_failure_email(
    user_email: str,
    job_type: str,
    job_name: str,
    failure_reason: str,
    job_id: str = "",
) -> bool:
    """Notify a client that their job failed, with the failure reason."""
    job_id_short = job_id[:8] if job_id else ""
    subject = f"Your {job_type} job failed"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 22px;">Job Failed</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #475569; font-size: 16px; margin-top: 0;">
          Unfortunately, your <strong>{job_type}</strong> job "<strong>{job_name}</strong>" could not be completed.
        </p>

        <div style="background: #fef2f2; padding: 16px 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fecaca;">
          <p style="margin: 0; color: #991b1b; font-size: 14px;"><strong>Reason:</strong> {failure_reason}</p>
        </div>

        <p style="color: #475569; font-size: 14px;">
          You can retry the job from your dashboard. If the problem persists, please contact support.
        </p>

        <a href="{APP_URL}"
           style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px;
                  font-weight: 600; font-size: 15px;">
          Go to Dashboard
        </a>

        {"<p style='color: #94a3b8; font-size: 13px; margin-top: 24px; margin-bottom: 0;'>Job ID: " + job_id_short + "...</p>" if job_id_short else ""}
      </div>
    </div>
    """

    return _send_html_email(user_email, subject, html)


# ---------------------------------------------------------------------------
# Admin-facing: daily limit / credit exhaustion alerts
# ---------------------------------------------------------------------------

def send_admin_daily_limit_email(service: str, detail: str) -> bool:
    """Notify admin that a service has exhausted its daily limit."""
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    subject = f"[BillionVerifier] Daily limit reached: {service}"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 22px;">Daily Limit Reached</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #475569; font-size: 16px; margin-top: 0;">
          <strong>{service}</strong> has exhausted its daily capacity.
        </p>

        <div style="background: #fffbeb; padding: 16px 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fde68a;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">{detail}</p>
        </div>

        <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; margin-bottom: 0;">
          Timestamp: {timestamp}
        </p>
      </div>
    </div>
    """

    return _send_html_email(ADMIN_EMAIL, subject, html)


def send_daily_limit_reached_email(
    user_email: str,
    job_name: str,
    estimated_leads: int,
    reset_url: str,
) -> bool:
    """Notify a client that their queued job was cancelled due to daily limit, with a reset link."""
    subject = "BillionVerifier - Daily Scraping Limit Reached"

    leads_str = f"{estimated_leads:,}" if estimated_leads else "unknown"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 22px;">Daily Scraping Limit Reached</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #475569; font-size: 16px; margin-top: 0;">
          Your recent <strong>{job_name}</strong> Sales Navigator scraping of
          <strong>{leads_str}</strong> profiles was cancelled to protect your LinkedIn
          account from bans or suspension, as you've reached your daily limit of
          15,000 profiles scraped.
        </p>

        <p style="color: #475569; font-size: 15px;">
          Please try again tomorrow once your daily limit resets, or, if you have a
          second Sales Nav account that you'd like to use, feel free to reset your
          daily limit:
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="{reset_url}"
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px;
                    font-weight: 600; font-size: 15px;">
            Reset Daily Scraping Limit
          </a>
        </div>

        <div style="background: #fffbeb; padding: 16px 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fde68a;">
          <p style="margin: 0; color: #92400e; font-size: 13px;">
            <strong>Warning:</strong> Scraping more than 15,000 profiles per day using a single
            Sales Navigator account puts your LinkedIn account at risk of suspension or permanent ban.
          </p>
        </div>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; margin-bottom: 0;">
          This reset link expires in 24 hours.
        </p>
      </div>
    </div>
    """

    return _send_html_email(user_email, subject, html)


def send_admin_credit_exhaustion_email(service: str, detail: str) -> bool:
    """Notify admin that a third-party service has run out of credits."""
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    subject = f"[BillionVerifier] Credits exhausted: {service}"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 22px;">Credits Exhausted</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #475569; font-size: 16px; margin-top: 0;">
          <strong>{service}</strong> has run out of credits on the provider account.
        </p>

        <div style="background: #fef2f2; padding: 16px 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fecaca;">
          <p style="margin: 0; color: #991b1b; font-size: 14px;">{detail}</p>
        </div>

        <p style="color: #475569; font-size: 14px;">
          Please top up the provider account to resume processing.
        </p>

        <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; margin-bottom: 0;">
          Timestamp: {timestamp}
        </p>
      </div>
    </div>
    """

    return _send_html_email(ADMIN_EMAIL, subject, html)
