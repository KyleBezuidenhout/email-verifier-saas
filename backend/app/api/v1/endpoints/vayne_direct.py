"""
Direct Vayne API Endpoints (Sales Nav Scraper)
Provides /api/vayne endpoints (without /v1) for frontend compatibility
"""

from fastapi import APIRouter

# Create a new router for /api/vayne endpoints
router = APIRouter()

# Import endpoint functions from the main vayne router
from app.api.v1.endpoints.vayne import (
    check_linkedin_auth,
    update_linkedin_auth,
    get_credits,
    url_check,
    get_order,
    export_order,
    create_order,
)

# Import the actual schemas used by the functions
from app.schemas.vayne import (
    LinkedInAuthStatus,
    CreditsResponse,
    UrlValidationResponse,
    CreateOrderResponse,
    OrderStatusResponse,
)

# Register all routes - reusing the same endpoint functions from vayne.py
router.add_api_route("/auth", check_linkedin_auth, methods=["GET"], response_model=LinkedInAuthStatus)
router.add_api_route("/auth", update_linkedin_auth, methods=["PATCH"], response_model=LinkedInAuthStatus)
router.add_api_route("/credits", get_credits, methods=["GET"], response_model=CreditsResponse)
router.add_api_route("/url-check", url_check, methods=["POST"], response_model=UrlValidationResponse)
router.add_api_route("/orders", create_order, methods=["POST"], response_model=CreateOrderResponse)
router.add_api_route("/orders/{order_id}", get_order, methods=["GET"], response_model=OrderStatusResponse)
router.add_api_route("/orders/{order_id}/export", export_order, methods=["POST"])
