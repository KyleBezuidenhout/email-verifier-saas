# Dedicated Client Onboarding Checklist

This document outlines the step-by-step process for onboarding a new client to their dedicated verification worker setup.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (FastAPI)                               │
│                                                                             │
│   Job creation → Looks up worker_configs → Routes to correct queue         │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   REDIS                                      │
│                                                                             │
│   SHARED QUEUE:                     DEDICATED QUEUES:                       │
│   enrichment-job-creation           verification-queue:client-{id}          │
│                                                                             │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ SHARED ENRICHMENT   │   │ DEDICATED WORKER    │   │ DEDICATED WORKER    │
│ WORKER (1 total)    │   │ Client A            │   │ Client B            │
│                     │   │                     │   │                     │
│ Routes to client-   │   │ API Keys: A1, A2    │   │ API Keys: B1        │
│ specific queues     │   │ Queue: :client-a    │   │ Queue: :client-b    │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

**Key Points:**
- One shared enrichment worker handles CSV processing for ALL clients
- Each dedicated client gets their own verification worker
- Routing is controlled via the `worker_configs` database table
- No code changes required per client - only configuration

---

## Prerequisites (One-Time Setup)

Before onboarding any clients, ensure these are deployed:

- [ ] Database migration run: `python backend/migrate_add_worker_configs.py`
- [ ] Backend updated with queue routing logic
- [ ] Enrichment worker updated with dynamic queue routing
- [ ] Verification worker supports `WORKER_MODE=dedicated`

---

## Per-Client Onboarding Steps

### Step 1: Collect Client Information

| Information | Description | Example |
|-------------|-------------|---------|
| Client User UUID | From `users` table in PostgreSQL | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| Client Email | For identification | `client@example.com` |
| MailTester API Key(s) | Client's own API keys | `mt_abc123xyz789` |
| Key Spacings (ms) | Rate limit per key | `250` (standard) or `125` (upgraded) |
| Daily Limits | Per-key daily limit | `500000` |
| Requests per 30s | Per-key rate limit | `165` |

**How to get User UUID:**
```sql
SELECT id, email FROM users WHERE email = 'client@example.com';
```

---

### Step 2: Configure Database (No Restart Required)

Add the client's worker configuration to the database:

```sql
INSERT INTO worker_configs (
    user_id,
    worker_mode,
    verification_queue,
    api_key_hint,
    notes,
    is_active
) VALUES (
    'CLIENT_UUID_HERE',
    'dedicated',
    'verification-queue:CLIENT_ID_HERE',
    'LAST_4_CHARS_OF_API_KEY',
    'Client name - setup date',
    true
);
```

**Example:**
```sql
INSERT INTO worker_configs (
    user_id,
    worker_mode,
    verification_queue,
    api_key_hint,
    notes,
    is_active
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'dedicated',
    'verification-queue:client-acme',
    'x789',
    'ACME Corp - Onboarded 2024-01-15',
    true
);
```

**Verify the configuration:**
```sql
SELECT * FROM worker_configs WHERE user_id = 'CLIENT_UUID_HERE';
```

---

### Step 3: Create Railway Service

1. **Go to Railway Dashboard**
   - Navigate to your project
   - Click "New Service"

2. **Select Source**
   - Choose "GitHub Repo"
   - Select your workers repository
   - Set root directory to `/workers`

3. **Configure Service**
   - **Service Name:** `worker-verification-{client-name}`
   - Example: `worker-verification-acme`

4. **Add Environment Variables**

| Variable | Value | Description |
|----------|-------|-------------|
| `WORKER_MODE` | `dedicated` | Enables dedicated mode |
| `DEDICATED_CLIENT_ID` | `{client-uuid}` | Client's user UUID |
| `VERIFICATION_QUEUE` | `verification-queue:{client-id}` | Must match database config |
| `MAILTESTER_API_KEYS` | `{key1},{key2}` | Client's API keys (comma-separated) |
| `MAILTESTER_KEY_SPACINGS` | `250,250` | Spacing per key in ms |
| `MAILTESTER_KEY_DAILY_LIMITS` | `500000,500000` | Daily limit per key |
| `MAILTESTER_KEY_REQUESTS_PER_30S` | `165,165` | Rate limit per key |
| `DATABASE_URL` | `{shared-db-url}` | Same as other workers |
| `REDIS_URL` | `{shared-redis-url}` | Same as other workers |

**Example Environment Variables:**
```bash
WORKER_MODE=dedicated
DEDICATED_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
VERIFICATION_QUEUE=verification-queue:client-acme
MAILTESTER_API_KEYS=mt_abc123xyz789,mt_def456uvw012
MAILTESTER_KEY_SPACINGS=250,250
MAILTESTER_KEY_DAILY_LIMITS=500000,500000
MAILTESTER_KEY_REQUESTS_PER_30S=165,165
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://user:pass@host:6379
```

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete

