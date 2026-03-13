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
import logging
from zoneinfo import ZoneInfo

import redis

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.models.vayne_order import VayneOrder
from app.api.dependencies import require_admin
from app.services.usage_tracker import get_usage_tracker
from app.services.error_logger import get_error_logger

from app.services.vayne_usage_tracker import get_vayne_usage_tracker
from app.services.vayne_client import get_vayne_client
from app.core.config import settings
from app.core.security import create_access_token

router = APIRouter()

# Redis client for job cancellation notifications
redis_client = redis.from_url(settings.REDIS_URL)

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
            "max_concurrent_jobs": getattr(client, 'max_concurrent_jobs', 3),
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
    """Get all jobs across all clients with client info, including Sales Nav orders."""
    unified: list = []

    # Enrichment / verification jobs
    if job_type not in ("sales_nav",):
        q = db.query(Job, User).join(User, Job.user_id == User.id)
        if status_filter:
            q = q.filter(Job.status == status_filter)
        if job_type:
            q = q.filter(Job.job_type == job_type)
        for job, user in q.all():
            unified.append({
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
                "file_url": None,
                "failure_reason": None,
                "client": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "company_name": user.company_name,
                },
            })

    # Sales Nav orders
    if job_type in (None, "sales_nav"):
        vq = db.query(VayneOrder, User).join(User, VayneOrder.user_id == User.id)
        if status_filter:
            mapped = "queued" if status_filter == "pending" else status_filter
            vq = vq.filter(VayneOrder.status == mapped)
        for order, user in vq.all():
            unified.append({
                "id": str(order.id),
                "status": "pending" if order.status == "queued" else order.status,
                "job_type": "sales_nav",
                "original_filename": order.targeting,
                "total_leads": order.estimated_leads or 0,
                "processed_leads": order.leads_found or 0,
                "valid_emails_found": order.leads_found or 0,
                "catchall_emails_found": 0,
                "cost_in_credits": order.credits_charged or 0,
                "created_at": order.created_at.isoformat() if order.created_at else None,
                "completed_at": order.completed_at.isoformat() if order.completed_at else None,
                "file_url": order.file_url,
                "failure_reason": order.failure_reason,
                "client": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "company_name": user.company_name,
                },
            })

    unified.sort(key=lambda x: x["created_at"] or "", reverse=True)
    total = len(unified)
    page = unified[offset : offset + limit]

    return {
        "jobs": page,
        "total": total,
        "limit": limit,
        "offset": offset,
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


@router.delete("/jobs/{job_id}", status_code=status.HTTP_200_OK)
async def admin_delete_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Admin endpoint to delete any job (from any user).
    This permanently removes the job from the database.
    The job will no longer appear in the client's dashboard.
    """
    # Find the job (admin can delete any job)
    job = db.query(Job).filter(Job.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get job info for response before deletion
    job_info = {
        "id": str(job.id),
        "user_id": str(job.user_id),
        "status": job.status,
        "job_type": job.job_type,
        "total_leads": job.total_leads
    }
    
    # Notify workers via Redis + clean up fair-share state
    try:
        cancel_key = f"job:cancelled:{job_id}"
        redis_client.set(cancel_key, "true", ex=3600)
        
        # Clean up fair-share registry
        redis_client.hdel("fairshare:active_jobs", str(job_id))
        redis_client.delete(f"fairshare:heartbeat:{job_id}")
        redis_client.delete(f"fairshare:throughput:{job_id}")
        
        # Remove from waiting room if applicable
        waiting_key = f"fairshare:waiting:{job.user_id}"
        redis_client.lrem(waiting_key, 0, str(job_id))
    except Exception as e:
        print(f"Warning: Could not notify workers via Redis: {e}")
    
    # Delete the job (leads remain in database with null job_id reference)
    db.delete(job)
    db.commit()
    
    return {
        "message": f"Job {job_id} deleted successfully",
        "deleted_job": job_info
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
    
    # Read cached OmniVerifier credit balance from Redis (stored by catchall worker)
    omni_credits = None
    try:
        import json as _json
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        raw = r.get("omniverifier:credit_balance")
        if raw:
            data = _json.loads(raw)
            omni_credits = {
                "balance": data.get("balance", 0),
                "last_credits_deducted": data.get("last_credits_deducted"),
                "updated_at": data.get("updated_at"),
            }
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


# ============================================
# FAIR-SHARE MONITORING ENDPOINTS
# ============================================

@router.get("/fairshare/status")
async def get_fairshare_status(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get fair-share system status for admin dashboard."""
    import json
    
    try:
        verification_queue = settings.VERIFICATION_QUEUE if hasattr(settings, 'VERIFICATION_QUEUE') else "simple-email-verification-queue"
        
        # Active jobs from fair-share registry
        active_jobs_raw = redis_client.hgetall("fairshare:active_jobs") or {}
        active_jobs = []
        for job_id, user_id in active_jobs_raw.items():
            jid = job_id if isinstance(job_id, str) else job_id.decode('utf-8')
            uid = user_id if isinstance(user_id, str) else user_id.decode('utf-8')
            
            throughput_raw = redis_client.get(f"fairshare:throughput:{jid}")
            throughput = None
            if throughput_raw:
                try:
                    tp_str = throughput_raw if isinstance(throughput_raw, str) else throughput_raw.decode('utf-8')
                    throughput = json.loads(tp_str)
                except Exception:
                    pass
            
            job = db.query(Job).filter(Job.id == jid).first()
            user = db.query(User).filter(User.id == uid).first() if uid else None
            
            active_jobs.append({
                "job_id": jid,
                "user_id": uid,
                "user_email": user.email if user else "unknown",
                "job_type": job.job_type if job else "unknown",
                "total_leads": job.total_leads if job else 0,
                "processed_leads": job.processed_leads if job else 0,
                "throughput": throughput,
            })
        
        # Queue length
        queue_length = redis_client.llen(verification_queue) or 0
        
        # Queued jobs (from main queue)
        queued_job_ids = redis_client.lrange(verification_queue, 0, -1) or []
        queued_jobs = []
        for qjid in queued_job_ids:
            jid = qjid if isinstance(qjid, str) else qjid.decode('utf-8')
            job = db.query(Job).filter(Job.id == jid).first()
            if job:
                user = db.query(User).filter(User.id == job.user_id).first()
                queued_jobs.append({
                    "job_id": jid,
                    "user_id": str(job.user_id),
                    "user_email": user.email if user else "unknown",
                    "job_type": job.job_type,
                    "total_leads": job.total_leads,
                })
        
        # Waiting room jobs (across all clients)
        waiting_room_jobs = []
        users = db.query(User).all()
        for u in users:
            waiting_key = f"fairshare:waiting:{u.id}"
            waiting_ids = redis_client.lrange(waiting_key, 0, -1) or []
            for wjid in waiting_ids:
                jid = wjid if isinstance(wjid, str) else wjid.decode('utf-8')
                job = db.query(Job).filter(Job.id == jid).first()
                if job:
                    waiting_room_jobs.append({
                        "job_id": jid,
                        "user_id": str(u.id),
                        "user_email": u.email,
                        "job_type": job.job_type,
                        "total_leads": job.total_leads,
                    })
        
        return {
            "active_job_count": len(active_jobs),
            "queued_job_count": queue_length,
            "waiting_room_count": len(waiting_room_jobs),
            "active_jobs": active_jobs,
            "queued_jobs": queued_jobs,
            "waiting_room_jobs": waiting_room_jobs,
        }
    except Exception as e:
        return {
            "error": str(e),
            "active_job_count": 0,
            "queued_job_count": 0,
            "waiting_room_count": 0,
            "active_jobs": [],
            "queued_jobs": [],
            "waiting_room_jobs": [],
        }


@router.put("/clients/{client_id}/max-jobs")
async def update_client_max_jobs(
    client_id: UUID,
    max_jobs: int = Query(..., ge=1, le=50),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a client's max concurrent jobs cap. Promotes waiting room jobs if cap increased."""
    user = db.query(User).filter(User.id == client_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    old_max = getattr(user, 'max_concurrent_jobs', 3)
    user.max_concurrent_jobs = max_jobs
    db.commit()
    
    promoted = 0
    catchall_promoted = 0
    
    # If cap was increased, promote jobs from waiting room to main queue
    if max_jobs > old_max:
        # --- Verification / Enrichment pool ---
        try:
            verification_queue = settings.VERIFICATION_QUEUE if hasattr(settings, 'VERIFICATION_QUEUE') else "simple-email-verification-queue"
            waiting_key = f"fairshare:waiting:{client_id}"
            
            active_jobs = redis_client.hgetall("fairshare:active_jobs") or {}
            queue_items = redis_client.lrange(verification_queue, 0, -1) or []
            
            user_active = sum(
                1 for uid in active_jobs.values()
                if (uid if isinstance(uid, str) else uid.decode('utf-8')) == str(client_id)
            )
            user_queued = 0
            for qjid in queue_items:
                jid = qjid if isinstance(qjid, str) else qjid.decode('utf-8')
                j = db.query(Job).filter(Job.id == jid).first()
                if j and str(j.user_id) == str(client_id):
                    user_queued += 1
            
            slots = max_jobs - (user_active + user_queued)
            
            for _ in range(max(0, slots)):
                next_job = redis_client.lpop(waiting_key)
                if not next_job:
                    break
                jid = next_job if isinstance(next_job, str) else next_job.decode('utf-8')
                db.query(Job).filter(Job.id == jid).update({"status": "queued"})
                redis_client.rpush(verification_queue, jid)
                promoted += 1
            
            if promoted > 0:
                db.commit()
        except Exception as e:
            print(f"Error promoting from verification waiting room: {e}")

        # --- Catchall verification pool (separate) ---
        try:
            catchall_queue = "catchall-verification-queue"
            catchall_waiting_key = f"catchall:waiting:{client_id}"

            catchall_active = redis_client.hgetall("catchall:active_jobs") or {}
            catchall_queue_items = redis_client.lrange(catchall_queue, 0, -1) or []

            ca_user_active = sum(
                1 for uid in catchall_active.values()
                if (uid if isinstance(uid, str) else uid.decode('utf-8')) == str(client_id)
            )
            ca_user_queued = 0
            for qjid in catchall_queue_items:
                jid = qjid if isinstance(qjid, str) else qjid.decode('utf-8')
                j = db.query(Job).filter(Job.id == jid).first()
                if j and str(j.user_id) == str(client_id):
                    ca_user_queued += 1

            ca_slots = max_jobs - (ca_user_active + ca_user_queued)

            for _ in range(max(0, ca_slots)):
                next_job = redis_client.lpop(catchall_waiting_key)
                if not next_job:
                    break
                jid = next_job if isinstance(next_job, str) else next_job.decode('utf-8')
                db.query(Job).filter(Job.id == jid).update({"status": "queued"})
                redis_client.rpush(catchall_queue, jid)
                catchall_promoted += 1

            if catchall_promoted > 0:
                db.commit()
        except Exception as e:
            print(f"Error promoting from catchall waiting room: {e}")
    
    return {
        "client_id": str(client_id),
        "max_concurrent_jobs": max_jobs,
        "previous_max": old_max,
        "promoted_from_waiting_room": promoted + catchall_promoted,
    }


# ============================================
# IMPERSONATION ENDPOINT
# ============================================

@router.post("/impersonate/{client_id}")
async def impersonate_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Generate an access token for the given client so the admin can log in as them."""
    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    access_token = create_access_token(
        data={"sub": str(client.id)},
        expires_delta=timedelta(hours=4),
    )

    logging.info(f"Admin {admin.email} impersonating client {client.email}")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(client.id),
            "email": client.email,
            "full_name": client.full_name,
            "company_name": client.company_name,
        },
    }

