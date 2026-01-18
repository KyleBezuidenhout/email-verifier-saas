from fastapi import FastAPI
from pydantic import BaseModel
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

app = FastAPI()


class CrawlRequest(BaseModel):
    url: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/crawl")
async def crawl(req: CrawlRequest):
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url=req.url,
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

