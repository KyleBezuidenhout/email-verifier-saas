from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Literal, Optional

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.email_service import send_support_email

router = APIRouter()

CATEGORY_LABELS = {
    "question": "General Question",
    "bug": "Bug Report",
    "feature_request": "Feature Request",
    "billing": "Billing",
    "other": "Other",
}


class SupportTicket(BaseModel):
    category: Literal["question", "bug", "feature_request", "billing", "other"]
    subject: Optional[str] = Field(None, max_length=200)
    message: str = Field(..., min_length=10, max_length=5000)


@router.post("/submit", status_code=200)
async def submit_support_ticket(
    ticket: SupportTicket,
    current_user: User = Depends(get_current_user),
):
    user_name = current_user.full_name or current_user.email
    label = CATEGORY_LABELS.get(ticket.category, ticket.category)
    subject = ticket.subject if ticket.subject else label
    success = send_support_email(
        user_email=current_user.email,
        user_name=user_name,
        category=label,
        subject=subject,
        message=ticket.message,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send support email. Please try again or email us directly.",
        )
    return {"message": "Support request submitted successfully"}
