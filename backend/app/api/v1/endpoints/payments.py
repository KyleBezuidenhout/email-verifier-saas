"""
Stripe Payment Endpoints for Credit Top-Up
"""
import stripe
import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging

from app.core.config import settings
from app.core.plans import get_credit_price
from app.db.session import get_db
from app.models.user import User
from app.api.v1.endpoints.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

# Redis client for cross-worker session dedup (replaces in-memory set)
_redis_dedup = redis_lib.from_url(settings.REDIS_URL, socket_timeout=5, socket_connect_timeout=5)


def _is_session_processed(session_id: str) -> bool:
    """Atomically check-and-mark a Stripe session as processed. Returns True if already processed."""
    was_set = _redis_dedup.set(f"stripe:processed:{session_id}", "1", nx=True, ex=86400)
    return not was_set

# Legacy fallback — overridden per-user by plan-based pricing
CREDIT_PRICE_FALLBACK = 0.004


class CreateCheckoutRequest(BaseModel):
    amount_dollars: int  # Amount in dollars ($10-$500)


class CreateCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


@router.post("/create-checkout", response_model=CreateCheckoutResponse)
def create_checkout_session(
    payload: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Stripe Checkout Session for credit top-up. Credits calculated using the user's plan rate."""
    if payload.amount_dollars < 10 or payload.amount_dollars > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be between $10 and $500"
        )

    user_plan = getattr(current_user, 'plan', 'trial') or 'trial'
    try:
        plan_credit_price = float(get_credit_price(
            user_plan,
            custom_price=getattr(current_user, 'custom_credit_price', None),
        ))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your custom plan credit price has not been configured yet. Please contact support.",
        )

    credits_to_add = round(payload.amount_dollars / plan_credit_price)
    
    try:
        # Create Stripe Checkout Session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"{credits_to_add:,} Credits",
                            "description": f"Credit top-up for email verification and scraping",
                        },
                        "unit_amount": payload.amount_dollars * 100,  # Stripe uses cents
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{settings.FRONTEND_URL}/get-credits/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/get-credits/cancel",
            customer_email=current_user.email,
            # Send receipt to customer automatically
            payment_intent_data={
                "receipt_email": current_user.email,
                "description": f"BillionVerifier - {credits_to_add:,} Credits Top-Up",
            },
            metadata={
                "user_id": str(current_user.id),
                "credits_to_add": str(credits_to_add),
                "amount_dollars": str(payload.amount_dollars),
                "credit_price_used": str(plan_credit_price),
                "plan_at_purchase": user_plan,
                "credits_added": "false",
            },
        )
        
        logger.info(f"Created checkout session {checkout_session.id} for user {current_user.email} - ${payload.amount_dollars} = {credits_to_add} credits")
        
        return CreateCheckoutResponse(
            checkout_url=checkout_session.url,
            session_id=checkout_session.id,
        )
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating checkout: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment service error: {str(e)}"
        )


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Stripe webhook events.
    
    This endpoint receives events from Stripe when payments are completed.
    On successful payment, credits are added to the user's account.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    # If webhook secret is configured, verify the signature
    if settings.STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError as e:
            logger.error(f"Invalid webhook payload: {e}")
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid webhook signature: {e}")
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        # No webhook secret configured - parse event directly (less secure, OK for development)
        import json
        try:
            event = stripe.Event.construct_from(
                json.loads(payload), stripe.api_key
            )
        except Exception as e:
            logger.error(f"Error parsing webhook: {e}")
            raise HTTPException(status_code=400, detail="Invalid payload")
    
    # Handle the checkout.session.completed event
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        session_id = session.get("id")
        
        if _is_session_processed(session_id):
            logger.info(f"Session {session_id} already processed, skipping webhook")
            return {"status": "already_processed", "session_id": session_id}
        
        # Extract metadata
        user_id = session.get("metadata", {}).get("user_id")
        credits_to_add = session.get("metadata", {}).get("credits_to_add")
        amount_dollars = session.get("metadata", {}).get("amount_dollars")
        
        if not user_id or not credits_to_add:
            logger.error(f"Missing metadata in checkout session: {session_id}")
            return {"status": "error", "message": "Missing metadata"}
        
        credits_to_add = round(float(credits_to_add))
        
        # Find user and add credits
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"User not found for checkout session: {user_id}")
            return {"status": "error", "message": "User not found"}
        
        # Add credits
        old_credits = user.credits
        user.credits += credits_to_add
        db.commit()
        
        logger.info(
            f"✅ Payment successful (webhook)! User {user.email} - "
            f"${amount_dollars} -> {credits_to_add} credits added. "
            f"Balance: {old_credits} -> {user.credits}"
        )
        
        return {
            "status": "success",
            "user_id": user_id,
            "credits_added": credits_to_add,
            "new_balance": user.credits,
        }
    
    # Return success for other event types (we just don't handle them)
    return {"status": "received", "type": event["type"]}


@router.get("/verify-session/{session_id}")
def verify_checkout_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify a checkout session and return payment status.
    Also acts as a fallback to add credits if the webhook hasn't processed yet.
    """
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.metadata.get("user_id") != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Session does not belong to this user"
            )
        
        credits_to_add = round(float(session.metadata.get("credits_to_add", 0)))
        amount_dollars = round(float(session.metadata.get("amount_dollars", 0)))
        credits_added_this_request = False
        
        if session.payment_status == "paid" and not _is_session_processed(session_id):
            old_credits = current_user.credits
            current_user.credits += credits_to_add
            db.commit()
            credits_added_this_request = True
            
            logger.info(
                f"Credits added via verify-session fallback! User {current_user.email} - "
                f"${amount_dollars} -> {credits_to_add} credits. "
                f"Balance: {old_credits} -> {current_user.credits}"
            )
        
        db.refresh(current_user)
        
        return {
            "payment_status": session.payment_status,
            "amount_dollars": amount_dollars,
            "credits_purchased": credits_to_add,
            "current_credits": current_user.credits,
            "credits_added": credits_added_this_request,
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Error verifying session: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session"
        )

