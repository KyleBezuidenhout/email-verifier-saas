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
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, desc, text, update
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID
import json
import logging
from zoneinfo import ZoneInfo

import redis

from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.lead import Lead
from app.models.vayne_order import VayneOrder
from app.models.queue_depth_snapshot import QueueDepthSnapshot
from app.api.dependencies import require_admin
from app.services.usage_tracker import get_usage_tracker
from app.services.error_logger import get_error_logger

from app.services.vayne_usage_tracker import get_vayne_usage_tracker
from app.services.vayne_client import get_vayne_client, get_vayne_clients
from app.core.config import settings
from app.core.security import create_access_token
from app.core.plans import PLAN_NAMES, is_valid_plan

router = APIRouter()

# Redis client for job cancellation notifications
redis_client = redis.from_url(settings.REDIS_URL, socket_timeout=5, socket_connect_timeout=5)

# GMT+2 timezone
GMT_PLUS_2 = ZoneInfo("Africa/Johannesburg")


# ============================================
# CLIENT ENDPOINTS
# ============================================

@router.get("/clients")
def get_all_clients(
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
            "credits": float(client.credits) if client.credits is not None else 0,
            "plan": getattr(client, 'plan', 'trial') or 'trial',
            "custom_credit_price": float(client.custom_credit_price) if getattr(client, 'custom_credit_price', None) else None,
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
def get_low_credit_clients(
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
def get_client_detail(
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
            "credits": float(client.credits) if client.credits is not None else 0,
            "plan": getattr(client, 'plan', 'trial') or 'trial',
            "custom_credit_price": float(client.custom_credit_price) if getattr(client, 'custom_credit_price', None) else None,
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
def update_client_credits(
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


@router.put("/clients/{client_id}/plan")
def update_client_plan(
    client_id: UUID,
    plan: str = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a client's billing plan."""
    if not is_valid_plan(plan):
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {', '.join(PLAN_NAMES)}")

    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if plan == "custom" and not getattr(client, 'custom_credit_price', None):
        raise HTTPException(
            status_code=400,
            detail="Set custom_credit_price first before switching to the custom plan",
        )

    old_plan = getattr(client, 'plan', 'trial')
    client.plan = plan

    if old_plan == "custom" and plan != "custom":
        client.custom_credit_price = None

    db.commit()

    return {
        "client_id": str(client_id),
        "old_plan": old_plan,
        "new_plan": plan,
    }


@router.put("/clients/{client_id}/custom-credit-price")
def update_client_custom_credit_price(
    client_id: UUID,
    price: float = Query(..., gt=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Set the per-credit price for a client on the custom plan."""
    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    client.custom_credit_price = price
    db.commit()

    return {
        "client_id": str(client_id),
        "custom_credit_price": price,
        "plan": getattr(client, 'plan', 'trial'),
    }


# ============================================
# JOB ENDPOINTS
# ============================================

@router.get("/jobs")
def get_all_jobs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None),
    job_type: Optional[str] = Query(None)
):
    """Get all jobs across all clients with client info, including Sales Nav orders."""
    unified: list = []

    # Build a set of enrichment job IDs that are linked from Sales Nav
    # orders. We hide these from the merged list so admin doesn't see two
    # rows for the same logical scrape->enrich pipeline; the sales_nav
    # row below already carries enrichment status via LEFT JOIN.
    linked_enrichment_ids = {
        row[0] for row in db.query(VayneOrder.enrichment_job_id)
        .filter(VayneOrder.enrichment_job_id.isnot(None))
        .all()
    }

    # Enrichment / verification jobs
    if job_type not in ("sales_nav",):
        q = db.query(Job, User).join(User, Job.user_id == User.id)
        if status_filter:
            q = q.filter(Job.status == status_filter)
        if job_type:
            q = q.filter(Job.job_type == job_type)
        for job, user in q.all():
            if job.id in linked_enrichment_ids:
                continue
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

    # Sales Nav orders (LEFT JOIN to get enrichment status from linked job)
    if job_type in (None, "sales_nav"):
        EnrichJob = aliased(Job)
        vq = (
            db.query(VayneOrder, User, EnrichJob)
            .join(User, VayneOrder.user_id == User.id)
            .outerjoin(EnrichJob, VayneOrder.enrichment_job_id == EnrichJob.id)
        )
        if status_filter:
            vq = vq.filter(VayneOrder.status == status_filter)
        for order, user, enrich_job in vq.all():
            enrichment_status = enrich_job.status if enrich_job else None
            enrichment_progress = None
            if enrich_job and enrich_job.total_leads and enrich_job.total_leads > 0:
                enrichment_progress = round(
                    (enrich_job.processed_leads or 0) / enrich_job.total_leads * 100
                )
            unified.append({
                "id": str(order.id),
                "status": order.status,
                "job_type": "sales_nav",
                "original_filename": order.targeting,
                "total_leads": order.estimated_leads or 0,
                "processed_leads": order.leads_found or 0,
                "valid_emails_found": enrich_job.valid_emails_found if enrich_job else 0,
                "catchall_emails_found": enrich_job.catchall_emails_found if enrich_job else 0,
                "cost_in_credits": order.credits_charged or 0,
                "created_at": order.created_at.isoformat() if order.created_at else None,
                "completed_at": order.completed_at.isoformat() if order.completed_at else None,
                "file_url": order.file_url,
                "failure_reason": order.failure_reason,
                "auto_enrich": order.auto_enrich,
                "enrichment_job_id": str(order.enrichment_job_id) if order.enrichment_job_id else None,
                "enrichment_status": enrichment_status,
                "enrichment_progress_percentage": enrichment_progress,
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
def get_job_detail(
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
def admin_delete_job(
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
    
    db.execute(update(Lead).where(Lead.job_id == job_id).values(job_id=None))
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
def get_platform_stats(
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
def get_enrichment_stats(
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
def get_api_key_usage(
    admin: User = Depends(require_admin)
):
    """Get usage stats for all MailTester API keys."""
    tracker = get_usage_tracker()
    keys_usage = tracker.get_all_keys_usage()
    
    # Read cached OmniVerifier credit balance from Redis (stored by catchall worker)
    omni_credits = None
    try:
        import json as _json
        r = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)
        raw = r.get("omniverifier:credit_balance")
        if raw:
            data = _json.loads(raw)
            omni_credits = {
                "balance": data.get("balance", 0),
                "last_credits_deducted": data.get("last_credits_deducted"),
                "updated_at": data.get("updated_at"),
            }
    except Exception as e:
        print(f"Failed to fetch OmniVerifier credits from Redis: {e}")
        omni_credits = {"error": "Error. Please try again later."}
    
    return {
        "mailtester_keys": keys_usage,
        "omniverifier": omni_credits,
        "total_mailtester_keys": len(keys_usage),
        "total_remaining": sum(k["remaining"] for k in keys_usage)
    }


@router.get("/api-keys/vayne-stats")
def get_vayne_stats(
    admin: User = Depends(require_admin)
):
    """Get per-key Vayne API credit and daily limit stats."""
    clients = get_vayne_clients()
    keys_data = []

    for idx, client in enumerate(clients):
        masked = f"...{client.api_key[-8:]}" if len(client.api_key) > 8 else "***"
        try:
            credits = client.get_credits()
            keys_data.append({
                "key_index": idx + 1,
                "key_preview": masked,
                "credit_available": credits.get("credit_available", 0),
                "daily_limit_leads": credits.get("daily_limit_leads", 0),
                "error": None,
            })
        except Exception as e:
            print(f"Failed to fetch stats for key {idx + 1}: {e}")
            keys_data.append({
                "key_index": idx + 1,
                "key_preview": masked,
                "credit_available": 0,
                "daily_limit_leads": 0,
                "error": "Error. Please try again later.",
            })

    return {
        "keys": keys_data,
        "total_credit_available": sum(k["credit_available"] for k in keys_data),
        "total_daily_limit_leads": sum(k["daily_limit_leads"] for k in keys_data),
    }


# ============================================
# ERROR LOG ENDPOINTS
# ============================================

@router.get("/errors")
def get_error_logs(
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
def get_error_summary(
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
def get_fairshare_status(
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
        print(f"Error fetching fair-share status: {e}")
        return {
            "error": "Error. Please try again later.",
            "active_job_count": 0,
            "queued_job_count": 0,
            "waiting_room_count": 0,
            "active_jobs": [],
            "queued_jobs": [],
            "waiting_room_jobs": [],
        }


@router.put("/clients/{client_id}/max-jobs")
def update_client_max_jobs(
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
def impersonate_client(
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


# ============================================
# ANALYTICS DASHBOARD ENDPOINT
# ============================================

ANALYTICS_CACHE_TTL = 3600       # 1 hour for time-series data
MEDIAN_CACHE_TTL = 86400         # 24 hours for historical medians

redis_cache = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)


def _get_queue_depth_current(db: Session) -> dict:
    """Read current queue depths from Redis + DB (point-in-time snapshot)."""
    try:
        active_count = redis_cache.hlen("fairshare:active_jobs") or 0

        queued_count = redis_cache.llen("simple-email-verification-queue") or 0
        catchall_queued = redis_cache.llen("catchall-verification-queue") or 0

        vayne_queued = db.query(func.count(VayneOrder.id)).filter(
            VayneOrder.status == "queued"
        ).scalar() or 0

        waiting_room = 0
        try:
            users = db.query(User.id).all()
            for (uid,) in users:
                wlen = redis_cache.llen(f"fairshare:waiting:{uid}") or 0
                waiting_room += wlen
        except Exception:
            pass

        return {
            "active": active_count,
            "queued": queued_count,
            "waiting_room": waiting_room,
            "vayne_queued": vayne_queued,
            "catchall_queued": catchall_queued,
        }
    except Exception as e:
        logging.warning(f"Failed to read queue depths from Redis: {e}")
        return {"active": 0, "queued": 0, "waiting_room": 0, "vayne_queued": 0, "catchall_queued": 0}


def _save_queue_snapshot(db: Session, depths: dict):
    """Persist current queue depths for historical trending."""
    try:
        snap = QueueDepthSnapshot(
            active_jobs=depths["active"],
            queued_jobs=depths["queued"],
            waiting_room_jobs=depths["waiting_room"],
            vayne_queued=depths["vayne_queued"],
            catchall_queued=depths["catchall_queued"],
        )
        db.add(snap)
        db.commit()
    except Exception as e:
        db.rollback()
        logging.warning(f"Failed to save queue snapshot: {e}")


def _compute_hit_rate(db: Session, start: datetime, end: datetime, client_id: Optional[str]) -> list:
    """Graph A: valid_emails_found / total_leads by date and job_type."""
    q = text("""
        SELECT DATE(created_at) AS d,
               job_type,
               SUM(valid_emails_found)::float / NULLIF(SUM(total_leads), 0) * 100 AS hit_rate,
               SUM(total_leads) AS total_leads,
               SUM(valid_emails_found) AS valid_found
        FROM jobs
        WHERE status = 'completed'
          AND created_at >= :start AND created_at <= :end
          AND job_type IN ('enrichment', 'verification')
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY d, job_type
        ORDER BY d
    """)
    rows = db.execute(q, {"start": start, "end": end, "cid": client_id}).fetchall()

    by_date = {}
    for r in rows:
        d = str(r[0])
        jt = r[1] or "enrichment"
        if d not in by_date:
            by_date[d] = {"date": d}
        by_date[d][jt] = round(r[2] or 0, 1)
    return sorted(by_date.values(), key=lambda x: x["date"])


def _compute_turnaround(db: Session, start: datetime, end: datetime, client_id: Optional[str]) -> list:
    """Graph B: Median turnaround time in seconds by date and job_type."""
    q = text("""
        SELECT DATE(completed_at) AS d,
               job_type,
               PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM completed_at - created_at)
               ) AS median_seconds
        FROM jobs
        WHERE status = 'completed'
          AND completed_at IS NOT NULL
          AND created_at >= :start AND created_at <= :end
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY d, job_type
        ORDER BY d
    """)
    rows = db.execute(q, {"start": start, "end": end, "cid": client_id}).fetchall()

    by_date = {}
    for r in rows:
        d = str(r[0])
        jt = r[1] or "enrichment"
        if d not in by_date:
            by_date[d] = {"date": d}
        by_date[d][jt] = round(r[2] or 0, 0)

    vayne_q = text("""
        SELECT DATE(completed_at) AS d,
               PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM completed_at - created_at)
               ) AS median_seconds
        FROM vayne_orders
        WHERE status = 'completed'
          AND completed_at IS NOT NULL
          AND created_at >= :start AND created_at <= :end
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY d
        ORDER BY d
    """)
    vayne_rows = db.execute(vayne_q, {"start": start, "end": end, "cid": client_id}).fetchall()
    for r in vayne_rows:
        d = str(r[0])
        if d not in by_date:
            by_date[d] = {"date": d}
        by_date[d]["sales_nav"] = round(r[1] or 0, 0)

    return sorted(by_date.values(), key=lambda x: x["date"])


def _compute_completion_rate(db: Session, start: datetime, end: datetime, client_id: Optional[str]) -> list:
    """Graph D: completed / (completed + failed) as percentage by date and job_type."""
    q = text("""
        SELECT DATE(created_at) AS d,
               job_type,
               COUNT(*) FILTER (WHERE status = 'completed')::float /
               NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0) * 100 AS rate
        FROM jobs
        WHERE status IN ('completed', 'failed')
          AND created_at >= :start AND created_at <= :end
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY d, job_type
        ORDER BY d
    """)
    rows = db.execute(q, {"start": start, "end": end, "cid": client_id}).fetchall()

    by_date = {}
    for r in rows:
        d = str(r[0])
        jt = r[1] or "enrichment"
        if d not in by_date:
            by_date[d] = {"date": d}
        by_date[d][jt] = round(r[2] or 0, 1)

    vayne_q = text("""
        SELECT DATE(created_at) AS d,
               COUNT(*) FILTER (WHERE status = 'completed')::float /
               NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0) * 100 AS rate
        FROM vayne_orders
        WHERE status IN ('completed', 'failed')
          AND created_at >= :start AND created_at <= :end
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY d
        ORDER BY d
    """)
    vayne_rows = db.execute(vayne_q, {"start": start, "end": end, "cid": client_id}).fetchall()
    for r in vayne_rows:
        d = str(r[0])
        if d not in by_date:
            by_date[d] = {"date": d}
        by_date[d]["sales_nav"] = round(r[1] or 0, 1)

    return sorted(by_date.values(), key=lambda x: x["date"])


def _compute_cache_hit_rate(db: Session, start: datetime, end: datetime, client_id: Optional[str]) -> list:
    """Graph E: enrichment cache hit rate (cache_hits / cache_lookups) by date."""
    q = text("""
        SELECT DATE(completed_at) AS d,
               SUM(cache_hits)::float / NULLIF(SUM(cache_lookups), 0) * 100 AS hit_rate,
               SUM(cache_hits) AS total_hits,
               SUM(cache_lookups) AS total_lookups
        FROM jobs
        WHERE status = 'completed'
          AND job_type = 'enrichment'
          AND cache_lookups > 0
          AND completed_at >= :start AND completed_at <= :end
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY d
        ORDER BY d
    """)
    rows = db.execute(q, {"start": start, "end": end, "cid": client_id}).fetchall()

    return [
        {"date": str(r[0]), "cache_hit_rate": round(r[1] or 0, 1), "hits": int(r[2] or 0), "lookups": int(r[3] or 0)}
        for r in rows
    ]


def _compute_historical_medians(db: Session, client_id: Optional[str]) -> dict:
    """All-time medians for each graph, cached for 24h."""
    cache_key = f"analytics_median:{client_id or 'all'}"
    cached = redis_cache.get(cache_key)
    if cached:
        return json.loads(cached)

    hit_q = text("""
        SELECT job_type,
               PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY valid_emails_found::float / NULLIF(total_leads, 0) * 100
               ) AS median_rate
        FROM jobs
        WHERE status = 'completed' AND total_leads > 0
          AND job_type IN ('enrichment', 'verification')
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY job_type
    """)
    hit_rows = db.execute(hit_q, {"cid": client_id}).fetchall()
    hit_median = {r[0]: round(r[1] or 0, 1) for r in hit_rows}

    turn_q = text("""
        SELECT job_type,
               PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM completed_at - created_at)
               ) AS median_sec
        FROM jobs
        WHERE status = 'completed' AND completed_at IS NOT NULL
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY job_type
    """)
    turn_rows = db.execute(turn_q, {"cid": client_id}).fetchall()
    turn_median = {r[0]: round(r[1] or 0, 0) for r in turn_rows}

    vayne_turn_q = text("""
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM completed_at - created_at)
               ) AS median_sec
        FROM vayne_orders
        WHERE status = 'completed' AND completed_at IS NOT NULL
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
    """)
    vt_row = db.execute(vayne_turn_q, {"cid": client_id}).fetchone()
    if vt_row and vt_row[0]:
        turn_median["sales_nav"] = round(vt_row[0], 0)

    comp_q = text("""
        SELECT job_type,
               COUNT(*) FILTER (WHERE status = 'completed')::float /
               NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0) * 100 AS median_rate
        FROM jobs
        WHERE status IN ('completed', 'failed')
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
        GROUP BY job_type
    """)
    comp_rows = db.execute(comp_q, {"cid": client_id}).fetchall()
    comp_median = {r[0]: round(r[1] or 0, 1) for r in comp_rows}

    vayne_comp_q = text("""
        SELECT COUNT(*) FILTER (WHERE status = 'completed')::float /
               NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0) * 100 AS rate
        FROM vayne_orders
        WHERE status IN ('completed', 'failed')
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
    """)
    vc_row = db.execute(vayne_comp_q, {"cid": client_id}).fetchone()
    if vc_row and vc_row[0]:
        comp_median["sales_nav"] = round(vc_row[0], 1)

    queue_q = text("""
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY active_jobs) AS med_active,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY queued_jobs) AS med_queued,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY waiting_room_jobs) AS med_waiting,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vayne_queued) AS med_vayne,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY catchall_queued) AS med_catchall
        FROM queue_depth_snapshots
    """)
    qd_row = db.execute(queue_q).fetchone()
    queue_median = {}
    if qd_row and qd_row[0] is not None:
        queue_median = {
            "active": round(qd_row[0], 0),
            "queued": round(qd_row[1] or 0, 0),
            "waiting_room": round(qd_row[2] or 0, 0),
            "vayne_queued": round(qd_row[3] or 0, 0),
            "catchall_queued": round(qd_row[4] or 0, 0),
        }

    cache_hit_q = text("""
        SELECT SUM(cache_hits)::float / NULLIF(SUM(cache_lookups), 0) * 100
        FROM jobs
        WHERE status = 'completed'
          AND job_type = 'enrichment'
          AND cache_lookups > 0
          AND (:cid IS NULL OR user_id = CAST(:cid AS UUID))
    """)
    chr_row = db.execute(cache_hit_q, {"cid": client_id}).fetchone()
    cache_hit_median = round(chr_row[0], 1) if chr_row and chr_row[0] else 0

    result = {
        "hit_rate": hit_median,
        "turnaround": turn_median,
        "completion_rate": comp_median,
        "queue_depth": queue_median,
        "cache_hit_rate": cache_hit_median,
    }

    redis_cache.setex(cache_key, MEDIAN_CACHE_TTL, json.dumps(result))
    return result


@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    start_date: str = Query(..., description="ISO date string YYYY-MM-DD"),
    end_date: str = Query(..., description="ISO date string YYYY-MM-DD"),
    client_id: Optional[str] = Query(None, description="UUID of a specific client, or omit for all"),
):
    """
    Consolidated analytics endpoint for the admin dashboard.
    Returns time-series data for 4 graphs + historical medians.
    Cached per filter combo for 1 hour. Queue depth snapshot saved on each cache miss.
    """
    cid = client_id if client_id and client_id != "all" else None
    cache_key = f"analytics_cache:{cid or 'all'}:{start_date}:{end_date}"

    cached = redis_cache.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    hit_rate_series = _compute_hit_rate(db, start, end, cid)
    turnaround_series = _compute_turnaround(db, start, end, cid)
    completion_series = _compute_completion_rate(db, start, end, cid)
    cache_hit_rate_series = _compute_cache_hit_rate(db, start, end, cid)

    queue_current = _get_queue_depth_current(db)
    _save_queue_snapshot(db, queue_current)

    queue_hist_q = text("""
        SELECT snapshot_at, active_jobs, queued_jobs, waiting_room_jobs,
               vayne_queued, catchall_queued
        FROM queue_depth_snapshots
        WHERE snapshot_at >= :start AND snapshot_at <= :end
        ORDER BY snapshot_at
    """)
    queue_rows = db.execute(queue_hist_q, {"start": start, "end": end}).fetchall()
    queue_series = [
        {
            "snapshot_at": r[0].isoformat() if r[0] else "",
            "active": r[1],
            "queued": r[2],
            "waiting_room": r[3],
            "vayne_queued": r[4],
            "catchall_queued": r[5],
        }
        for r in queue_rows
    ]

    medians = _compute_historical_medians(db, cid)

    now = datetime.now(GMT_PLUS_2)
    result = {
        "cached_at": now.isoformat(),
        "cache_ttl_seconds": ANALYTICS_CACHE_TTL,
        "filters": {
            "start_date": start_date,
            "end_date": end_date,
            "client_id": cid or "all",
        },
        "hit_rate": {
            "series": hit_rate_series,
            "historical_median": medians.get("hit_rate", {}),
        },
        "turnaround": {
            "series": turnaround_series,
            "historical_median": medians.get("turnaround", {}),
        },
        "queue_depth": {
            "current": queue_current,
            "series": queue_series,
            "historical_median": medians.get("queue_depth", {}),
        },
        "completion_rate": {
            "series": completion_series,
            "historical_median": medians.get("completion_rate", {}),
        },
        "cache_hit_rate": {
            "series": cache_hit_rate_series,
            "historical_median": medians.get("cache_hit_rate", 0),
        },
    }

    redis_cache.setex(cache_key, ANALYTICS_CACHE_TTL, json.dumps(result))
    return result

