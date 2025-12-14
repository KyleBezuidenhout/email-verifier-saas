from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import sys
import os
import logging
from time import time

from app.core.config import settings
from app.api.v1.endpoints import auth, jobs, results, test, admin, vayne

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# CORS origins - explicit list (kept for reference, but allow all below)
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


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests with detailed information."""
    start_time = time()
    method = request.method
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"
    
    # Log request
    logger.info(f"→ {method} {path} from {client_ip}")
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration = time() - start_time
    status_code = response.status_code
    
    # Log response with special attention to 404s
    if status_code == 404:
        logger.warning(
            f"✗ 404 NOT FOUND: {method} {path} from {client_ip} "
            f"(duration: {duration:.3f}s) - Route not registered!"
        )
    else:
        logger.info(f"← {method} {path} → {status_code} (duration: {duration:.3f}s)")
    
    return response


# 404 handler with detailed logging
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions with detailed logging."""
    if exc.status_code == 404:
        # Get all registered routes
        available_routes = []
        for route in app.routes:
            if hasattr(route, "path"):
                if hasattr(route, "methods"):
                    for method in route.methods:
                        if method != "HEAD":
                            available_routes.append(f"{method} {route.path}")
                else:
                    available_routes.append(route.path)
        
        # Filter webhook-related routes
        webhook_routes = [r for r in available_routes if "webhook" in r.lower()]
        
        # Build error message
        error_msg = f"""
{'=' * 80}
❌ 404 NOT FOUND
  Method: {request.method}
  Path: {request.url.path}
  Client IP: {request.client.host if request.client else 'unknown'}
  Query params: {dict(request.query_params)}
  Requested URL: {request.url}

  WEBHOOK ROUTES FOUND:
"""
        if webhook_routes:
            for route in webhook_routes:
                error_msg += f"    ✓ {route}\n"
        else:
            error_msg += "    ⚠️  NO WEBHOOK ROUTES REGISTERED!\n"
        
        error_msg += f"\n  ALL AVAILABLE ROUTES (first 20):\n"
        for route in sorted(set(available_routes))[:20]:
            error_msg += f"    - {route}\n"
        if len(available_routes) > 20:
            error_msg += f"    ... and {len(available_routes) - 20} more routes\n"
        error_msg += "=" * 80
        
        # Use both print and logger to ensure visibility
        print(error_msg)  # Print to ensure it shows in console/logs
        logger.error(error_msg)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "*",
        }
    )


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc} for {request.method} {request.url.path}")
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


# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
app.include_router(results.router, prefix="/api/v1/results", tags=["results"])
app.include_router(test.router, prefix="/api/v1", tags=["test"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
# Vayne router - must be included to register all endpoints
app.include_router(vayne.router, prefix="/api/v1/vayne", tags=["vayne"])


# Run migrations and log routes on startup
@app.on_event("startup")
async def startup_tasks():
    """Run database migrations and log registered routes on application startup."""
    # Run migrations
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
        from migrate_add_job_source_and_vayne_orders import migrate as migrate_job_source_and_vayne_orders

        logger.info("Running database migrations on startup...")
        migrate_catchall_key()
        migrate_verification_tag()
        migrate_job_type()
        migrate_mx_record()
        migrate_mx_provider()
        migrate_is_admin()
        migrate_job_source_and_vayne_orders()
        logger.info("✓ Migrations completed successfully!")
    except Exception as e:
        # Don't crash if migrations fail (columns might already exist)
        logger.warning(f"⚠ Migration warning (this is OK if columns already exist): {e}")
    
    # Log all registered routes
    logger.info("=" * 80)
    logger.info("REGISTERED ROUTES:")
    logger.info("=" * 80)
    routes = []
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            for method in route.methods:
                if method != "HEAD":  # Skip HEAD methods
                    routes.append(f"  {method:6} {route.path}")
    
    for route in sorted(routes):
        logger.info(route)
    
    # Specifically log webhook routes
    webhook_routes = [r for r in routes if "webhook" in r.lower()]
    if webhook_routes:
        logger.info("=" * 80)
        logger.info("WEBHOOK ROUTES:")
        print("=" * 80)
        print("WEBHOOK ROUTES REGISTERED:")
        for route in webhook_routes:
            logger.info(route)
            print(f"  ✓ {route}")
        print("=" * 80)
    else:
        logger.warning("⚠️  NO WEBHOOK ROUTES FOUND!")
        print("⚠️  NO WEBHOOK ROUTES FOUND!")
    logger.info("=" * 80)


