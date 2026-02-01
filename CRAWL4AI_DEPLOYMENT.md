# Crawl4AI Deployment Guide for Railway

This guide explains how to deploy Crawl4AI on Railway for the Website Contact Scraper feature.

## Overview

The Website Contact Scraper uses Crawl4AI to crawl websites and extract markdown content. The extraction of emails and phone numbers is then done by your backend worker.

## Option 1: Deploy Official Crawl4AI Docker Image (Recommended)

### Step 1: Create New Railway Service

1. Go to your Railway project
2. Click "New Service" → "Docker Image"
3. Enter the image: `unclecode/crawl4ai:latest`

### Step 2: Configure Environment Variables

Set the following environment variables in Railway:

```
PORT=8000
MAX_CONCURRENT_TASKS=8
MEMORY_THRESHOLD_PERCENT=70
```

### Step 3: Configure Resources

Recommended settings for production:
- **Memory**: 2GB minimum (4GB recommended for high volume)
- **CPU**: 1 vCPU minimum

### Step 4: Note Your Service URL

After deployment, Railway will provide a URL like:
```
https://crawl4ai-production-xxxx.up.railway.app
```

### Step 5: Configure Your Backend

Add the Crawl4AI URL to your backend's environment variables:

```
CRAWL4AI_URL=https://crawl4ai-production-xxxx.up.railway.app
```

## Option 2: Deploy Custom Crawl4AI Service

If you need more control, you can deploy the custom service in the `crawl4ai-service/` directory.

### Step 1: Create New Railway Service

1. Go to your Railway project
2. Click "New Service" → "GitHub Repo"
3. Select your repository
4. Set the root directory to `crawl4ai-service`

### Step 2: Railway will auto-detect the Dockerfile

The service includes:
- `Dockerfile` - Builds Python 3.11 with Playwright/Chromium
- `main.py` - FastAPI server with `/crawl` endpoint
- `requirements.txt` - Dependencies

### Step 3: Configure Environment

```
PORT=8000
```

## API Endpoints

Once deployed, your Crawl4AI service exposes:

### Health Check
```
GET /health
Response: { "status": "ok" }
```

### Crawl URL
```
POST /crawl
Body: { "url": "https://example.com" }
Response: {
  "success": true,
  "url": "https://example.com",
  "markdown": "...",
  "error_message": null
}
```

## Testing the Deployment

Test your deployment with curl:

```bash
# Health check
curl https://your-crawl4ai-url.up.railway.app/health

# Test crawl
curl -X POST https://your-crawl4ai-url.up.railway.app/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Running the Worker

After deploying Crawl4AI, start the website scraper worker:

```bash
cd workers
python website_scraper_worker.py
```

Or add it to your worker Dockerfile/process.

## Troubleshooting

### Common Issues

1. **Out of Memory**: Increase Railway memory allocation or reduce `MAX_CONCURRENT_TASKS` (recommended: 8)

2. **Timeouts**: The worker has a 30-second timeout per URL (`page_timeout`). Sites that take longer will be marked as errors. Batch timeout is 3 minutes.

3. **Service Disconnected**: Check Railway logs and ensure the service is running. The health endpoint should return `{"status": "ok"}`.

4. **No Results**: Some websites block crawlers or use JavaScript-heavy rendering. The crawler uses headless Chromium but may not extract content from all sites.

## Performance Tips

1. **Batch Processing**: The worker processes URLs in batches of 8 for efficiency and to prevent browser pool exhaustion.

2. **Rate Limiting**: Crawl4AI has built-in rate limiting. If browser pool gets exhausted, reduce `MAX_CONCURRENT_TASKS` to 8 or lower.

3. **Caching**: Crawl4AI can cache results. For fresh data, the worker uses `BYPASS` cache mode.

## Cost Estimation

Railway charges based on usage:
- Crawl4AI with 2GB RAM running 24/7: ~$10-20/month
- Scale up/down based on your volume

## Security Notes

1. The Crawl4AI service should be internal-only (not exposed publicly) if possible
2. Consider adding authentication if exposing publicly
3. Monitor for abuse and implement rate limiting at the API level
