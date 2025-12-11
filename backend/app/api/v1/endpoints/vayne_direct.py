"""
Direct Vayne API Endpoints (Sales Nav Scraper)
New /api/vayne endpoints - separate router to avoid conflicts
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from uuid import UUID
from datetime import datetime
import io
import boto3

from app.db.session import get_db
from app.models.user import User
from app.models.vayne_order import VayneOrder
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.schemas.vayne import (
    VayneAuthStatusResponse,
    VayneAuthUpdateRequest,
    VayneAuthUpdateResponse,
    VayneCreditsResponse,
    VayneUrlCheckRequest,
    VayneUrlCheckResponse,
    VayneOrderCreateRequest,
    VayneOrderCreateResponse,
    VayneOrderResponse,
    VayneOrderListResponse,
)
from app.services.vayne_client import get_vayne_client
from app.core.config import settings

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Create a new router for /api/vayne endpoints
router = APIRouter()

# Import functions from the main vayne router
from app.api.v1.endpoints.vayne import (
    get_auth_status,
    update_auth,
    get_credits,
    check_url,
    get_order_status,
    get_order,
    export_order,
    export_order_download,
    download_csv,
    get_order_history,
    create_order,
)

# Register all routes
router.add_api_route("/auth", get_auth_status, methods=["GET"], response_model=VayneAuthStatusResponse)
router.add_api_route("/auth", update_auth, methods=["PATCH"], response_model=VayneAuthUpdateResponse)
router.add_api_route("/credits", get_credits, methods=["GET"], response_model=VayneCreditsResponse)
router.add_api_route("/url-check", check_url, methods=["POST"], response_model=VayneUrlCheckResponse)
router.add_api_route("/orders", create_order, methods=["POST"], response_model=VayneOrderCreateResponse, status_code=status.HTTP_201_CREATED)
router.add_api_route("/orders/{order_id}/status", get_order_status, methods=["GET"])
router.add_api_route("/orders/{order_id}", get_order, methods=["GET"], response_model=VayneOrderResponse)
router.add_api_route("/orders/{order_id}/export", export_order, methods=["POST"])
router.add_api_route("/orders/{order_id}/export", export_order_download, methods=["GET"])
router.add_api_route("/orders/{order_id}/csv", download_csv, methods=["GET"])
router.add_api_route("/orders", get_order_history, methods=["GET"], response_model=VayneOrderListResponse)

