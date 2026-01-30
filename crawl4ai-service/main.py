from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError, field_validator
from typing import Optional
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
import logging
import json
import sys

# Configure logging to stdout/stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.StreamHandler(sys.stderr)
    ],
    force=True
)

app = FastAPI()
logger = logging.getLogger(__name__)


class CrawlRequest(BaseModel):
    url: Optional[str] = None
    
    @field_validator('url', mode='before')
    @classmethod
    def validate_url(cls, v):
        """Convert None to empty string, then validate"""
        if v is None:
            return ""
        if isinstance(v, str):
            return v.strip()
        return str(v).strip() if v else ""


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log validation errors for debugging"""
    errors = exc.errors()
    body = None
    try:
        body_bytes = await request.body()
        body = body_bytes.decode('utf-8') if body_bytes else None
        if body:
            try:
                body = json.loads(body)
            except:
                pass
    except Exception as e:
        error_msg = f"Failed to read request body: {e}"
        print(error_msg, flush=True)
        logger.error(error_msg)
    
    error_header = "========== VALIDATION ERROR =========="
    print(error_header, flush=True)
    logger.error(error_header)
    
    errors_json = json.dumps(errors, indent=2)
    print(f"Validation errors: {errors_json}", flush=True)
    logger.error(f"Validation errors: {errors_json}")
    
    print(f"Request body: {body}", flush=True)
    logger.error(f"Request body: {body}")
    
    print(f"Request URL: {request.url}", flush=True)
    logger.error(f"Request URL: {request.url}")
    
    error_footer = "======================================"
    print(error_footer, flush=True)
    logger.error(error_footer)
    
    return JSONResponse(
        status_code=422,
        content={"detail": errors, "body": body}
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/crawl")
async def crawl(req: CrawlRequest):
    # Log the received URL for debugging
    url_received = req.url if req.url else ""
    logger.info(f"Received crawl request for URL: '{url_received}' (length: {len(url_received)}, type: {type(url_received)})")
    logger.info(f"URL repr: {repr(url_received)}")
    
    # Validate URL is not empty
    if not url_received or not url_received.strip():
        logger.error(f"Empty URL received (value: {repr(url_received)})")
        raise HTTPException(status_code=422, detail="URL cannot be empty")
    
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url=url_received,
            config=CrawlerRunConfig(cache_mode=CacheMode.BYPASS),
        )

    markdown = None
    if result.success and result.markdown is not None:
        # Prefer raw_markdown; fall back defensively if attribute missing
        markdown = getattr(result.markdown, "raw_markdown", None)

    return {
        "success": result.success,
        "url": result.url,
        "markdown": markdown,
        "error_message": result.error_message,
    }

