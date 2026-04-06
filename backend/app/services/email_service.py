import os
import smtplib
import logging
import html
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
APP_URL = os.getenv("FRONTEND_URL", os.getenv("APP_URL", "https://www.billionverifier.io"))
SUPPORT_RECIPIENT = os.getenv("SUPPORT_RECIPIENT", "ben@superwave.io")
SIGNUP_NOTIFICATION_RECIPIENT = os.getenv("SIGNUP_NOTIFICATION_RECIPIENT", SUPPORT_RECIPIENT or "ben@superwave.io")


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send password reset email")
        return False

    reset_link = f"{APP_URL}/reset-password?token={reset_token}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 480px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #0099FF; font-size: 22px; margin: 0 0 16px; }}
            p {{ color: #999; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }}
            .btn {{ display: inline-block; padding: 12px 32px; background-color: transparent; color: #0099FF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #0099FF; }}
            .link-text {{ color: #666; font-size: 12px; word-break: break-all; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #222; }}
            .footer p {{ color: #555; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Reset your password</h1>
            <p>We received a request to reset the password for your Billion Verifier account. Click the button below to set a new password.</p>
            <p style="text-align: center; margin: 24px 0;">
                <a href="{reset_link}" class="btn">Reset Password</a>
            </p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p class="link-text">{reset_link}</p>
            <div class="footer">
                <p>This link expires in 24 hours. If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset your Billion Verifier password"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())

        logger.info(f"Password reset email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {e}")
        return False


def send_verification_email(to_email: str, verification_token: str) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send verification email")
        return False

    verify_link = f"{APP_URL}/verify-email?token={verification_token}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 480px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #0099FF; font-size: 22px; margin: 0 0 16px; }}
            p {{ color: #999; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }}
            .btn {{ display: inline-block; padding: 12px 32px; background-color: transparent; color: #0099FF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #0099FF; }}
            .link-text {{ color: #666; font-size: 12px; word-break: break-all; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #222; }}
            .footer p {{ color: #555; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Confirm your email address</h1>
            <p>Thanks for signing up for Billion Verifier! Click the button below to verify your email and activate your account.</p>
            <p style="text-align: center; margin: 24px 0;">
                <a href="{verify_link}" class="btn">Verify Email</a>
            </p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p class="link-text">{verify_link}</p>
            <div class="footer">
                <p>This link expires in 48 hours. If you didn't create an account, you can safely ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Confirm your Billion Verifier email"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())

        logger.info(f"Verification email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email to {to_email}: {e}")
        return False


def send_support_email(
    user_email: str,
    user_name: str,
    category: str,
    subject: str,
    message: str,
) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send support email")
        return False

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 560px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #ffffff; font-size: 22px; margin: 0 0 24px; }}
            .meta {{ margin-bottom: 24px; }}
            .meta-row {{ display: flex; margin-bottom: 8px; }}
            .meta-label {{ color: #666; font-size: 13px; min-width: 90px; }}
            .meta-value {{ color: #ccc; font-size: 13px; }}
            .message-box {{ padding: 20px; background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; }}
            .message-box p {{ color: #ddd; font-size: 14px; line-height: 1.7; margin: 0; white-space: pre-wrap; }}
            .badge {{ display: inline-block; padding: 3px 10px; background-color: transparent; color: #0099FF; border-radius: 4px; font-size: 12px; font-weight: 600; border: 1px solid #0099FF; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>New Support Request</h1>
            <div class="meta">
                <div class="meta-row">
                    <span class="meta-label">From:</span>
                    <span class="meta-value">{user_name} &lt;{user_email}&gt;</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Category:</span>
                    <span class="meta-value"><span class="badge">{category}</span></span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Subject:</span>
                    <span class="meta-value">{subject}</span>
                </div>
            </div>
            <div class="message-box">
                <p>{message}</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[Support] {category}: {subject}"
        msg["From"] = f'"Billion Verifier Support" <{GMAIL_USER}>'
        msg["To"] = SUPPORT_RECIPIENT
        msg["Reply-To"] = user_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, SUPPORT_RECIPIENT, msg.as_string())

        logger.info(f"Support email sent from {user_email} — subject: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send support email from {user_email}: {e}")
        return False


def send_new_signup_notification(
    user_email: str,
    full_name: Optional[str] = None,
    company_name: Optional[str] = None,
    company_website: Optional[str] = None,
    referral_source: Optional[str] = None,
    daily_cold_emails: Optional[int] = None,
    oauth_provider: Optional[str] = None,
) -> bool:
    """Notify backend team whenever a brand-new user account is created."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send signup notification email")
        return False

    safe_email = html.escape(user_email or "")
    safe_full_name = html.escape(full_name or "Not provided")
    safe_company_name = html.escape(company_name or "Not provided")
    safe_company_website = html.escape(company_website or "Not provided")
    safe_referral_source = html.escape(referral_source or "Not provided")
    safe_daily_cold_emails = html.escape(str(daily_cold_emails) if daily_cold_emails is not None else "Not provided")
    signup_method = f"OAuth ({oauth_provider})" if oauth_provider else "Email + Password"
    safe_signup_method = html.escape(signup_method)
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 560px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #ffffff; font-size: 22px; margin: 0 0 24px; }}
            .meta-row {{ margin-bottom: 10px; font-size: 14px; color: #ccc; }}
            .meta-label {{ color: #666; margin-right: 8px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>New Billion Verifier Signup</h1>
            <div class="meta-row"><span class="meta-label">Email:</span>{safe_email}</div>
            <div class="meta-row"><span class="meta-label">Full name:</span>{safe_full_name}</div>
            <div class="meta-row"><span class="meta-label">Company:</span>{safe_company_name}</div>
            <div class="meta-row"><span class="meta-label">Website:</span>{safe_company_website}</div>
            <div class="meta-row"><span class="meta-label">Referral source:</span>{safe_referral_source}</div>
            <div class="meta-row"><span class="meta-label">Daily cold emails:</span>{safe_daily_cold_emails}</div>
            <div class="meta-row"><span class="meta-label">Signup method:</span>{safe_signup_method}</div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"New client signup: {user_email}"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = SIGNUP_NOTIFICATION_RECIPIENT
        msg["Reply-To"] = user_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, SIGNUP_NOTIFICATION_RECIPIENT, msg.as_string())

        logger.info(f"Signup notification email sent for {user_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send signup notification email for {user_email}: {e}")
        return False


def send_downgrade_notification_email(to_email: str, plan_name: str = "trial") -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send downgrade notification email")
        return False

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 480px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #0099FF; font-size: 22px; margin: 0 0 16px; }}
            p {{ color: #999; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }}
            .btn {{ display: inline-block; padding: 12px 32px; background-color: transparent; color: #0099FF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #0099FF; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #222; }}
            .footer p {{ color: #555; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Your subscription has been downgraded</h1>
            <p>After multiple failed payment attempts, your Billion Verifier subscription has been moved to the <strong style="color: #ccc;">{html.escape(plan_name)}</strong> plan.</p>
            <p>On this plan you will be charged <strong style="color: #ccc;">0.5 credits per email</strong> processed through verification and enrichment.</p>
            <p>If you'd like to re-subscribe to a plan with included credits, click below.</p>
            <p style="text-align: center; margin: 24px 0;">
                <a href="https://www.billionverifier.io/get-credits" class="btn">Get More Credits</a>
            </p>
            <div class="footer">
                <p>If you believe this is an error, please contact support.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Your Billion Verifier subscription has been downgraded"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())

        logger.info(f"Downgrade notification email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send downgrade notification email to {to_email}: {e}")
        return False


def send_unmatched_payment_alert(payment_id: str, amount: str, user_email_attempted: str) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send unmatched payment alert")
        return False

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 560px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #f59e0b; font-size: 22px; margin: 0 0 24px; }}
            .meta-row {{ margin-bottom: 10px; font-size: 14px; color: #ccc; }}
            .meta-label {{ color: #666; margin-right: 8px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Unmatched Payment — Manual Action Required</h1>
            <div class="meta-row"><span class="meta-label">Payment ID:</span>{html.escape(payment_id)}</div>
            <div class="meta-row"><span class="meta-label">Amount:</span>{html.escape(amount)}</div>
            <div class="meta-row"><span class="meta-label">Attempted email match:</span>{html.escape(user_email_attempted)}</div>
            <div class="meta-row"><span class="meta-label">Timestamp:</span>{timestamp}</div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[BillionVerifier] Unmatched payment - manual action required"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = SUPPORT_RECIPIENT
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, SUPPORT_RECIPIENT, msg.as_string())

        logger.info(f"Unmatched payment alert sent for payment {payment_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send unmatched payment alert for payment {payment_id}: {e}")
        return False


def send_dispute_alert(user_email: str, payment_id: str, amount: str, membership_id: str) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send dispute alert")
        return False

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 560px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #ef4444; font-size: 22px; margin: 0 0 24px; }}
            .meta-row {{ margin-bottom: 10px; font-size: 14px; color: #ccc; }}
            .meta-label {{ color: #666; margin-right: 8px; }}
            .warning-box {{ padding: 16px 20px; background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; margin-top: 20px; }}
            .warning-box p {{ margin: 0; color: #ef4444; font-size: 13px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Payment Dispute Received</h1>
            <div class="meta-row"><span class="meta-label">User email:</span>{html.escape(user_email)}</div>
            <div class="meta-row"><span class="meta-label">Payment ID:</span>{html.escape(payment_id)}</div>
            <div class="meta-row"><span class="meta-label">Amount:</span>{html.escape(amount)}</div>
            <div class="meta-row"><span class="meta-label">Membership ID:</span>{html.escape(membership_id)}</div>
            <div class="meta-row"><span class="meta-label">Timestamp:</span>{timestamp}</div>
            <div class="warning-box">
                <p>This user's account has been automatically frozen pending dispute resolution.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[BillionVerifier] Payment dispute received"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = SUPPORT_RECIPIENT
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, SUPPORT_RECIPIENT, msg.as_string())

        logger.info(f"Dispute alert sent for payment {payment_id} (user: {user_email})")
        return True
    except Exception as e:
        logger.error(f"Failed to send dispute alert for payment {payment_id}: {e}")
        return False


def send_webhook_verification_failure_alert(error_message: str, source_ip: str) -> bool:
    """Alert when a Whop webhook fails signature verification."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send webhook failure alert")
        return False

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 560px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #ef4444; font-size: 22px; margin: 0 0 24px; }}
            .meta-row {{ margin-bottom: 10px; font-size: 14px; color: #ccc; }}
            .meta-label {{ color: #666; margin-right: 8px; }}
            .warning-box {{ padding: 16px 20px; background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; margin-top: 20px; }}
            .warning-box p {{ margin: 0; color: #f59e0b; font-size: 13px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Webhook Verification Failed</h1>
            <div class="meta-row"><span class="meta-label">Error:</span>{html.escape(error_message)}</div>
            <div class="meta-row"><span class="meta-label">Source IP:</span>{html.escape(source_ip)}</div>
            <div class="meta-row"><span class="meta-label">Timestamp:</span>{timestamp}</div>
            <div class="warning-box">
                <p>A POST to /api/v1/payments/webhook failed signature verification. This could indicate a misconfigured WHOP_WEBHOOK_SECRET or a spoofed request.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[BillionVerifier] Webhook verification failed"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = SUPPORT_RECIPIENT
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, SUPPORT_RECIPIENT, msg.as_string())

        logger.info(f"Webhook verification failure alert sent (source: {source_ip})")
        return True
    except Exception as e:
        logger.error(f"Failed to send webhook verification failure alert: {e}")
        return False


def send_credit_usage_alert_email(to_email: str, plan_name: str, credits_used: int, credits_total: int) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured — cannot send credit usage alert email")
        return False

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 480px; margin: 40px auto; padding: 32px; background-color: #141414; border: 1px solid #222; border-radius: 12px; }}
            h1 {{ color: #f59e0b; font-size: 22px; margin: 0 0 16px; }}
            p {{ color: #999; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }}
            .btn {{ display: inline-block; padding: 12px 32px; background-color: transparent; color: #0099FF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #0099FF; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #222; }}
            .footer p {{ color: #555; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>You've used 90% of your plan credits</h1>
            <p>You've used <strong style="color: #ccc;">{credits_used:,}</strong> of <strong style="color: #ccc;">{credits_total:,}</strong> credits on your <strong style="color: #ccc;">{html.escape(plan_name)}</strong> plan.</p>
            <p>If you'd like to upgrade your plan or top up credits to avoid any interruption, click below.</p>
            <p style="text-align: center; margin: 24px 0;">
                <a href="https://www.billionverifier.io/get-credits" class="btn">Get More Credits</a>
            </p>
            <div class="footer">
                <p>You're receiving this email because your credit usage exceeded 90%.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "You've used 90% of your plan credits"
        msg["From"] = f'"Billion Verifier" <{GMAIL_USER}>'
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())

        logger.info(f"Credit usage alert email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send credit usage alert email to {to_email}: {e}")
        return False
