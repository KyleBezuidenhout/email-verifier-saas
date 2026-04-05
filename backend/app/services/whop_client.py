"""
Whop.com API client for payment processing.

Handles checkout creation, membership management, and webhook verification.
"""
import httpx
import json
import logging
from typing import Optional
from standardwebhooks import Webhook
import base64

from app.core.config import settings

logger = logging.getLogger(__name__)

WHOP_API_BASE = "https://api.whop.com/api/v1"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.WHOP_API_KEY}",
        "Content-Type": "application/json",
    }


def create_checkout_for_plan(
    whop_plan_id: str,
    user_id: str,
    plan_name: str,
    interval: str,
    old_membership_id: Optional[str] = None,
) -> dict:
    """Create a Whop checkout configuration for a subscription plan.
    
    Returns dict with 'purchase_url' key on success.
    Raises httpx.HTTPStatusError on failure.
    """
    metadata = {
        "bv_user_id": user_id,
        "bv_plan": plan_name,
        "bv_interval": interval,
    }
    if old_membership_id:
        metadata["old_membership_id"] = old_membership_id

    payload = {
        "plan_id": whop_plan_id,
        "metadata": metadata,
    }

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{WHOP_API_BASE}/checkout_configurations",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Created Whop checkout for plan {plan_name}/{interval}, user {user_id}")
        return data


def create_checkout_for_topup(
    user_id: str,
    amount_dollars: float,
    credits_to_add: int,
) -> dict:
    """Create a Whop checkout configuration for a one-time credit top-up.
    
    Returns dict with 'purchase_url' key on success.
    """
    payload = {
        "plan": {
            "company_id": settings.WHOP_COMPANY_ID,
            "plan_type": "one_time",
            "initial_price": amount_dollars,
            "currency": "usd",
        },
        "metadata": {
            "bv_user_id": user_id,
            "type": "topup",
            "amount_dollars": str(amount_dollars),
            "credits_to_add": str(credits_to_add),
        },
    }

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{WHOP_API_BASE}/checkout_configurations",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Created Whop topup checkout ${amount_dollars} = {credits_to_add} credits, user {user_id}")
        return data


def get_membership(membership_id: str) -> dict:
    """Retrieve a membership by ID. Returns the membership object."""
    with httpx.Client(timeout=15) as client:
        resp = client.get(
            f"{WHOP_API_BASE}/memberships/{membership_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


def cancel_membership(membership_id: str, immediately: bool = False) -> dict:
    """Cancel a membership. Default: cancel at period end."""
    payload = {}
    if immediately:
        payload["method"] = "immediately"

    with httpx.Client(timeout=15) as client:
        resp = client.post(
            f"{WHOP_API_BASE}/memberships/{membership_id}/cancel",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        logger.info(f"Cancelled membership {membership_id} (immediately={immediately})")
        return resp.json()


def get_payment(payment_id: str) -> dict:
    """Retrieve a payment by ID for verification fallback."""
    with httpx.Client(timeout=15) as client:
        resp = client.get(
            f"{WHOP_API_BASE}/payments/{payment_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


def verify_webhook(body: str, headers: dict) -> dict:
    """Verify and decode a Whop webhook using the Standard Webhooks spec.
    
    Returns the decoded payload dict.
    Raises Exception if verification fails.
    """
    secret = settings.WHOP_WEBHOOK_SECRET
    wh = Webhook(base64.b64encode(secret.encode()).decode('ascii'))
    payload = wh.verify(body, headers)
    if isinstance(payload, str):
        payload = json.loads(payload)
    return payload
