import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
APP_URL = os.getenv("FRONTEND_URL", os.getenv("APP_URL", "https://www.billionverifier.io"))


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
            h1 {{ color: #ffffff; font-size: 22px; margin: 0 0 16px; }}
            p {{ color: #999; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }}
            .btn {{ display: inline-block; padding: 12px 32px; background-color: #0099FF; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }}
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
