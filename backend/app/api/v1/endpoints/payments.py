"""
Stripe Payment Endpoints for Credit Top-Up
"""
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.api.v1.endpoints.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

# Credit pricing
CREDIT_PRICE = 0.004  # $0.004 per credit


class CreateCheckoutRequest(BaseModel):
    amount_dollars: int  # Amount in dollars ($10-$500)


class CreateCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


@router.post("/create-checkout", response_model=CreateCheckoutResponse)
async def create_checkout_session(
    payload: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a Stripe Checkout Session for credit top-up.
    
    - amount_dollars: The dollar amount to charge ($10-$500)
    - Credits calculated at $0.004 per credit (250 credits per dollar)
    """
    # Validate amount
    if payload.amount_dollars < 10 or payload.amount_dollars > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be between $10 and $500"
        )
    
    # Calculate credits
    credits_to_add = int(payload.amount_dollars / CREDIT_PRICE)
    
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
                "credits_added": "false",  # Track if credits have been added
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
        
        # Check if we've already processed this session (prevent duplicates)
        if session_id in _processed_sessions:
            logger.info(f"Session {session_id} already processed, skipping webhook")
            return {"status": "already_processed", "session_id": session_id}
        
        # Extract metadata
        user_id = session.get("metadata", {}).get("user_id")
        credits_to_add = session.get("metadata", {}).get("credits_to_add")
        amount_dollars = session.get("metadata", {}).get("amount_dollars")
        
        if not user_id or not credits_to_add:
            logger.error(f"Missing metadata in checkout session: {session_id}")
            return {"status": "error", "message": "Missing metadata"}
        
        credits_to_add = int(credits_to_add)
        
        # Find user and add credits
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"User not found for checkout session: {user_id}")
            return {"status": "error", "message": "User not found"}
        
        # Mark as processed BEFORE adding credits to prevent race conditions
        _processed_sessions.add(session_id)
        
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


# Track processed sessions in memory (for simple duplicate prevention)
# In production, you'd want to store this in Redis or a database table
_processed_sessions: set = set()


@router.get("/verify-session/{session_id}")
async def verify_checkout_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify a checkout session and return payment status.
    Used by the success page to confirm payment and show updated credits.
    
    Also acts as a fallback to add credits if webhook hasn't processed yet.
    """
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        # Verify this session belongs to the current user
        if session.metadata.get("user_id") != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Session does not belong to this user"
            )
        
        credits_to_add = int(session.metadata.get("credits_to_add", 0))
        amount_dollars = int(session.metadata.get("amount_dollars", 0))
        credits_added_this_request = False
        
        # If payment is successful and we haven't processed this session yet, add credits
        # This is a fallback in case the webhook hasn't fired or isn't configured
        if session.payment_status == "paid" and session_id not in _processed_sessions:
            _processed_sessions.add(session_id)
            
            # Add credits to user
            old_credits = current_user.credits
            current_user.credits += credits_to_add
            db.commit()
            credits_added_this_request = True
            
            logger.info(
                f"✅ Credits added via verify-session fallback! User {current_user.email} - "
                f"${amount_dollars} -> {credits_to_add} credits. "
                f"Balance: {old_credits} -> {current_user.credits}"
            )
        
        # Refresh user to get updated credits
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

