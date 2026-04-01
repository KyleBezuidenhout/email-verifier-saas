"""
Website Contact Scraper API Endpoints

Provides endpoints for website contact extraction using ZenRows API.
This is completely separate from the Sales Nav, Enrichment, and Verification features.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from datetime import datetime
import logging
import csv
import io
import uuid
import httpx
import boto3
import time
import json

from app.db.session import get_db
from app.models.user import User
from app.models.website_scraper_job import WebsiteScraperJob
from app.api.dependencies import get_current_user
from app.schemas.website_scraper import (
    WebsiteScraperJobResponse,
    WebsiteScraperJobListResponse,
    WebsiteScraperUploadResponse,
    WebsiteScraperHealthResponse,
    WebsiteScraperJobStatusResponse,
)
from app.core.config import settings
import redis

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize Redis connection for job queue
redis_client = redis.from_url(settings.REDIS_URL, socket_timeout=5, socket_connect_timeout=5)

# Queue name for website scraper jobs
WEBSITE_SCRAPER_QUEUE = "website-scraper-queue"

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Max file size: 200MB
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024
# Max rows: 50K
MAX_ROWS = 50000


def job_to_response(job: WebsiteScraperJob) -> dict:
    """Convert a WebsiteScraperJob to a response dict"""
    return {
        "id": str(job.id),
        "user_id": str(job.user_id),
        "status": job.status,
        "original_filename": job.original_filename,
        "job_name": job.job_name,
        "total_leads": job.total_leads or 0,
        "completed_leads": job.completed_leads or 0,
        "progress_percentage": job.progress_percentage or 0,
        "hit_rate_percentage": float(job.hit_rate_percentage or 0),
        "credits_spent": job.credits_spent or 0,
        "input_file_path": job.input_file_path,
        "output_file_path": job.output_file_path,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
        "error_message": job.error_message,
    }


def detect_duplicate_headers(csv_content: str) -> list:
    """
    Detect duplicate column headers in CSV content.
    Python's csv.DictReader silently uses last-value-wins for duplicates,
    which causes data to be read from the wrong column.
    Returns a list of header names that appear more than once.
    """
    reader = csv.reader(io.StringIO(csv_content))
    try:
        headers = next(reader)
    except StopIteration:
        return []
    seen = set()
    duplicates = set()
    for h in headers:
        normalized = h.strip()
        if normalized in seen:
            duplicates.add(normalized)
        seen.add(normalized)
    return sorted(duplicates)


def normalize_header(h: str) -> str:
    """Normalize header for column detection."""
    return h.lower().replace(' ', '').replace('_', '').replace('-', '')


def auto_detect_website_column(actual_columns: list, normalized_headers: list) -> Optional[str]:
    """Auto-detect the website/URL column."""
    # Common variations for website column
    website_variations = [
        'website', 'url', 'domain', 'companywebsite', 'companydomain', 
        'companyurl', 'company_website', 'corporatewebsite', 'corporate_website',
        'primarydomain', 'organization_primary_domain', 'organizationprimarydomain',
        'site', 'webpage', 'web', 'link', 'siteurl', 'websiteurl'
    ]
    
    for i, norm_header in enumerate(normalized_headers):
        if norm_header in website_variations:
            return actual_columns[i]
    return None


@router.get("/health", response_model=WebsiteScraperHealthResponse)
async def check_health():
    """Check if ZenRows API is accessible and API key is valid"""
    if not settings.ZENROWS_API_KEY:
        return WebsiteScraperHealthResponse(
            zenrows_api="disconnected",
            message="ZENROWS_API_KEY not configured. Please set the environment variable."
        )
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Make a minimal request to test auth
            params = {
                "apikey": settings.ZENROWS_API_KEY,
                "url": "https://httpbin.org/ip",
            }
            response = await client.get("https://api.zenrows.com/v1/", params=params)
            
            if response.status_code == 200:
                return WebsiteScraperHealthResponse(
                    zenrows_api="connected",
                    message="ZenRows API connected"
                )
            elif response.status_code == 401:
                return WebsiteScraperHealthResponse(
                    zenrows_api="disconnected",
                    message="Invalid ZenRows API key"
                )
            elif response.status_code == 402:
                return WebsiteScraperHealthResponse(
                    zenrows_api="disconnected",
                    message="ZenRows account has insufficient credits"
                )
            else:
                return WebsiteScraperHealthResponse(
                    zenrows_api="disconnected",
                    message=f"ZenRows API returned status {response.status_code}"
                )
    except Exception as e:
        logger.error(f"Failed to connect to ZenRows: {str(e)}")
        return WebsiteScraperHealthResponse(
            zenrows_api="disconnected",
            message=f"Could not connect to ZenRows API: {str(e)}"
        )


@router.post("/upload", response_model=WebsiteScraperUploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    column_website: Optional[str] = Form(None),
    job_name: Optional[str] = Form(None),
    enable_cache: Optional[bool] = Form(True),
    enable_sublink_scraping: Optional[bool] = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV file with website URLs for contact extraction.
    
    The CSV must contain a column with website URLs.
    Column detection is automatic but can be overridden with column_website parameter.
    
    Optional features:
    - enable_cache: Use cached results for previously scraped URLs (default: True)
    - enable_sublink_scraping: Scrape contact pages if no email on main page (default: True)
    
    Max file size: 200MB
    Max rows: 50,000
    """
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )
    
    # Read file contents
    contents = await file.read()
    
    # Check file size
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is 200MB."
        )
    
    # Parse CSV (handle UTF-8 BOM)
    try:
        csv_content = contents.decode('utf-8-sig')
        
        # Detect duplicate headers before DictReader silently merges them
        duplicate_headers = detect_duplicate_headers(csv_content)
        if duplicate_headers:
            logger.warning(f"⚠️  Duplicate headers detected: {duplicate_headers}")
        
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(csv_reader)
    except Exception as e:
        logger.error(f"Failed to parse CSV: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error. Please try again later."
        )
    
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )
    
    # Check row count
    if len(rows) > MAX_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many rows. Maximum is {MAX_ROWS:,} rows. Your file has {len(rows):,} rows."
        )
    
    # Get actual column names
    actual_columns = list(rows[0].keys())
    normalized_headers = [normalize_header(h) for h in actual_columns]
    
    logger.info(f"📋 Website Scraper - Detected columns: {actual_columns}")
    
    # #region agent log
    log_data = {
        "location": "website_scraper.py:195",
        "message": "Backend received column_website parameter",
        "data": {
            "column_website_param": column_website,
            "actual_columns": actual_columns,
            "column_website_in_columns": column_website in actual_columns if column_website else False
        },
        "timestamp": int(time.time() * 1000),
        "sessionId": "debug-session",
        "runId": "run1",
        "hypothesisId": "A"
    }
    try:
        with open("/Users/kylebezuidenhout/Downloads/Cold-Email-SaaS/.cursor/debug.log", "a") as f:
            f.write(json.dumps(log_data) + "\n")
    except:
        pass
    # #endregion
    
    # Detect or use provided website column
    if column_website and column_website in actual_columns:
        website_col = column_website
        logger.info(f"📋 Using provided website column: '{website_col}'")
    else:
        website_col = auto_detect_website_column(actual_columns, normalized_headers)
        if not website_col:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not auto-detect website column. Available columns: {', '.join(actual_columns)}. Please provide column_website parameter."
            )
        logger.info(f"📋 Auto-detected website column: '{website_col}'")
    
    # Count valid website rows
    valid_rows = 0
    for row in rows:
        website = row.get(website_col, '').strip()
        if website:
            valid_rows += 1
    
    if valid_rows == 0:
        detail_msg = f"No valid website URLs found in column '{website_col}'."
        if duplicate_headers:
            detail_msg += f" WARNING: Your CSV has duplicate column headers ({', '.join(duplicate_headers)}). This causes data to be read incorrectly. Please remove duplicate columns and re-upload."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail_msg
        )
    
    logger.info(f"✅ Found {valid_rows} valid website URLs out of {len(rows)} rows")
    
    # Create job record
    job = WebsiteScraperJob(
        user_id=current_user.id,
        status="pending",
        original_filename=file.filename,
        job_name=job_name.strip() if job_name else None,
        total_leads=valid_rows,
        completed_leads=0,
        progress_percentage=0,
        hit_rate_percentage=0.00,
        enable_cache=enable_cache if enable_cache is not None else True,
        enable_sublink_scraping=enable_sublink_scraping if enable_sublink_scraping is not None else True,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Upload file to R2
    input_file_path = f"website-scraper-jobs/{job.id}/input/{file.filename}"
    try:
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=input_file_path,
            Body=contents,
            ContentType="text/csv"
        )
        job.input_file_path = input_file_path
        db.commit()
        logger.info(f"✅ Uploaded CSV to R2: {input_file_path}")
    except Exception as e:
        db.delete(job)
        db.commit()
        logger.error(f"Failed to upload to R2: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error. Please try again later."
        )
    
    # Queue job for processing
    try:
        # Pass job ID, website column, and optional feature flags
        # Format: job_id|website_col|enable_cache|enable_sublink_scraping
        job_data = f"{job.id}|{website_col}|{int(job.enable_cache)}|{int(job.enable_sublink_scraping)}"
        
        # #region agent log
        log_data = {
            "location": "website_scraper.py:262",
            "message": "Backend queuing job with column",
            "data": {
                "job_id": str(job.id),
                "website_col": website_col,
                "enable_cache": job.enable_cache,
                "enable_sublink_scraping": job.enable_sublink_scraping,
                "queue_data": job_data
            },
            "timestamp": int(time.time() * 1000),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "B"
        }
        try:
            with open("/Users/kylebezuidenhout/Downloads/Cold-Email-SaaS/.cursor/debug.log", "a") as f:
                f.write(json.dumps(log_data) + "\n")
        except:
            pass
        # #endregion
        
        redis_client.lpush(WEBSITE_SCRAPER_QUEUE, job_data)
        queue_length = redis_client.llen(WEBSITE_SCRAPER_QUEUE)
        logger.info(f"📤 QUEUED website scraper job {job.id} (queue length: {queue_length})")
    except Exception as e:
        logger.error(f"❌ Failed to queue job {job.id}: {e}")
        # Job will remain in pending state - can be manually processed later
    
    return WebsiteScraperUploadResponse(
        job_id=str(job.id),
        message="File uploaded successfully. Processing started.",
        total_websites=valid_rows
    )


