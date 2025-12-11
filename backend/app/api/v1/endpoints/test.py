from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import asyncio

from app.services.permutation import generate_email_permutations, normalize_domain
from app.services.mailtester_client import MailTesterClient
from app.services.deduplication import deduplicate_leads

router = APIRouter()

class TestEmailRequest(BaseModel):
    name: str
    company_website: str

class TestEmailResponse(BaseModel):
    name: str
    company: str
    email: str
    status: str  # valid, invalid, catchall, pending

@router.post("/test-email", response_model=TestEmailResponse)
async def test_email(request: TestEmailRequest):
    """
    Test email enrichment for a single person.
    Generates permutations, verifies them, and returns only the best result.
    Public endpoint - no authentication required.
    """
    if not request.name or not request.company_website:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name and company website are required"
        )
    
    # Parse name into first and last name
    name_parts = request.name.strip().split(maxsplit=1)
    if len(name_parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide both first and last name (e.g., 'John Doe')"
        )
    
    first_name = name_parts[0]
    last_name = name_parts[1]
    domain = normalize_domain(request.company_website)
    
    # Generate email permutations (hidden from user)
    permutations = generate_email_permutations(first_name, last_name, domain, None)
    
    if not permutations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate email permutations"
        )
    
    # Verify all permutations (with rate limiting)
    mailtester = MailTesterClient()
    verified_leads = []
    
    try:
        # Verify permutations in batches to respect rate limits
        # MailTester allows 170 requests per 30 seconds
        # We'll verify with small delays between requests
        for i, perm in enumerate(permutations):
            result = await mailtester.verify_email(perm['email'])
            
            lead_data = {
                "first_name": first_name,
                "last_name": last_name,
                "domain": domain,
                "email": perm['email'],
                "pattern_used": perm['pattern'],
                "prevalence_score": perm['prevalence_score'],
                "verification_status": result['status'],
            }
            verified_leads.append(lead_data)
            
            # Rate limit: 170 per 30 seconds = ~176ms between requests
            # Add small delay to be safe (200ms = 5 requests/second max)
            if i < len(permutations) - 1:  # Don't delay after last request
                await asyncio.sleep(0.2)
        
        # Deduplicate to get the best result
        deduplicated = deduplicate_leads(verified_leads)
        
        if not deduplicated:
            return TestEmailResponse(
                name=request.name,
                company=domain,
                email="",
                status="not_found"
            )
        
        # Get the best result (first one after deduplication)
        best_result = deduplicated[0]
        
        return TestEmailResponse(
            name=request.name,
            company=domain,
            email=best_result.get('email', ''),
            status=best_result.get('verification_status', 'invalid')
        )
    
    except Exception as e:
        print(f"Error in test-email endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verifying email: {str(e)}"
        )
    finally:
        await mailtester.close()

