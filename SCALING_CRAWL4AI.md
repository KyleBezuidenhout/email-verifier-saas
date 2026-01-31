# Scaling Crawl4AI for Higher Throughput

## Current Architecture

```
Redis Queue ──▶ Worker ──▶ Crawl4AI Service ──▶ Websites
                           (20 concurrent)
```

**Current throughput:** ~200-400 URLs/minute with single instance

---

## Why Scale Horizontally?

The bottleneck is **browser context limits** in Crawl4AI. Each instance can only handle ~20 concurrent browser tabs reliably. To process more URLs simultaneously, we need multiple Crawl4AI instances.

**Target:** 2x or 3x throughput by running parallel Crawl4AI services.

---

## Scaling Strategy: Worker-per-Crawl4AI

The cleanest approach is to pair each Crawl4AI instance with its own worker:

```
                         ┌──────────────┐     ┌──────────────┐
                    ┌───▶│   Worker 1   │────▶│  Crawl4AI 1  │
┌──────────────┐    │    │              │     │  (20 conc.)  │
│ Redis Queue  │────┤    └──────────────┘     └──────────────┘
│              │    │
│ (shared)     │    │    ┌──────────────┐     ┌──────────────┐
└──────────────┘    └───▶│   Worker 2   │────▶│  Crawl4AI 2  │
                         │              │     │  (20 conc.)  │
                         └──────────────┘     └──────────────┘
```

**How it works:**
- Both workers read from the SAME Redis queue (`website-scraper-queue`)
- Redis `BRPOP` naturally distributes jobs - whichever worker is free gets the next job
- Each worker talks to its own dedicated Crawl4AI instance
- No code changes needed for load balancing

---

## Step-by-Step Implementation

### Step 1: Duplicate Crawl4AI Service on Railway

1. Go to your Railway project
2. Click on your existing `crawl4ai` service
3. Click the three dots menu → **Duplicate Service**
4. Rename the new service to `crawl4ai-2`
5. Verify environment variables are copied:
   ```
   PORT=11235
   MAX_CONCURRENT_TASKS=20
   MEMORY_THRESHOLD_PERCENT=75
   CRAWL4AI_API_TOKEN=<your-token>
   ```
6. Deploy the service
7. Note the internal URL: `http://crawl4ai-2.railway.internal:11235`

### Step 2: Duplicate Worker Service on Railway

1. Go to your existing `website-scraper-worker` service
2. Click the three dots menu → **Duplicate Service**
3. Rename to `website-scraper-worker-2`
4. **CRITICAL:** Update the `CRAWL4AI_URL` environment variable:
   ```
   CRAWL4AI_URL=http://crawl4ai-2.railway.internal:11235
   ```
   (Point to the NEW Crawl4AI instance, not the original)
5. All other environment variables (DATABASE_URL, REDIS_URL, R2 credentials) stay the same
6. Deploy the service

### Step 3: Verify Setup

1. Check both workers are running in Railway logs
2. Both should show:
   ```
   🚀 Website Scraper worker starting...
   📋 Listening to queue: website-scraper-queue
   🌐 Crawl4AI URL: http://crawl4ai-X.railway.internal:11235
   ```
3. Submit a test job - one of the workers should pick it up
4. Submit two jobs simultaneously - each worker should pick up one

---

## Configuration Reference

### Worker 1 (Original)
| Variable | Value |
|----------|-------|
| `CRAWL4AI_URL` | `http://crawl4ai.railway.internal:11235` |
| `REDIS_URL` | (shared - same as original) |
| `DATABASE_URL` | (shared - same as original) |

### Worker 2 (New)
| Variable | Value |
|----------|-------|
| `CRAWL4AI_URL` | `http://crawl4ai-2.railway.internal:11235` |
| `REDIS_URL` | (shared - same as original) |
| `DATABASE_URL` | (shared - same as original) |

### Crawl4AI 1 & 2 (Both)
| Variable | Value |
|----------|-------|
| `PORT` | `11235` |
| `MAX_CONCURRENT_TASKS` | `20` |
| `MEMORY_THRESHOLD_PERCENT` | `75` |

---

## Expected Results

| Setup | Concurrent Crawls | Throughput |
|-------|-------------------|------------|
| 1 Worker + 1 Crawl4AI | 20 | ~200-400 URLs/min |
| 2 Workers + 2 Crawl4AI | 40 | ~400-800 URLs/min |
| 3 Workers + 3 Crawl4AI | 60 | ~600-1200 URLs/min |

---

## Important Notes

1. **Same Queue:** Both workers MUST use the same Redis queue name (`website-scraper-queue`). This is already hardcoded in the worker.

2. **Job Distribution:** Redis handles this automatically. When Worker 1 is busy processing a job, Worker 2 will pick up the next queued job.

3. **No Database Conflicts:** Each job has a unique ID. Workers update different job records, so there are no conflicts.

4. **Scaling Further:** To add a third instance, repeat Steps 1-2 with `crawl4ai-3` and `website-scraper-worker-3`.

5. **Cost:** Each Crawl4AI instance uses ~4-8GB RAM when active. Budget accordingly on Railway.

---

## Troubleshooting

### Both workers picking same job
This shouldn't happen - Redis `BRPOP` is atomic. If it does, check that both workers are using the exact same `REDIS_URL`.

### One worker idle while other is overloaded
Jobs are distributed per-job, not per-batch. If you have one large job (3000 URLs), one worker handles the entire job. For better distribution, consider splitting large uploads into multiple smaller jobs at the API level.

### Crawl4AI instance unhealthy
The worker has built-in health monitoring. If a Crawl4AI instance is failing, the worker will pause and retry. Check Railway logs for the specific Crawl4AI service.
