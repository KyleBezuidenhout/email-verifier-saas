from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import Optional, List
import csv
import io
import uuid
from datetime import datetime

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.api.dependencies import get_current_user, ADMIN_EMAIL
from app.schemas.job import JobResponse, JobUploadResponse, JobProgressResponse
from app.services.permutation import generate_email_permutations, normalize_domain
from app.core.config import settings
from app.core.security import decode_token
import boto3
import redis
import asyncio
import json
import time
from urllib.parse import urlparse

router = APIRouter()

# Initialize Redis connection for job queue
redis_client = redis.from_url(settings.REDIS_URL)

# Try to use BullMQ Python package, fallback to manual implementation
try:
    from bullmq import Queue
    redis_url_parsed = urlparse(settings.REDIS_URL)
    bullmq_queue = Queue("email-verification", connection={
        "host": redis_url_parsed.hostname or "localhost",
        "port": redis_url_parsed.port or 6379,
        "password": redis_url_parsed.password,
    })
    USE_BULLMQ_PACKAGE = True
except ImportError:
    USE_BULLMQ_PACKAGE = False
    print("BullMQ package not found, using manual queue implementation")

# Initialize S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
    aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region_name='auto'
)


@router.post("/upload", response_model=JobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    company_size: Optional[str] = Form(None),
    column_first_name: Optional[str] = Form(None),
    column_last_name: Optional[str] = Form(None),
    column_website: Optional[str] = Form(None),
    column_company_size: Optional[str] = Form(None),
    source: Optional[str] = Form(None),  # e.g., "Sales Nav"
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )
    
    # Read and parse CSV
    contents = await file.read()
    csv_content = contents.decode('utf-8')
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    
    # Get actual column names from CSV
    rows = list(csv_reader)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )
    
    actual_columns = list(rows[0].keys())
    
    # Use provided column mappings or default to standard names
    first_name_col = column_first_name or 'first_name'
    last_name_col = column_last_name or 'last_name'
    website_col = column_website or 'website'
    company_size_col = column_company_size or 'company_size'
    
    # Validate that mapped columns exist in CSV
    required_mappings = {
        'first_name': first_name_col,
        'last_name': last_name_col,
        'website': website_col,
    }
    
    missing_columns = []
    for standard_name, mapped_name in required_mappings.items():
        if mapped_name not in actual_columns:
            missing_columns.append(f"{standard_name} (mapped to '{mapped_name}')")
    
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )
    
    # Remap CSV rows to standard column names and capture extra columns
    # Standard columns that are mapped to specific fields
    mapped_cols = {first_name_col, last_name_col, website_col, company_size_col}
    
    remapped_rows = []
    for row in rows:
        remapped_row = {
            'first_name': row.get(first_name_col, '').strip(),
            'last_name': row.get(last_name_col, '').strip(),
            'website': row.get(website_col, '').strip(),
        }
        if company_size_col in actual_columns and row.get(company_size_col):
            remapped_row['company_size'] = row.get(company_size_col, '').strip()
        elif company_size:
            remapped_row['company_size'] = company_size
        
        # Capture all extra columns (not in mapped_cols) into extra_data
        extra_data = {}
        for col, val in row.items():
            if col not in mapped_cols and val and str(val).strip():
                extra_data[col] = str(val).strip()
        remapped_row['extra_data'] = extra_data
        
        remapped_rows.append(remapped_row)
    
    # Filter out rows with missing required data
    remapped_rows = [row for row in remapped_rows if row['first_name'] and row['last_name'] and row['website']]
    
    if not remapped_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid rows found in CSV after mapping"
        )
    
    # Check credits (1 credit per lead) - skip for admin
    leads_count = len(remapped_rows)
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    
    if not is_admin and current_user.credits < leads_count:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credits. You have {current_user.credits} credits but this job requires {leads_count} credits. Please top up your account."
        )
    
    # Create job - total_leads = unique people (not permutations)
    job = Job(
        user_id=current_user.id,
        status="pending",
        original_filename=file.filename,
        total_leads=len(remapped_rows),  # Unique people count
        processed_leads=0,
        valid_emails_found=0,
        catchall_emails_found=0,
        cost_in_credits=0,
        source=source,  # Tag job with source (e.g., "Sales Nav")
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Upload file to R2
    input_file_path = f"jobs/{job.id}/input/{file.filename}"
    try:
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=input_file_path,
            Body=contents
        )
        job.input_file_path = input_file_path
    except Exception as e:
        db.delete(job)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}"
        )
    
    # Create leads and generate permutations
    leads_to_create = []
    for row in remapped_rows:
        first_name = row['first_name']
        last_name = row['last_name']
        website = row['website']
        domain = normalize_domain(website)
        
        # Use company_size from row if available, otherwise use form parameter
        row_company_size = row.get('company_size') or company_size
        
        # Generate email permutations
        permutations = generate_email_permutations(
            first_name, last_name, domain, row_company_size
        )
        
        # Create lead for each permutation
        for perm in permutations:
            lead = Lead(
                job_id=job.id,
                user_id=current_user.id,
                first_name=first_name,
                last_name=last_name,
                domain=domain,
                company_size=row_company_size,
                email=perm['email'],
                pattern_used=perm['pattern'],
                prevalence_score=perm['prevalence_score'],
                verification_status='pending',
                is_final_result=False,
                extra_data=row.get('extra_data', {}),
            )
            leads_to_create.append(lead)
    
    # Bulk insert leads
    db.bulk_save_objects(leads_to_create)
    db.commit()
    
    # Queue job for processing - use simple Redis list (worker will poll this)
    try:
        # Simple approach: push job ID to a Redis list
        # Use a different queue name to avoid conflicts with BullMQ
        job_id_str = str(job.id)
        queue_name = "simple-email-verification-queue"
        redis_client.lpush(queue_name, job_id_str)
        print(f"✅ Queued job {job.id} to Redis queue '{queue_name}'")
    except Exception as e:
        # If Redis fails, job will remain in pending state
        print(f"Failed to queue job: {e}")
        import traceback
        traceback.print_exc()
        pass
    
    return JobUploadResponse(
        job_id=job.id,
        message="File uploaded successfully. Processing started."
    )