@router.get("/jobs", response_model=WebsiteScraperJobListResponse)
def list_jobs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all website scraper jobs for the current user"""
    try:
        query = db.query(WebsiteScraperJob).filter(WebsiteScraperJob.user_id == current_user.id)
        
        if status_filter:
            query = query.filter(WebsiteScraperJob.status == status_filter)
        
        # Get total count
        total = query.count()
        
        # Get paginated results, newest first
        jobs = query.order_by(desc(WebsiteScraperJob.created_at)).offset(offset).limit(limit).all()
        
        return WebsiteScraperJobListResponse(
            jobs=[job_to_response(job) for job in jobs],
            total=total,
        )
    except Exception as e:
        logger.error(f"Error listing website scraper jobs: {e}")
        raise HTTPException(status_code=400, detail="Error. Please try again later.")


@router.get("/jobs/{job_id}", response_model=WebsiteScraperJobResponse)
def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific website scraper job"""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(WebsiteScraperJob).filter(
        WebsiteScraperJob.id == job_uuid,
        WebsiteScraperJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job_to_response(job)


@router.get("/jobs/{job_id}/status", response_model=WebsiteScraperJobStatusResponse)
def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get real-time status for a job (for polling)"""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(WebsiteScraperJob).filter(
        WebsiteScraperJob.id == job_uuid,
        WebsiteScraperJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return WebsiteScraperJobStatusResponse(
        job_id=str(job.id),
        status=job.status,
        total_leads=job.total_leads or 0,
        completed_leads=job.completed_leads or 0,
        progress_percentage=job.progress_percentage or 0,
        hit_rate_percentage=float(job.hit_rate_percentage or 0),
        credits_spent=job.credits_spent or 0,
        error_message=job.error_message,
    )


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a website scraper job"""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(WebsiteScraperJob).filter(
        WebsiteScraperJob.id == job_uuid,
        WebsiteScraperJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Mark job as cancelled in Redis if processing
    try:
        cancel_key = f"website-scraper:cancelled:{job_id}"
        redis_client.set(cancel_key, "true", ex=3600)  # 1 hour TTL
    except Exception as e:
        logger.warning(f"Could not set cancel flag in Redis: {e}")
    
    db.delete(job)
    db.commit()
    
    logger.info(f"Deleted website scraper job {job_id}")
    
    return {"message": "Job deleted successfully", "job_id": job_id}


@router.get("/jobs/{job_id}/download")
def download_results(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download results CSV for a completed job"""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(WebsiteScraperJob).filter(
        WebsiteScraperJob.id == job_uuid,
        WebsiteScraperJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not completed (status: {job.status})"
        )
    
    if not job.output_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output file not found"
        )
    
    try:
        response = s3_client.get_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=job.output_file_path
        )
        csv_content = response['Body'].read()
        
        # Generate filename
        original_name = job.original_filename or "results"
        if original_name.endswith('.csv'):
            original_name = original_name[:-4]
        filename = f"{original_name}_with_contacts.csv"
        
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(csv_content)),
            }
        )
    except Exception as e:
        logger.error(f"Failed to download from R2: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download results file"
        )


@router.get("/jobs/{job_id}/preview")
def preview_results(
    job_id: str,
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Preview first N rows of results for a completed job.
    
    Returns JSON array of rows with all columns including extracted contacts.
    Default limit is 25 rows.
    """
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(WebsiteScraperJob).filter(
        WebsiteScraperJob.id == job_uuid,
        WebsiteScraperJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not completed (status: {job.status})"
        )
    
    if not job.output_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output file not found"
        )
    
    try:
        response = s3_client.get_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=job.output_file_path
        )
        csv_content = response['Body'].read().decode('utf-8-sig')
        
        # Parse CSV and get first N rows
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        rows = []
        for i, row in enumerate(csv_reader):
            if i >= limit:
                break
            rows.append(dict(row))
        
        # Get column names
        columns = list(rows[0].keys()) if rows else []
        
        return {
            "job_id": job_id,
            "total_rows": job.total_leads or 0,
            "preview_count": len(rows),
            "columns": columns,
            "rows": rows,
            "hit_rate_percentage": float(job.hit_rate_percentage or 0),
        }
        
    except Exception as e:
        logger.error(f"Failed to preview from R2: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load results preview"
        )
