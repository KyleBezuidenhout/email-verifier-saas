"""
Whop Payment Endpoints — subscriptions, one-time top-ups, webhooks, billing portal.
"""
import json
import redis as redis_lib
import logging
from decimal import Decimal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.config import settings
from app.core.plans import (
    TOPUP_CREDIT_RATE, WHOP_PLAN_MAP, REVERSE_PLAN_MAP, PLAN_CREDITS,
    get_plan_credits, resolve_whop_plan,
)
from app.db.session import get_db
from app.models.user import User
from app.models.payment_log import PaymentLog
from app.api.v1.endpoints.auth import get_current_user
from app.services.whop_client import (
    create_checkout_for_plan, create_checkout_for_topup,
    cancel_membership, get_payment, verify_webhook,
)
from app.services.email_service import (
    send_downgrade_notification_email,
    send_unmatched_payment_alert,
    send_dispute_alert,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_redis = redis_lib.from_url(settings.REDIS_URL, socket_timeout=5, socket_connect_timeout=5)


def _is_event_processed(event_type: str, resource_id: str) -> bool:
    """Atomically check-and-mark a webhook event as processed. Returns True if already seen."""
    key = f"whop:processed:{event_type}:{resource_id}"
    was_set = _redis.set(key, "1", nx=True, ex=86400 * 7)
    return not was_set


def _resolve_user(db: Session, metadata: dict, webhook_data: dict) -> User | None:
    """Resolve user from metadata bv_user_id, then fallback to webhook user email."""
    user_id = metadata.get("bv_user_id")
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user

    email = webhook_data.get("user", {}).get("email")
    if email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            return user

    return None


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class CreateSubscriptionCheckoutRequest(BaseModel):
    plan_name: str
    interval: str = "monthly"


class CreateTopupRequest(BaseModel):
    amount_dollars: int


class CheckoutResponse(BaseModel):
    checkout_url: str


class PaymentHistoryItem(BaseModel):
    id: str
    event_type: str
    amount_dollars: float
    credits_delta: float
    old_balance: float
    new_balance: float
    plan_name: str | None
    created_at: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Subscription Checkout
# ---------------------------------------------------------------------------

@router.post("/create-checkout", response_model=CheckoutResponse)
def create_subscription_checkout(
    payload: CreateSubscriptionCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Whop checkout for a subscription plan."""
    key = (payload.plan_name, payload.interval)
    whop_plan_id = REVERSE_PLAN_MAP.get(key)
    if not whop_plan_id:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {payload.plan_name}/{payload.interval}")

    old_membership_id = getattr(current_user, "whop_membership_id", None)

    try:
        data = create_checkout_for_plan(
            whop_plan_id=whop_plan_id,
            user_id=str(current_user.id),
            plan_name=payload.plan_name,
            interval=payload.interval,
            old_membership_id=old_membership_id,
        )
        url = data.get("purchase_url") or data.get("checkout_url") or data.get("url", "")
        if not url:
            logger.error(f"Whop checkout response missing URL: {data}")
            raise HTTPException(status_code=500, detail="Failed to create checkout")
        return CheckoutResponse(checkout_url=url)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Whop checkout error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


# ---------------------------------------------------------------------------
# One-Time Top-Up Checkout
# ---------------------------------------------------------------------------

@router.post("/create-topup", response_model=CheckoutResponse)
def create_topup_checkout(
    payload: CreateTopupRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a Whop checkout for a one-time credit top-up. Fixed rate: $0.005/credit."""
    if payload.amount_dollars < 10 or payload.amount_dollars > 500:
        raise HTTPException(status_code=400, detail="Amount must be between $10 and $500")

    credits_to_add = int(payload.amount_dollars / float(TOPUP_CREDIT_RATE))

    try:
        data = create_checkout_for_topup(
            user_id=str(current_user.id),
            amount_dollars=float(payload.amount_dollars),
            credits_to_add=credits_to_add,
        )
        url = data.get("purchase_url") or data.get("checkout_url") or data.get("url", "")
        if not url:
            logger.error(f"Whop topup checkout response missing URL: {data}")
            raise HTTPException(status_code=500, detail="Failed to create checkout")
        return CheckoutResponse(checkout_url=url)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Whop topup error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


# ---------------------------------------------------------------------------
# Webhook Handler
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def whop_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle all Whop webhook events."""
    raw_body = await request.body()
    body_str = raw_body.decode("utf-8")

    try:
        headers_dict = dict(request.headers)
        payload = verify_webhook(body_str, headers_dict)
    except Exception as e:
        logger.error(f"Webhook verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = payload.get("event") or payload.get("type", "")
    data = payload.get("data", {})
    metadata = data.get("metadata", {})
    resource_id = data.get("id", "")

    logger.info(f"Whop webhook received: {event_type} resource={resource_id}")

    if _is_event_processed(event_type, resource_id):
        logger.info(f"Event {event_type}:{resource_id} already processed, skipping")
        return {"status": "already_processed"}

    try:
        if event_type == "payment.succeeded":
            _handle_payment_succeeded(db, data, metadata)
        elif event_type == "payment.failed":
            _handle_payment_failed(db, data, metadata)
        elif event_type == "membership.activated":
            _handle_membership_activated(db, data, metadata)
        elif event_type == "membership.deactivated":
            _handle_membership_deactivated(db, data, metadata)
        elif event_type == "membership.cancel_at_period_end_changed":
            _handle_cancel_at_period_end(db, data, metadata)
        elif event_type == "refund.created":
            _handle_refund(db, data, metadata)
        elif event_type == "dispute.created":
            _handle_dispute(db, data, metadata)
        else:
            logger.info(f"Unhandled webhook event type: {event_type}")
    except Exception as e:
        logger.exception(f"Error processing webhook {event_type}: {e}")
        raise HTTPException(status_code=500, detail="Webhook processing error")

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Webhook Handlers
# ---------------------------------------------------------------------------

def _handle_payment_succeeded(db: Session, data: dict, metadata: dict):
    user = _resolve_user(db, metadata, data)
    if not user:
        payment_id = data.get("id", "unknown")
        amount = data.get("amount", 0)
        email_attempted = data.get("user", {}).get("email", "none")
        logger.error(f"Unmatched payment {payment_id}, amount={amount}")
        send_unmatched_payment_alert(payment_id, amount, email_attempted)
        return

    payment_type = metadata.get("type", "subscription")
    payment_id = data.get("id", "")
    amount_cents = data.get("amount", 0)
    amount_dollars = Decimal(str(amount_cents)) / 100 if amount_cents > 100 else Decimal(str(amount_cents))

    old_balance = Decimal(str(user.credits))

    if payment_type == "topup":
        credits_to_add = int(metadata.get("credits_to_add", 0))
        user.credits = float(old_balance + credits_to_add)
        db.flush()

        _create_payment_log(
            db, user_id=user.id, payment_id=payment_id,
            event_type="topup", amount=amount_dollars,
            credits_delta=Decimal(str(credits_to_add)),
            old_balance=old_balance, new_balance=Decimal(str(user.credits)),
            plan_name=user.plan, membership_id=None, metadata_json=metadata,
        )
        db.commit()
        logger.info(f"Topup: {user.email} +{credits_to_add} credits (${amount_dollars})")
    else:
        plan_id = metadata.get("bv_plan") or data.get("plan_id")
        interval = metadata.get("bv_interval", "monthly")
        plan_name = metadata.get("bv_plan")

        if not plan_name and plan_id:
            resolved = resolve_whop_plan(plan_id)
            if resolved:
                plan_name, interval = resolved

        if not plan_name:
            plan_name = user.plan or "basic"

        credits_to_add = get_plan_credits(plan_name, interval)
        user.credits = float(old_balance + credits_to_add)
        user.plan = plan_name
        user.billing_interval = interval
        user.subscription_status = "active"

        if interval == "yearly":
            user.yearly_credits_start = datetime.now(timezone.utc)
            user.yearly_credits_granted = 1
        else:
            user.yearly_credits_start = None
            user.yearly_credits_granted = 0

        membership_id = data.get("membership_id") or data.get("membership", {}).get("id")
        if membership_id:
            user.whop_membership_id = membership_id

        manage_url = data.get("manage_url") or data.get("membership", {}).get("manage_url")
        if manage_url:
            user.manage_url = manage_url

        whop_user_id = data.get("user", {}).get("id")
        if whop_user_id:
            user.whop_user_id = whop_user_id

        db.flush()

        _create_payment_log(
            db, user_id=user.id, payment_id=payment_id,
            event_type="subscription_payment", amount=amount_dollars,
            credits_delta=Decimal(str(credits_to_add)),
            old_balance=old_balance, new_balance=Decimal(str(user.credits)),
            plan_name=plan_name, membership_id=membership_id, metadata_json=metadata,
        )
        db.commit()

        old_membership_id = metadata.get("old_membership_id")
        if old_membership_id and old_membership_id != membership_id:
            try:
                cancel_membership(old_membership_id, immediately=True)
                logger.info(f"Cancelled old membership {old_membership_id} for upgrade")
            except Exception as e:
                logger.warning(f"Failed to cancel old membership {old_membership_id}: {e}")

        logger.info(f"Subscription payment: {user.email} plan={plan_name}/{interval} +{credits_to_add} credits (drip 1/{'12' if interval == 'yearly' else '1'})")


def _handle_payment_failed(db: Session, data: dict, metadata: dict):
    user = _resolve_user(db, metadata, data)
    if not user:
        return
    user.subscription_status = "past_due"
    db.commit()
    logger.warning(f"Payment failed for {user.email}, status set to past_due")


def _handle_membership_activated(db: Session, data: dict, metadata: dict):
    user = _resolve_user(db, metadata, data)
    if not user:
        return

    membership_id = data.get("id", "")
    plan_id = data.get("plan_id")
    manage_url = data.get("manage_url")

    if plan_id:
        resolved = resolve_whop_plan(plan_id)
        if resolved:
            plan_name, interval = resolved
            user.plan = plan_name
            user.billing_interval = interval

    user.whop_membership_id = membership_id
    user.subscription_status = "active"
    if manage_url:
        user.manage_url = manage_url

    db.commit()
    logger.info(f"Membership activated: {user.email} membership={membership_id}")


def _handle_membership_deactivated(db: Session, data: dict, metadata: dict):
    """Downgrade to trial after Whop exhausts retries or user cancels.
    
    Guard: only downgrade if the deactivated membership matches the user's
    current whop_membership_id to prevent race conditions during upgrades.
    """
    user = _resolve_user(db, metadata, data)
    if not user:
        return

    deactivated_id = data.get("id", "")
    if user.whop_membership_id and user.whop_membership_id != deactivated_id:
        logger.info(
            f"Ignoring deactivation of old membership {deactivated_id} "
            f"(user has newer membership {user.whop_membership_id})"
        )
        return

    user.plan = "trial"
    user.subscription_status = "cancelled"
    user.whop_membership_id = None
    user.manage_url = None
    user.billing_interval = "monthly"
    user.yearly_credits_start = None
    user.yearly_credits_granted = 0
    db.commit()

    send_downgrade_notification_email(user.email)
    logger.info(f"Membership deactivated: {user.email} downgraded to trial")


def _handle_cancel_at_period_end(db: Session, data: dict, metadata: dict):
    user = _resolve_user(db, metadata, data)
    if not user:
        return

    cancel_at_period_end = data.get("cancel_at_period_end", False)
    user.subscription_status = "cancelling" if cancel_at_period_end else "active"
    db.commit()
    logger.info(f"Cancel at period end changed: {user.email} cancelling={cancel_at_period_end}")


def _handle_refund(db: Session, data: dict, metadata: dict):
    user = _resolve_user(db, metadata, data)
    if not user:
        return

    payment_id = data.get("id", "")
    amount_cents = data.get("amount", 0)
    amount_dollars = Decimal(str(amount_cents)) / 100 if amount_cents > 100 else Decimal(str(amount_cents))
    credits_to_remove = int(float(amount_dollars) / float(TOPUP_CREDIT_RATE))

    old_balance = Decimal(str(user.credits))
    new_balance = max(Decimal("0"), old_balance - credits_to_remove)
    user.credits = float(new_balance)
    db.flush()

    _create_payment_log(
        db, user_id=user.id, payment_id=payment_id,
        event_type="refund", amount=amount_dollars,
        credits_delta=Decimal(str(-credits_to_remove)),
        old_balance=old_balance, new_balance=new_balance,
        plan_name=user.plan, membership_id=user.whop_membership_id,
        metadata_json=data,
    )
    db.commit()
    logger.info(f"Refund processed: {user.email} -{credits_to_remove} credits (${amount_dollars})")


def _handle_dispute(db: Session, data: dict, metadata: dict):
    user = _resolve_user(db, metadata, data)
    if not user:
        return

    payment_id = data.get("id", "")
    amount_cents = data.get("amount", 0)
    amount_dollars = Decimal(str(amount_cents)) / 100 if amount_cents > 100 else Decimal(str(amount_cents))

    old_balance = Decimal(str(user.credits))
    user.subscription_status = "disputed"
    user.is_active = False
    db.flush()

    _create_payment_log(
        db, user_id=user.id, payment_id=payment_id,
        event_type="dispute", amount=amount_dollars,
        credits_delta=Decimal("0"),
        old_balance=old_balance, new_balance=old_balance,
        plan_name=user.plan, membership_id=user.whop_membership_id,
        metadata_json=data,
    )
    db.commit()

    send_dispute_alert(user.email, payment_id, float(amount_dollars), user.whop_membership_id)
    logger.info(f"Dispute: {user.email} account frozen, payment_id={payment_id}")


# ---------------------------------------------------------------------------
# Payment Log Helper
# ---------------------------------------------------------------------------

def _create_payment_log(
    db: Session, *, user_id, payment_id: str, event_type: str,
    amount: Decimal, credits_delta: Decimal, old_balance: Decimal,
    new_balance: Decimal, plan_name: str | None, membership_id: str | None,
    metadata_json: dict | None,
):
    log = PaymentLog(
        user_id=user_id,
        whop_payment_id=payment_id,
        event_type=event_type,
        amount_dollars=amount,
        credits_delta=credits_delta,
        old_balance=old_balance,
        new_balance=new_balance,
        plan_name=plan_name,
        whop_membership_id=membership_id,
        metadata_json=metadata_json,
    )
    db.add(log)


# ---------------------------------------------------------------------------
# Billing Portal
# ---------------------------------------------------------------------------

@router.get("/billing-portal")
def get_billing_portal(current_user: User = Depends(get_current_user)):
    """Return the Whop billing portal URL for managing subscription."""
    url = getattr(current_user, "manage_url", None)
    if not url:
        raise HTTPException(status_code=404, detail="No active subscription found")
    return {"url": url}


# ---------------------------------------------------------------------------
# Payment History
# ---------------------------------------------------------------------------

@router.get("/history")
def get_payment_history(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return paginated payment history for the current user."""
    total = db.query(PaymentLog).filter(PaymentLog.user_id == current_user.id).count()
    logs = (
        db.query(PaymentLog)
        .filter(PaymentLog.user_id == current_user.id)
        .order_by(PaymentLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": str(log.id),
                "event_type": log.event_type,
                "amount_dollars": float(log.amount_dollars),
                "credits_delta": float(log.credits_delta),
                "old_balance": float(log.old_balance),
                "new_balance": float(log.new_balance),
                "plan_name": log.plan_name,
                "created_at": log.created_at.isoformat() if log.created_at else "",
            }
            for log in logs
        ],
        "total": total,
    }


# ---------------------------------------------------------------------------
# Verify Session (Fallback)
# ---------------------------------------------------------------------------

@router.get("/verify-session/{payment_id}")
def verify_payment_session(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify a Whop payment as a fallback if webhook hasn't processed yet."""
    try:
        payment = get_payment(payment_id)
        payment_status = payment.get("status", "unknown")
        amount_cents = payment.get("amount", 0)
        amount_dollars = amount_cents / 100 if amount_cents > 100 else amount_cents
        metadata = payment.get("metadata", {})
        credits_purchased = int(metadata.get("credits_to_add", 0))

        if payment_status in ("paid", "succeeded") and not _is_event_processed("verify_session", payment_id):
            if credits_purchased > 0:
                old_credits = current_user.credits
                current_user.credits += credits_purchased
                db.commit()
                logger.info(f"Credits added via verify-session fallback: {current_user.email} +{credits_purchased}")

        db.refresh(current_user)
        return {
            "payment_status": payment_status,
            "amount_dollars": amount_dollars,
            "credits_purchased": credits_purchased,
            "current_credits": current_user.credits,
        }
    except Exception as e:
        logger.error(f"Error verifying payment session: {e}")
        raise HTTPException(status_code=400, detail="Invalid payment session")
