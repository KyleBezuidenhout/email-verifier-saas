# Vayne Order Processing Worker

Background worker that processes Sales Navigator scraping orders from Redis queue.

## Overview

This worker implements the end-to-end workflow for Sales Navigator scraping (Steps 4-7 from `test_end_to_end_scraping_workflow.py`):

1. **Step 4**: Polls Vayne API for order status updates every 10 seconds until scraping finishes
2. **Step 5**: Checks if exports are available when scraping completes
3. **Step 6**: Triggers export and extracts both simple and advanced formats (prioritizes simple)
4. **Step 7**: Downloads CSV from Vayne and stores it in Cloudflare R2

## Features

- Listens to Redis queue `vayne-order-processing` for new orders
- Polls Vayne API every 10 seconds (configurable via `VAYNE_WORKER_POLL_INTERVAL`)
- Maximum wait time: 30 minutes per order (configurable via `VAYNE_WORKER_MAX_WAIT_MINUTES`)
- Automatic export handling when scraping finishes
- CSV storage in Cloudflare R2
- Database status updates
- Retry logic with exponential backoff
- Concurrent order processing

## Setup

### 1. Install Dependencies

The worker uses the same dependencies as the backend. Ensure you have:

```bash
cd email-verifier-saas/backend
pip install -r requirements.txt
```

Required packages:
- `redis` - Redis client
- `httpx` - Async HTTP client
- `sqlalchemy` - Database ORM
- `psycopg2-binary` - PostgreSQL driver
- `boto3` - AWS SDK (for Cloudflare R2)

### 2. Environment Variables

The worker uses the same environment variables as the backend. Ensure these are set:

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `VAYNE_API_KEY` - Vayne API key
- `CLOUDFLARE_R2_ACCESS_KEY_ID` - R2 access key
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` - R2 secret key
- `CLOUDFLARE_R2_BUCKET_NAME` - R2 bucket name
- `CLOUDFLARE_R2_ENDPOINT_URL` - R2 endpoint URL

**Optional (with defaults):**
- `VAYNE_WORKER_POLL_INTERVAL` - Poll interval in seconds (default: 10)
- `VAYNE_WORKER_MAX_RETRIES` - Max retries for failed operations (default: 3)
- `VAYNE_WORKER_BACKOFF_FACTOR` - Exponential backoff multiplier (default: 2.0)
- `VAYNE_WORKER_MAX_WAIT_MINUTES` - Maximum wait time per order (default: 30)

### 3. Create `.env` File

Copy from `.env.example` and fill in the required values:

```bash
cp .env.example .env
```

## Running

### Development

```bash
cd email-verifier-saas/workers
python3 vayne_worker.py
```

### Production

#### Option 1: PM2 (Recommended)

```bash
pm2 start vayne_worker.py --name vayne-worker --interpreter python3
pm2 save
pm2 startup  # Follow instructions to enable on system boot
```

#### Option 2: Systemd Service

Create `/etc/systemd/system/vayne-worker.service`:

```ini
[Unit]
Description=Vayne Order Processing Worker
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/email-verifier-saas/workers
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python3 vayne_worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable vayne-worker
sudo systemctl start vayne-worker
sudo systemctl status vayne-worker
```

#### Option 3: Railway/Docker

Add the worker as a separate service in your Railway project or Docker Compose:

```yaml
# docker-compose.yml
services:
  vayne-worker:
    build: ./email-verifier-saas/backend
    command: python3 /app/workers/vayne_worker.py
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - VAYNE_API_KEY=${VAYNE_API_KEY}
      # ... other env vars
    volumes:
      - ./email-verifier-saas:/app
