from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sys
import os

from app.core.config import settings
from app.api.v1.endpoints import auth, jobs, results, test, admin, vayne, vayne_direct

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# CORS origins - explicit list
origins = [
    "http://localhost:3000",
    "https://www.billionverifier.io",
    "https://billionverifier.io",
    "https://email-verifier-saas.vercel.app",
    "https://email-verifier-saas-production.vercel.app",
]

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Run migrations on startup
@app.on_event("startup")
async def run_migrations_on_startup():
    """Run database migrations on application startup."""
    try:
        # Add parent directory to path to import migrations
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        
        from migrate_add_catchall_key import migrate as migrate_catchall_key
        from migrate_add_verification_tag import migrate as migrate_verification_tag
        from migrate_add_job_type import migrate as migrate_job_type
        from migrate_add_mx_record import migrate as migrate_mx_record
        from migrate_add_mx_provider import migrate as migrate_mx_provider
        from migrate_add_is_admin import run_migration as migrate_is_admin
        from migrate_add_job_source import migrate as migrate_job_source
        from migrate_add_vayne_orders import migrate as migrate_vayne_orders
        from migrate_add_vayne_csv_path import migrate_add_vayne_csv_path
        
        print("Running database migrations on startup...")
        migrate_catchall_key()
        migrate_verification_tag()
        migrate_job_type()
        migrate_mx_record()
        migrate_mx_provider()
        migrate_is_admin()
        migrate_job_source()
        migrate_vayne_orders()
        migrate_add_vayne_csv_path()
        print("✓ Migrations completed successfully!")
    except Exception as e:
        # Don't crash if migrations fail (columns might already exist)
        print(f"⚠ Migration warning (this is OK if columns already exist): {e}")

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
app.include_router(results.router, prefix="/api/v1/results", tags=["results"])
app.include_router(test.router, prefix="/api/v1", tags=["test"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(vayne.router, prefix="/api/v1/vayne", tags=["vayne"])  # Legacy endpoint
app.include_router(vayne_direct.router, prefix="/api/vayne", tags=["vayne"])  # New direct API endpoint

# Public webhook router (no auth required)
# Import webhook function directly
from app.api.v1.endpoints.vayne import vayne_webhook
webhook_router = APIRouter()
webhook_router.add_api_route("/orders", vayne_webhook, methods=["POST"])
app.include_router(webhook_router, prefix="/api/webhooks/vayne", tags=["webhooks"])

# Vayne webhook verification endpoint (for testing webhook connectivity)
# Configure this URL in Vayne dashboard: https://www.billionverifier.io/api/webhooks/vayne/orders
@app.get("/api/webhooks/vayne/health")
async def vayne_webhook_health():
    """Health check endpoint to verify webhook is accessible."""
    return {
        "status": "healthy",
        "webhook_url": f"{settings.WEBHOOK_BASE_URL}/api/webhooks/vayne/orders",
        "message": "Configure this URL in Vayne dashboard API Settings"
    }

