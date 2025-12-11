"""
Admin API Endpoints

Protected endpoints for admin dashboard:
- Client management
- All jobs view
- API key usage stats
- Error logs
- Platform statistics
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.api.dependencies import require_admin
from app.services.usage_tracker import get_usage_tracker
from app.services.error_logger import get_error_logger
from app.services.omniverifier_client import OmniVerifierClient
from app.services.vayne_usage_tracker import get_vayne_usage_tracker
from app.services.vayne_client import get_vayne_client

router = APIRouter()

# GMT+2 timezone
GMT_PLUS_2 = ZoneInfo("Africa/Johannesburg")


# ============================================
# CLIENT ENDPOINTS
# ============================================

@router.get("/clients")
async def get_all_clients(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Get all clients with their stats."""
    # Get all users with job stats
    clients = db.query(User).order_by(desc(User.created_at)).offset(offset).limit(limit).all()
    total = db.query(func.count(User.id)).scalar()
    
    result = []
    for client in clients:
        # Get job stats for this client
        job_stats = db.query(
            func.count(Job.id).label("total_jobs"),
            func.coalesce(func.sum(Job.valid_emails_found), 0).label("total_valid"),
            func.coalesce(func.sum(Job.catchall_emails_found), 0).label("total_catchall"),
            func.coalesce(func.sum(Job.total_leads), 0).label("total_leads")
        ).filter(Job.user_id == client.id).first()
        
        # Count by job type
        enrichment_count = db.query(func.count(Job.id)).filter(
            Job.user_id == client.id,
            Job.job_type == "enrichment"
        ).scalar()
        
        verification_count = db.query(func.count(Job.id)).filter(
            Job.user_id == client.id,
            Job.job_type == "verification"
        ).scalar()
        
        result.append({
            "id": str(client.id),
            "email": client.email,
            "full_name": client.full_name,
            "company_name": client.company_name,
            "credits": client.credits,
            "is_active": client.is_active,
            "is_admin": getattr(client, 'is_admin', False),
            "created_at": client.created_at.isoformat() if client.created_at else None,
            "stats": {
                "total_jobs": job_stats.total_jobs or 0,
                "enrichment_jobs": enrichment_count or 0,
                "verification_jobs": verification_count or 0,
                "total_valid_emails": job_stats.total_valid or 0,
                "total_catchall_emails": job_stats.total_catchall or 0,
                "total_leads_processed": job_stats.total_leads or 0
            }
        })
    
    return {
        "clients": result,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/clients/low-credits")
async def get_low_credit_clients(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    threshold: int = Query(10, ge=0)
):
    """Get clients with credits below threshold (excludes admin users who have infinite credits)."""
    clients = db.query(User).filter(
        User.credits < threshold,
        User.is_active == True,
        User.is_admin != True  # Exclude admins - they have infinite credits
    ).order_by(User.credits.asc()).all()
    
    return {
        "clients": [
            {
                "id": str(c.id),
                "email": c.email,
                "full_name": c.full_name,
                "company_name": c.company_name,
                "credits": c.credits,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in clients
        ],
        "threshold": threshold,
        "count": len(clients)
    }


@router.get("/clients/{client_id}")
async def get_client_detail(
    client_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get detailed client profile."""
    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get all jobs for this client
    jobs = db.query(Job).filter(Job.user_id == client_id).order_by(desc(Job.created_at)).limit(50).all()
    
    # Get job stats
    job_stats = db.query(
        func.count(Job.id).label("total_jobs"),
        func.coalesce(func.sum(Job.valid_emails_found), 0).label("total_valid"),
        func.coalesce(func.sum(Job.catchall_emails_found), 0).label("total_catchall"),
        func.coalesce(func.sum(Job.total_leads), 0).label("total_leads"),
        func.coalesce(func.sum(Job.cost_in_credits), 0).label("total_credits_used")
    ).filter(Job.user_id == client_id).first()
    
    return {
        "client": {
            "id": str(client.id),
            "email": client.email,
            "full_name": client.full_name,
            "company_name": client.company_name,
            "credits": client.credits,
            "is_active": client.is_active,
            "is_admin": getattr(client, 'is_admin', False),
            "api_key": str(client.api_key),
            "created_at": client.created_at.isoformat() if client.created_at else None,
            "updated_at": client.updated_at.isoformat() if client.updated_at else None
        },
        "stats": {
            "total_jobs": job_stats.total_jobs or 0,
            "total_valid_emails": job_stats.total_valid or 0,
            "total_catchall_emails": job_stats.total_catchall or 0,
            "total_leads_processed": job_stats.total_leads or 0,
            "total_credits_used": job_stats.total_credits_used or 0
        },
        "recent_jobs": [
            {
                "id": str(j.id),
                "status": j.status,
                "job_type": j.job_type,
                "total_leads": j.total_leads,
                "processed_leads": j.processed_leads,
                "valid_emails_found": j.valid_emails_found,
                "catchall_emails_found": j.catchall_emails_found,
                "created_at": j.created_at.isoformat() if j.created_at else None
            }
            for j in jobs
        ]
    }


@router.put("/clients/{client_id}/credits")
async def update_client_credits(
    client_id: UUID,
    credits: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update client's credit balance."""
    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    old_credits = client.credits
    client.credits = credits
    db.commit()
    
    return {
        "client_id": str(client_id),
        "old_credits": old_credits,
        "new_credits": credits,
        "message": f"Credits updated from {old_credits} to {credits}"
    }


# ============================================
# JOB ENDPOINTS
# ============================================

@router.get("/jobs")
async def get_all_jobs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None),
    job_type: Optional[str] = Query(None)
):
    """Get all jobs across all clients with client info."""
    query = db.query(Job, User).join(User, Job.user_id == User.id)
    
    if status_filter:
        query = query.filter(Job.status == status_filter)
    if job_type:
        query = query.filter(Job.job_type == job_type)
    
    query = query.order_by(desc(Job.created_at))
    total = query.count()
    results = query.offset(offset).limit(limit).all()
    
    return {
        "jobs": [
            {
                "id": str(job.id),
                "status": job.status,
                "job_type": job.job_type,
                "original_filename": job.original_filename,
                "total_leads": job.total_leads,
                "processed_leads": job.processed_leads,
                "valid_emails_found": job.valid_emails_found,
                "catchall_emails_found": job.catchall_emails_found,
                "cost_in_credits": job.cost_in_credits,
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                "client": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "company_name": user.company_name
                }
            }
            for job, user in results
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/jobs/{job_id}")
async def get_job_detail(
    job_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get detailed job info (admin can view any job)."""
    result = db.query(Job, User).join(User, Job.user_id == User.id).filter(Job.id == job_id).first()
    
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job, user = result
    
    # Get lead counts by status
    lead_stats = db.query(
        Lead.verification_status,
        func.count(Lead.id)
    ).filter(Lead.job_id == job_id).group_by(Lead.verification_status).all()
    
    lead_counts = {status: count for status, count in lead_stats}
    
    return {
        "job": {
            "id": str(job.id),
            "status": job.status,
            "job_type": job.job_type,
            "original_filename": job.original_filename,
            "total_leads": job.total_leads,
            "processed_leads": job.processed_leads,
            "valid_emails_found": job.valid_emails_found,
            "catchall_emails_found": job.catchall_emails_found,
            "cost_in_credits": job.cost_in_credits,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None
        },
        "client": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "company_name": user.company_name
        },
        "lead_counts": lead_counts
    }


# ============================================
# STATISTICS ENDPOINTS
# ============================================

@router.get("/stats")
async def get_platform_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get overall platform statistics."""
    # Total clients
    total_clients = db.query(func.count(User.id)).scalar()
    active_clients = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    
    # Total jobs
    total_jobs = db.query(func.count(Job.id)).scalar()
    
    # Jobs by status
    jobs_by_status = db.query(
        Job.status,
        func.count(Job.id)
    ).group_by(Job.status).all()
    
    # Total leads processed
    total_leads = db.query(func.coalesce(func.sum(Job.total_leads), 0)).scalar()
    total_valid = db.query(func.coalesce(func.sum(Job.valid_emails_found), 0)).scalar()
    total_catchall = db.query(func.coalesce(func.sum(Job.catchall_emails_found), 0)).scalar()
    
    # Today's stats
    today = datetime.now(GMT_PLUS_2).date()
    today_start = datetime.combine(today, datetime.min.time())
    
    jobs_today = db.query(func.count(Job.id)).filter(Job.created_at >= today_start).scalar()
    leads_today = db.query(func.coalesce(func.sum(Job.total_leads), 0)).filter(Job.created_at >= today_start).scalar()
    
    return {
        "clients": {
            "total": total_clients,
            "active": active_clients
        },
        "jobs": {
            "total": total_jobs,
            "by_status": {status: count for status, count in jobs_by_status},
            "today": jobs_today
        },
        "leads": {
            "total_processed": total_leads,
            "total_valid": total_valid,
            "total_catchall": total_catchall,
            "today": leads_today
        }
    }


@router.get("/stats/enrichments")
async def get_enrichment_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    period: str = Query("week", regex="^(day|week|month|custom)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get enrichment stats with date filtering for charts."""
    now = datetime.now(GMT_PLUS_2)
    
    # Determine date range
    if period == "day":
        start = datetime.combine(now.date(), datetime.min.time())
        end = now
    elif period == "week":
        start = datetime.combine(now.date() - timedelta(days=7), datetime.min.time())
        end = now
    elif period == "month":
        start = datetime.combine(now.date() - timedelta(days=30), datetime.min.time())
        end = now
    elif period == "custom" and start_date and end_date:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    else:
        start = datetime.combine(now.date() - timedelta(days=7), datetime.min.time())
        end = now
    
    # Get jobs in range
    jobs = db.query(Job).filter(
        Job.created_at >= start,
        Job.created_at <= end
    ).order_by(Job.created_at).all()
    
    # Group by date for chart
    daily_stats = {}
    for job in jobs:
        date_key = job.created_at.strftime("%Y-%m-%d")
        if date_key not in daily_stats:
            daily_stats[date_key] = {
                "date": date_key,
                "leads_enriched": 0,
                "valid_found": 0,
                "catchall_found": 0,
                "jobs_count": 0
            }
        daily_stats[date_key]["leads_enriched"] += job.total_leads or 0
        daily_stats[date_key]["valid_found"] += job.valid_emails_found or 0
        daily_stats[date_key]["catchall_found"] += job.catchall_emails_found or 0
        daily_stats[date_key]["jobs_count"] += 1
    
    # Sort by date
    chart_data = sorted(daily_stats.values(), key=lambda x: x["date"])
    
    # Totals for period
    totals = {
        "total_leads": sum(d["leads_enriched"] for d in chart_data),
        "total_valid": sum(d["valid_found"] for d in chart_data),
        "total_catchall": sum(d["catchall_found"] for d in chart_data),
        "total_jobs": sum(d["jobs_count"] for d in chart_data)
    }
    
    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "chart_data": chart_data,
        "totals": totals
    }


# ============================================
# API KEY USAGE ENDPOINTS
# ============================================

@router.get("/api-keys/usage")
async def get_api_key_usage(
    admin: User = Depends(require_admin)
):
    """Get usage stats for all MailTester API keys."""
    tracker = get_usage_tracker()
    keys_usage = tracker.get_all_keys_usage()
    
    # Get OmniVerifier credits if configured
    omni_credits = None
    try:
        omni_client = OmniVerifierClient()
        credits_response = await omni_client.get_credits()
        omni_credits = {
            "available": credits_response.get("credits", 0),
            "provider": "OmniVerifier"
        }
        await omni_client.close()
    except Exception as e:
        omni_credits = {"error": str(e)}
    
    return {
        "mailtester_keys": keys_usage,
        "omniverifier": omni_credits,
        "total_mailtester_keys": len(keys_usage),
        "total_remaining": sum(k["remaining"] for k in keys_usage)
    }


@router.get("/api-keys/vayne-stats")
async def get_vayne_stats(
    admin: User = Depends(require_admin)
):
    """Get Vayne API account balance and usage statistics."""
    try:
        # Get usage tracker stats
        usage_tracker = get_vayne_usage_tracker()
        usage_stats = usage_tracker.get_daily_stats()
        
        # Get account balance from Vayne API
        vayne_client = get_vayne_client()
        credits_data = await vayne_client.get_credits()
        
        # Vayne API returns: credit_available, daily_limit_leads, daily_limit_accounts, enrichment_credits
        return {
            "available_credits": credits_data.get("credit_available", 0),
            "leads_scraped_today": 0,  # Not provided by Vayne API, would need separate tracking
            "daily_limit": credits_data.get("daily_limit_leads", 0),
            "daily_limit_accounts": credits_data.get("daily_limit_accounts", 0),
            "enrichment_credits": credits_data.get("enrichment_credits", 0),
            "subscription_plan": credits_data.get("subscription_plan"),
            "subscription_expires_at": credits_data.get("subscription_expires_at"),
            "calls_today": usage_stats.get("calls_today", 0),
            "date": usage_stats.get("date")
        }
    except Exception as e:
        # Return error if Vayne API is unavailable
        return {
            "error": str(e),
            "available_credits": 0,
            "calls_today": usage_tracker.get_usage_today() if 'usage_tracker' in locals() else 0,
            "daily_limit": 0
        }


# ============================================
# ERROR LOG ENDPOINTS
# ============================================

@router.get("/errors")
async def get_error_logs(
    admin: User = Depends(require_admin),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """Get verification error logs."""
    logger = get_error_logger()
    
    errors = logger.get_errors(date=date, limit=limit, offset=offset)
    summary = logger.get_error_summary(date=date)
    total_count = logger.get_error_count(date=date)
    
    return {
        "errors": errors,
        "summary": summary,
        "total": total_count,
        "limit": limit,
        "offset": offset
    }


@router.get("/errors/summary")
async def get_error_summary(
    admin: User = Depends(require_admin),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format")
):
    """Get error summary with counts."""
    logger = get_error_logger()
    return logger.get_error_summary(date=date)

