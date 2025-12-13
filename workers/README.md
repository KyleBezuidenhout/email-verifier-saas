# Email Verification Worker

BullMQ worker that processes email verification jobs from Redis queue.

## Features

- ✅ Listens to Redis queue for new jobs
- ✅ Connects to PostgreSQL to get job and lead data
- ✅ Verifies emails using MailTester Ninja API
- ✅ Rate limiting: 170 emails per 30 seconds
- ✅ Real-time progress updates
- ✅ Deduplication: keeps only best email per lead
- ✅ Error handling and retries
- ✅ Graceful shutdown

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `MAILTESTER_API_KEY` - MailTester API key
- `MAILTESTER_BASE_URL` - MailTester API base URL (optional, defaults to https://happy.mailtester.ninja/ninja)

## Running

```bash
node index.js
```

Or with PM2 for production:
```bash
pm2 start index.js --name email-verifier-worker
```

## How It Works

1. Worker listens to `email-verification` queue in Redis
2. When a job is received, it:
   - Fetches job details from PostgreSQL
   - Gets all leads for the job
   - Verifies each email using MailTester API
   - Updates lead verification status in database
   - Updates job progress in real-time
   - Applies deduplication logic
   - Marks final results
   - Deducts credits from user account
   - Marks job as completed

## Rate Limiting

The worker respects MailTester's rate limit of 170 requests per 30 seconds. It automatically waits when the limit is reached.

## Error Handling

- Network errors are retried once
- Failed verifications are marked as 'error' status
- Job failures are logged and job status is updated to 'failed'

## Deduplication

The worker applies the same deduplication logic as the backend:
1. Groups leads by (first_name, last_name, domain)
2. For each group, selects the best email:
   - Priority: Valid emails with highest prevalence score
   - Fallback: Catchall emails with highest prevalence score
   - Last resort: Mark as "not_found"