---

### Step 4: Verify Setup

1. **Check Worker Logs**
   - Look for startup message:
   ```
   🔒 DEDICATED WORKER MODE
      Client ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
      Queue: verification-queue:client-acme
   ```

2. **Verify Queue Polling**
   - Look for:
   ```
   🚀 Starting queue poller for: verification-queue:client-acme
   🔒 Dedicated mode - processing only jobs from this queue
   ```

3. **Test Job Routing**
   - Have the client create a test job (enrichment or verification)
   - Check that job appears in their dedicated queue
   - Verify the dedicated worker picks it up

4. **Monitor Processing**
   - Confirm no 429 rate limit errors
   - Verify emails are being verified successfully

---

### Step 5: Client Communication

Send the client confirmation:

```
Subject: Your Dedicated Email Verification Setup is Ready

Hi [Client Name],

Your dedicated email verification infrastructure is now live!

What this means for you:
- Your jobs are processed by a dedicated worker
- You have isolated capacity with your own API keys
- No sharing with other users - guaranteed throughput

Your setup:
- API Keys configured: [X] keys
- Daily capacity: [X] verifications/day
- Speed: [X] verifications/second

You can start using the platform immediately. All new jobs will 
automatically route to your dedicated worker.

Let us know if you have any questions!
```

---

## Troubleshooting

### Job Not Routing to Dedicated Queue

1. **Check worker_configs table:**
   ```sql
   SELECT * FROM worker_configs WHERE user_id = 'CLIENT_UUID';
   ```
   - Ensure `is_active = true`
   - Verify `verification_queue` matches worker's env var

2. **Check backend logs:**
   - Look for queue routing messages when job is created
   - Should show dedicated queue name

### Worker Not Picking Up Jobs

1. **Check Redis queue:**
   ```bash
   redis-cli LLEN "verification-queue:client-acme"
   ```
   - If jobs are stuck, check worker logs

2. **Verify environment variables:**
   - `VERIFICATION_QUEUE` must exactly match `worker_configs.verification_queue`

### Rate Limit Errors (429)

1. **Check API key configuration:**
   - Verify `MAILTESTER_KEY_SPACINGS` is correct for each key
   - Upgraded keys should have lower spacing (e.g., 125ms)

2. **Check key health:**
   - Worker logs show key health status
   - Keys auto-recover after 5 minutes if marked unhealthy

---

## Rollback Procedure

If issues occur, you can quickly route the client back to shared workers:

```sql
-- Disable dedicated config (routes to shared queue)
UPDATE worker_configs 
SET is_active = false 
WHERE user_id = 'CLIENT_UUID';

-- Or delete the config entirely
DELETE FROM worker_configs WHERE user_id = 'CLIENT_UUID';
```

The client's jobs will immediately start routing to the shared queue.
The dedicated worker can be stopped without data loss.

---

## Scaling Notes

### Worker Counts

| Clients | Services Required |
|---------|-------------------|
| 1 | 1 enrichment + 1 verification |
| 10 | 1 enrichment + 10 verification |
| 50 | 1 enrichment + 50 verification |
| 100 | 1 enrichment + 100 verification |

### Cost Estimation (Railway)

- Enrichment worker (shared): ~$5-10/month
- Verification worker (per client): ~$10-20/month depending on usage
- At 50 clients: ~$500-1000/month for workers

### Future Scaling Options

At 100+ clients, consider:
1. Kubernetes migration (cost savings at scale)
2. Worker auto-scaling based on queue depth
3. Multi-region deployment for latency

---

## Quick Reference

### Database Commands

```sql
-- List all dedicated clients
SELECT u.email, wc.* 
FROM worker_configs wc 
JOIN users u ON u.id = wc.user_id 
WHERE wc.is_active = true;

-- Check if user has dedicated setup
SELECT * FROM worker_configs WHERE user_id = 'UUID' AND is_active = true;

-- Disable a client's dedicated setup
UPDATE worker_configs SET is_active = false WHERE user_id = 'UUID';

-- Re-enable a client's dedicated setup
UPDATE worker_configs SET is_active = true WHERE user_id = 'UUID';
```

### Redis Commands

```bash
# Check queue length
redis-cli LLEN "verification-queue:client-acme"

# View queued jobs
redis-cli LRANGE "verification-queue:client-acme" 0 -1

# Check all dedicated queues
redis-cli KEYS "verification-queue:*"
```

### Railway CLI (if installed)

```bash
# List all services
railway status

# View logs for a specific worker
railway logs -s worker-verification-acme

# Restart a worker
railway restart -s worker-verification-acme
```