@router.post("/verify-upload", response_model=JobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_verify_file(
    file: UploadFile = File(...),
    column_email: Optional[str] = Form(None),
    column_first_name: Optional[str] = Form(None),
    column_last_name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload CSV file for verification-only (no permutation logic).
    CSV must have an 'email' column. Optional: first_name, last_name for display.
    """
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )
    
    # Read and parse CSV
    contents = await file.read()
    csv_content = contents.decode('utf-8')
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    
    # Get actual column names from CSV
    rows = list(csv_reader)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )
    
    actual_columns = list(rows[0].keys())
    
    # Use provided column mappings or default to standard names
    email_col = column_email or 'email'
    first_name_col = column_first_name or 'first_name'
    last_name_col = column_last_name or 'last_name'
    
    # Validate that email column exists
    if email_col not in actual_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required column: email (mapped to '{email_col}')"
        )
    
    # Remap CSV rows to standard column names and capture extra columns
    # Standard columns that are mapped to specific fields
    mapped_cols = {email_col, first_name_col, last_name_col}
    
    remapped_rows = []
    for row in rows:
        email = row.get(email_col, '').strip()
        if not email:
            continue  # Skip rows without email
        
        remapped_row = {
            'email': email,
            'first_name': row.get(first_name_col, '').strip() if first_name_col in actual_columns else '',
            'last_name': row.get(last_name_col, '').strip() if last_name_col in actual_columns else '',
        }
        # Extract domain from email if available
        if '@' in email:
            remapped_row['domain'] = email.split('@')[1]
        
        # Capture all extra columns (not in mapped_cols) into extra_data
        extra_data = {}
        for col, val in row.items():
            if col not in mapped_cols and val and str(val).strip():
                extra_data[col] = str(val).strip()
        remapped_row['extra_data'] = extra_data
        
        remapped_rows.append(remapped_row)
    
    if not remapped_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid rows with email addresses found in CSV"
        )
    
    # Check credits (1 credit per email to verify) - skip for admin
    leads_count = len(remapped_rows)
    is_admin = current_user.email == ADMIN_EMAIL or getattr(current_user, 'is_admin', False)
    
    if not is_admin and current_user.credits < leads_count:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credits. You have {current_user.credits} credits but this job requires {leads_count} credits. Please top up your account."
        )
    
    # Create job with job_type="verification"
    job = Job(
        user_id=current_user.id,
        status="pending",
        job_type="verification",
        original_filename=file.filename,
        total_leads=len(remapped_rows),
        processed_leads=0,
        valid_emails_found=0,
        catchall_emails_found=0,
        cost_in_credits=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Upload file to R2
    input_file_path = f"jobs/{job.id}/input/{file.filename}"
    try:
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=input_file_path,
            Body=contents
        )
        job.input_file_path = input_file_path
    except Exception as e:
        db.delete(job)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}"
        )
    
    # Create leads directly from CSV (no permutations)
    leads_to_create = []
    for row in remapped_rows:
        lead = Lead(
            job_id=job.id,
            user_id=current_user.id,
            first_name=row.get('first_name', ''),
            last_name=row.get('last_name', ''),
            domain=row.get('domain', ''),
            email=row['email'],
            verification_status='pending',
            is_final_result=False,
            extra_data=row.get('extra_data', {}),
        )
        leads_to_create.append(lead)
    
    # Bulk insert leads
    db.bulk_save_objects(leads_to_create)
    db.commit()
    
    # Queue job for processing
    try:
        job_id_str = str(job.id)
        queue_name = "simple-email-verification-queue"
        redis_client.lpush(queue_name, job_id_str)
        print(f"✅ Queued verification job {job.id} to Redis queue '{queue_name}'")
    except Exception as e:
        print(f"Failed to queue job: {e}")
        import traceback
        traceback.print_exc()
        pass
    
    return JobUploadResponse(
        job_id=job.id,
        message="File uploaded successfully. Verification started."
    )


@router.get("", response_model=List[JobResponse])
async def get_jobs(
    job_type: Optional[str] = Query(None, description="Filter by job type: 'enrichment' or 'verification'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(Job).filter(Job.user_id == current_user.id)
        
        # Filter by job_type if provided
        if job_type:
            query = query.filter(Job.job_type == job_type)
        
        jobs = query.order_by(desc(Job.created_at)).all()
        print(f"Found {len(jobs)} jobs for user {current_user.id} (filter: {job_type or 'all'})")
        return [JobResponse.model_validate(job) for job in jobs]
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch jobs: {str(e)}"
        )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Only ben@superwave.io can view other clients' jobs
    if current_user.email == ADMIN_EMAIL:
        # Admin can view any job
        job = db.query(Job).filter(Job.id == job_uuid).first()
    else:
        # Regular users can only view their own jobs
        job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    return JobResponse.model_validate(job)


@router.get("/{job_id}/progress")
async def get_job_progress(
    job_id: str,
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Authenticate user via token
    if token:
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == user.id).first()
                    if not job:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Job not found"
                        )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required"
        )
    
    async def generate_progress():
        while True:
            # Get fresh job data from database
            fresh_job = db.query(Job).filter(Job.id == job_id).first()
            if not fresh_job:
                break
            
            progress_data = JobProgressResponse(
                job_id=fresh_job.id,
                processed_leads=fresh_job.processed_leads,
                total_leads=fresh_job.total_leads,
                valid_emails_found=fresh_job.valid_emails_found,
                catchall_emails_found=fresh_job.catchall_emails_found,
                status=fresh_job.status,
                progress_percentage=(fresh_job.processed_leads / fresh_job.total_leads * 100) if fresh_job.total_leads > 0 else 0
            )
            
            yield f"data: {progress_data.model_dump_json()}\n\n"
            
            # Stop if job is completed or failed
            if fresh_job.status in ['completed', 'failed']:
                break
            
            await asyncio.sleep(1)
    
    return StreamingResponse(
        generate_progress(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/{job_id}/verify-catchalls")
async def verify_catchalls(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify catchall emails from a job using OmniVerifier API."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Get job and verify ownership
    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Get all catchall leads for this job that haven't been verified yet
    catchall_leads = db.query(Lead).filter(
        Lead.job_id == job_uuid,
        Lead.verification_status == "catchall",
        Lead.user_id == current_user.id
    ).filter(
        or_(
            Lead.verification_tag.is_(None),
            Lead.verification_tag.notin_(["catchall-verified", "valid-catchall"])
        )
    ).all()
    
    if not catchall_leads:
        return {
            "message": "No catchall leads found for this job",
            "verified_count": 0,
            "total_catchalls": 0
        }
    
    # Import OmniVerifier client
    from app.services.omniverifier_client import OmniVerifierClient
    
    # Initialize OmniVerifier client
    verifier = OmniVerifierClient()
    verified_count = 0
    errors = []
    list_id = None
    
    try:
        # Step 0: Check credit balance before proceeding
        try:
            credits_response = await verifier.get_credits()
            current_balance = credits_response.get("balance", credits_response.get("credits", 0))
            emails_count = len(catchall_leads)
            
            # Estimate credits needed (typically 1 credit per email for catchall verification)
            # If balance is too low, provide helpful error message
            if current_balance < emails_count:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient credits. You have {current_balance} credits but need at least {emails_count} credits to verify {emails_count} catchall emails. Please add credits to your OmniVerifier account."
                )
        except HTTPException:
            raise
        except Exception as e:
            # If credit check fails, log but continue (might be API issue)
            errors.append(f"Could not check credit balance: {str(e)}")
        
        # Step 1: Create catchall list
        emails_list = [lead.email for lead in catchall_leads]
        title = f"Job {job_id} Catchall Verification"
        
        try:
            create_response = await verifier.create_catchall_list(
                emails_count=len(emails_list),
                title=title
            )
            # API returns {"id": 12346, ...} according to docs
            # Try both "id" and "listId" fields (some APIs use different field names)
            list_id = create_response.get("id") or create_response.get("listId")
            if not list_id:
                print(f"Create response keys: {create_response.keys()}")
                print(f"Full create response: {create_response}")
                raise Exception("Failed to get list ID from OmniVerifier response")
            # Keep as integer initially, convert to string when needed
            list_id_value = list_id
            list_id = str(list_id_value)
            print(f"Created catchall list with ID: {list_id} (original type: {type(list_id_value).__name__})")
            print(f"Full create response: {create_response}")
            
            # IMPORTANT: Add emails IMMEDIATELY after creating list
            # The status check showed list was already "processing" after 3s delay
            # This means the list auto-starts or times out if no emails are added quickly
            # Do NOT add any delay here!
        except HTTPException:
            raise
        except Exception as e:
            error_msg = str(e)
            # Check if it's a 402 error and provide better message
            if "402" in error_msg or "Insufficient credits" in error_msg or "Payment Required" in error_msg:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient credits in your OmniVerifier account. You need at least {len(emails_list)} credits to verify {len(emails_list)} catchall emails. Please add credits to your OmniVerifier account and try again."
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create catchall list: {error_msg}"
            )
        
        # Step 2: Add emails to list IMMEDIATELY (batch add)
        # Must happen before the list auto-starts processing
        try:
            print(f"Adding {len(emails_list)} emails to list {list_id} immediately...")
            await verifier.add_emails_to_list(list_id, emails_list)
            print(f"Successfully added emails to list {list_id}")
        except Exception as e:
            errors.append(f"Failed to add emails to list: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to add emails to list: {str(e)}"
            )
        
        # Step 3: Start list processing
        try:
            await verifier.start_list(list_id)
        except Exception as e:
            errors.append(f"Failed to start list: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to start list: {str(e)}"
            )
        
        # Step 4: Poll for status until complete (max 5 minutes)
        max_wait_time = 300  # 5 minutes
        poll_interval = 30  # Poll every 30 seconds (as per guide recommendation)
        start_time = time.time()
        status_completed = False
        poll_status = ""  # Use different name to avoid shadowing imported 'status' module
        
        while True:
            elapsed_time = time.time() - start_time
            if elapsed_time > max_wait_time:
                errors.append("Timeout waiting for catchall verification to complete")
                break
            
            try:
                status_response = await verifier.get_list_status(list_id)
                poll_status = status_response.get("status", "").lower()
                progress = status_response.get("progress", 0)
                
                print(f"List {list_id} status: {poll_status}, Progress: {progress}%")
                
                # Check for exact "completed" status as per guide
                if poll_status == "completed":
                    status_completed = True
                    print("Processing complete!")
                    break
                elif poll_status == "failed":
                    errors.append("Catchall verification failed")
                    print("Processing failed.")
                    break
                elif poll_status in ["pending", "processing", "in_progress"]:
                    # Continue polling
                    await asyncio.sleep(poll_interval)
                else:
                    # Unknown status, continue polling
                    await asyncio.sleep(poll_interval)
            except Exception as e:
                errors.append(f"Error checking status: {str(e)}")
                await asyncio.sleep(poll_interval)
        
        if not status_completed:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Catchall verification did not complete in time"
            )
        
        # Step 5: Get results
        try:
            results = await verifier.get_list_results(list_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get results: {str(e)}"
            )
        
        # Step 6: Parse results and update leads
        # Create a mapping of email to result for quick lookup
        email_to_result = {}
        for result in results:
            # API returns "email_nominal" field according to OmniVerifier docs
            email = result.get("email_nominal", result.get("email", "")).lower()
            if email:
                email_to_result[email] = result
        
        # Update leads based on results
        for lead in catchall_leads:
            email_lower = lead.email.lower()
            result = email_to_result.get(email_lower)
            
            if result:
                # OmniVerifier returns: status="good"|"risky"|"bad", is_catchall=bool
                # "good" = valid email (deliverable, not catchall)
                # "risky" = potentially catchall but might be deliverable
                # "bad" = catchall or invalid
                result_status = result.get("status", "").lower()
                is_catchall = result.get("is_catchall", False)
                
                # Consider "good" status as valid (deliverable email)
                # Even if is_catchall is true, if status is "good", it's deliverable
                is_valid = result_status == "good"
                
                if is_valid:
                    # Update lead: status to valid, add appropriate tag based on job type
                    lead.verification_status = "valid"
                    # Use "valid-catchall" for verification jobs, "catchall-verified" for enrichment jobs
                    if job.job_type == "verification":
                        lead.verification_tag = "valid-catchall"
                    else:
                        lead.verification_tag = "catchall-verified"
                    verified_count += 1
        
        # Commit all updates
        db.commit()
        
        # Update job counts if needed
        if verified_count > 0:
            # Recalculate valid and catchall counts
            valid_count = db.query(Lead).filter(
                Lead.job_id == job_uuid,
                Lead.verification_status == "valid"
            ).count()
            catchall_count = db.query(Lead).filter(
                Lead.job_id == job_uuid,
                Lead.verification_status == "catchall"
            ).count()
            
            job.valid_emails_found = valid_count
            job.catchall_emails_found = catchall_count
            db.commit()
        
    except HTTPException:
        raise
    except Exception as e:
        errors.append(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during catchall verification: {str(e)}"
        )
    finally:
        await verifier.close()
    
    return {
        "message": f"Verified {verified_count} catchall emails",
        "verified_count": verified_count,
        "total_catchalls": len(catchall_leads),
        "errors": errors if errors else None
    }


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Only delete the job record, NOT the leads (keep leads forever)
    # Leads will remain in database but job reference will be removed
    db.delete(job)
    db.commit()
    
    from fastapi.responses import Response
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{job_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a pending or processing job."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job ID format"
        )
    
    # Verify job belongs to user
    job = db.query(Job).filter(Job.id == job_uuid, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Only allow cancelling pending or processing jobs
    if job.status not in ['pending', 'processing']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job with status: {job.status}"
        )
    
    # Update job status to cancelled
    job.status = 'cancelled'
    db.commit()
    
    return {"message": "Job cancelled successfully", "job_id": str(job.id)}


@router.get("/debug/queue-status")
async def debug_queue_status(
    current_user: User = Depends(get_current_user),
):
    """Debug endpoint to check queue status"""
    try:
        # Check waiting jobs
        waiting_count = redis_client.llen("bull:email-verification:wait")
        waiting_jobs = redis_client.lrange("bull:email-verification:wait", 0, -1)
        
        # Check active jobs
        active_count = redis_client.llen("bull:email-verification:active")
        
        # Check Redis connection
        redis_client.ping()
        
        return {
            "redis_connected": True,
            "waiting_jobs_count": waiting_count,
            "waiting_job_ids": [job_id.decode() if isinstance(job_id, bytes) else job_id for job_id in waiting_jobs],
            "active_jobs_count": active_count,
            "queue_name": "email-verification",
        }
    except Exception as e:
        return {
            "redis_connected": False,
            "error": str(e),
        }



