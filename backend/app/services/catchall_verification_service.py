"""
Catchall Verification Service — manages the full OmniVerifier batch workflow.

Processes emails in chunks with controlled concurrency:
  1. Split email list into chunks (up to 1000 per OmniVerifier list)
  2. Run up to CONCURRENCY_LIMIT chunks in parallel
  3. Each chunk: create list -> add emails -> start -> poll -> get results
  4. Aggregate results and update DB leads + job counters
"""

import asyncio
import time
from typing import List, Dict, Optional, Callable
from app.services.omniverifier_client import OmniVerifierClient

CHUNK_SIZE = 1000
CONCURRENCY_LIMIT = 5
POLL_INTERVAL = 10
MAX_POLL_TIME = 300


class JobCancelled(Exception):
    pass


async def _process_chunk(
    verifier: OmniVerifierClient,
    emails: List[str],
    chunk_index: int,
    title_prefix: str,
    on_progress: Optional[Callable] = None,
) -> Dict:
    """Process a single chunk through the full OmniVerifier catchall flow."""
    tag = f"[chunk {chunk_index}]"
    result = {
        "chunk_index": chunk_index,
        "total": len(emails),
        "results": [],
        "errors": [],
    }

    try:
        create_resp = await verifier.create_catchall_list(
            emails_count=len(emails),
            title=f"{title_prefix} chunk {chunk_index}",
        )
        list_id = str(create_resp.get("id") or create_resp.get("listId"))
        if not list_id or list_id == "None":
            result["errors"].append(f"{tag} No list ID returned")
            return result

        await verifier.add_emails_to_list(list_id, emails)
        await verifier.start_list(list_id)

        start_time = time.time()
        completed = False
        while time.time() - start_time < MAX_POLL_TIME:
            status_resp = await verifier.get_list_status(list_id)
            s = status_resp.get("status", "").lower()
            if s == "completed":
                completed = True
                break
            elif s == "failed":
                result["errors"].append(f"{tag} OmniVerifier processing failed")
                return result
            await asyncio.sleep(POLL_INTERVAL)

        if not completed:
            result["errors"].append(f"{tag} Timed out after {MAX_POLL_TIME}s")
            return result

        raw_results = await verifier.get_list_results(list_id)
        result["results"] = raw_results
        if on_progress:
            on_progress(len(emails))

    except Exception as e:
        result["errors"].append(f"{tag} {str(e)}")

    return result


async def verify_catchall_emails(
    emails: List[str],
    title_prefix: str = "Catchall Verification",
    on_chunk_complete: Optional[Callable] = None,
    is_cancelled: Optional[Callable] = None,
) -> Dict:
    """
    Verify a list of catchall emails via OmniVerifier.

    Args:
        emails: List of email addresses to verify
        title_prefix: Prefix for OmniVerifier list titles
        on_chunk_complete: Callback(processed_count) called after each chunk completes

    Returns:
        {
            "email_results": {email: {"result": 1|2, "provider": str}},
            "total_processed": int,
            "valid_count": int,
            "risky_count": int,
            "errors": [str],
        }
    """
    if not emails:
        return {"email_results": {}, "total_processed": 0, "valid_count": 0, "risky_count": 0, "errors": []}

    chunks = [emails[i:i + CHUNK_SIZE] for i in range(0, len(emails), CHUNK_SIZE)]

    verifier = OmniVerifierClient()
    all_errors: List[str] = []
    email_results: Dict[str, Dict] = {}
    processed_so_far = 0

    def _progress(count: int):
        nonlocal processed_so_far
        processed_so_far += count
        if on_chunk_complete:
            on_chunk_complete(processed_so_far)

    try:
        credits_resp = await verifier.get_credits()
        balance = credits_resp.get("credits", {}).get("catchall", 0)
        if balance < len(emails):
            return {
                "email_results": {},
                "total_processed": 0,
                "valid_count": 0,
                "risky_count": 0,
                "errors": [f"Insufficient OmniVerifier credits: {balance} available, {len(emails)} needed"],
            }

        semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

        async def _run_with_semaphore(chunk_emails, idx):
            if is_cancelled and is_cancelled():
                raise JobCancelled()
            async with semaphore:
                return await _process_chunk(verifier, chunk_emails, idx, title_prefix, _progress)

        tasks = [_run_with_semaphore(chunk, i) for i, chunk in enumerate(chunks)]
        chunk_results = await asyncio.gather(*tasks)

        for cr in chunk_results:
            all_errors.extend(cr.get("errors", []))
            for r in cr.get("results", []):
                email = r.get("email", "").lower()
                if email:
                    email_results[email] = r

    finally:
        await verifier.close()

    valid_count = sum(1 for r in email_results.values() if r.get("result") == 1)
    risky_count = sum(1 for r in email_results.values() if r.get("result") == 2)

    return {
        "email_results": email_results,
        "total_processed": len(email_results),
        "valid_count": valid_count,
        "risky_count": risky_count,
        "errors": all_errors,
    }
