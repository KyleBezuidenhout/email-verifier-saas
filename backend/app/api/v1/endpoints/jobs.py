from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
import csv
import io
import uuid
from datetime import datetime

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.api.dependencies import get_current_user
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
    
    # Remap CSV rows to standard column names
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
        remapped_rows.append(remapped_row)
    
    # Filter out rows with missing required data
    remapped_rows = [row for row in remapped_rows if row['first_name'] and row['last_name'] and row['website']]
    
    if not remapped_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid rows found in CSV after mapping"
        )
    
    # Create job
    job = Job(
        user_id=current_user.id,
        status="pending",
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
            )
            leads_to_create.append(lead)
    
    # Bulk insert leads
    db.bulk_save_objects(leads_to_create)
    db.commit()
    
    # Queue job for processing using BullMQ
    try:
        if USE_BULLMQ_PACKAGE:
            # Use BullMQ Python package
            await bullmq_queue.add("email-verification", str(job.id))
            print(f"Queued job {job.id} to BullMQ")
        else:
            # Manual BullMQ implementation
            job_id_str = str(job.id)
            bullmq_job_id = str(uuid.uuid4())
            timestamp = int(time.time() * 1000)
            
            # BullMQ job structure
            job_data = {
                "id": bullmq_job_id,
                "name": "email-verification",
                "data": job_id_str,  # Worker expects job.data to be the job ID
                "opts": {},
                "timestamp": timestamp,
                "delay": 0,
                "priority": 0,
                "attemptsMade": 0,
            }
            
            # Store job in Redis (BullMQ format)
            job_key = f"bull:email-verification:{bullmq_job_id}"
            redis_client.set(job_key, json.dumps(job_data))
            
            # Add to waiting list
            redis_client.lpush("bull:email-verification:wait", bullmq_job_id)
            
            # Add to jobs sorted set
            redis_client.zadd("bull:email-verification:jobs", {bullmq_job_id: timestamp})
            
            # Add to meta (BullMQ tracks this)
            redis_client.sadd("bull:email-verification:meta", bullmq_job_id)
            
            print(f"Queued job {job.id} to BullMQ (manual) with ID {bullmq_job_id}")
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


@router.get("", response_model=List[JobResponse])
async def get_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        jobs = db.query(Job).filter(Job.user_id == current_user.id).order_by(desc(Job.created_at)).all()
        print(f"Found {len(jobs)} jobs for user {current_user.id}")
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
    
    # Delete associated leads (CASCADE should handle this, but being explicit)
    db.query(Lead).filter(Lead.job_id == job.id).delete()
    db.delete(job)
    db.commit()
    
    from fastapi.responses import Response
    return Response(status_code=status.HTTP_204_NO_CONTENT)