```

## How It Works

### Queue Structure

Orders are queued to Redis list `vayne-order-processing`:

```python
redis_client.lpush("vayne-order-processing", str(order_id))
```

The worker uses `brpop` (blocking right pop) to wait for new orders:

```python
order_id = redis_client.brpop("vayne-order-processing", timeout=5)
```

### Processing Flow

1. **Order Queued**: API endpoint creates order and queues it to Redis
2. **Worker Picks Up**: Worker pops order ID from queue
3. **Status Polling**: Worker polls Vayne API every 10 seconds
4. **Progress Updates**: Database updated with progress, status, leads_found
5. **Export Trigger**: When `scraping_status == "finished"`, worker triggers export
6. **CSV Download**: Worker downloads CSV using `_extract_exports_info()` (prioritizes simple format)
7. **R2 Storage**: CSV stored in R2 at `vayne-orders/{order_id}/export.csv`
8. **Completion**: Order marked as "completed" with `csv_file_path` set

### Export Format Priority

The worker uses `_extract_exports_info()` from `vayne_client.py` which:
- Extracts both `simple` and `advanced` export formats from Vayne's response
- Prioritizes `simple` format if available (status="completed" and file_url exists)
- Falls back to `advanced` format if simple not available

## Error Handling

- **Network Errors**: Retried with exponential backoff (up to `VAYNE_WORKER_MAX_RETRIES`)
- **Failed Orders**: Marked as "failed" in database
- **Export Failures**: Retried before marking as failed
- **Queue Failures**: Logged but don't crash worker (continues processing)

## Monitoring

### Logs

The worker logs all operations with timestamps and status indicators:

- `✅` - Success
- `❌` - Error
- `⏳` - Waiting/Processing
- `ℹ️` - Info

Example:
```
[2025-01-15 10:30:45] ℹ️ Processing order abc-123 (Vayne ID: 456)
[2025-01-15 10:30:55] ℹ️ Order abc-123: status=scraping, progress=45%, leads=123, elapsed=10s
[2025-01-15 10:31:25] ✅ Order abc-123 scraping finished, proceeding to export
[2025-01-15 10:31:30] ✅ Stored CSV for order abc-123 in R2: vayne-orders/abc-123/export.csv
[2025-01-15 10:31:30] ✅ Order abc-123 processing completed successfully
```

### Database Status

Monitor order status in the `vayne_orders` table:

```sql
SELECT id, status, progress_percentage, leads_found, csv_file_path, created_at, completed_at
FROM vayne_orders
ORDER BY created_at DESC;
```

### Redis Queue

Check queue length:

```bash
redis-cli LLEN vayne-order-processing
```

## Troubleshooting

### Worker Not Processing Orders

1. Check if worker is running: `pm2 list` or `systemctl status vayne-worker`
2. Check Redis connection: `redis-cli ping`
3. Check database connection: Verify `DATABASE_URL` is correct
4. Check logs for errors

### Orders Stuck in "pending" or "processing"

1. Verify worker is running
2. Check if order is in queue: `redis-cli LRANGE vayne-order-processing 0 -1`
3. Check Vayne API key: Verify `VAYNE_API_KEY` is set correctly
4. Check order has `vayne_order_id`: Worker skips orders without Vayne ID

### Export Failures

1. Check Vayne API status
2. Verify R2 credentials are correct
3. Check worker logs for specific error messages
4. Verify order reached "finished" status in Vayne

### High Memory Usage

- Worker processes orders sequentially by default
- For high volume, consider running multiple worker instances
- Monitor Redis queue length to scale workers

## Scaling

### Multiple Workers

You can run multiple worker instances for higher throughput:

```bash
pm2 start vayne_worker.py --name vayne-worker-1 --interpreter python3
pm2 start vayne_worker.py --name vayne-worker-2 --interpreter python3
pm2 start vayne_worker.py --name vayne-worker-3 --interpreter python3
```

Each worker will process orders from the same queue.

### Resource Requirements

- **CPU**: Low (mostly I/O bound)
- **Memory**: ~100-200MB per worker
- **Network**: Depends on order volume and CSV sizes

## Integration with API

The worker complements the API endpoints:

- **API creates orders** → Queues to Redis → **Worker processes**
- **Webhook updates** → Real-time status updates (complements worker polling)
- **Worker updates** → Database status updates → **API serves to frontend**

Both webhook and worker can update orders - webhook provides real-time updates, worker ensures completion even if webhook fails.

## Configuration Reference

All configuration is via environment variables (see Setup section):

| Variable | Default | Description |
|----------|---------|-------------|
| `VAYNE_WORKER_POLL_INTERVAL` | 10 | Seconds between status polls |
| `VAYNE_WORKER_MAX_RETRIES` | 3 | Max retries for failed operations |
| `VAYNE_WORKER_BACKOFF_FACTOR` | 2.0 | Exponential backoff multiplier |
| `VAYNE_WORKER_MAX_WAIT_MINUTES` | 30 | Maximum wait time per order |

## Support

For issues or questions:
1. Check worker logs
2. Verify environment variables
3. Check Redis and database connectivity
4. Review Vayne API status
