# Plan: Concurrent key-pool processing (future architecture)

**Status:** Planned — not implemented.  
**Current production:** Fair-share key allocation + per-key Redis coordination (`acquireForKey`) in `workers/index.js`; one job at a time per worker **process**; parallelism across multiple Railway Node worker **instances**.

This document is the full technical plan for the next evolution: **maximize MailTester key utilization and throughput** without scaling container count linearly with concurrency.

---

## 1. Goals

| Goal | Today (fair-share) | Target (key pool) |
|------|-------------------|-------------------|
| Remove global serialization across instances | Done | Done |
| Saturate all API keys | Good when job count ≈ instance count | **Best:** any idle key is usable by any in-flight job |
| Redis overhead per verification | Per-key lock + fair-share reads | **Lower:** in-process timing; Redis for queue + shared state only |
| Worker processes | Often 2+ Node services for parallelism | **Optional:** fewer instances; one process drives high concurrency |
| Operational risk | Lower (proven pattern) | Higher (refactor); needs staged rollout |

---

## 2. Problem statement

### 2.1 Fair-share limitations (acceptable, not fatal)

- **Partitioning:** Keys are dealt to jobs (card-dealing). If Job A is slow and Job B is fast, some keys can sit underused until allocation refreshes.
- **Sequential job loop:** Each Node process runs `await processJobFromQueue(jobId)` in a tight loop, so **one active job per process**. Parallelism = **number of Railway Node worker replicas**, not “many jobs in one process.”
- **Coordination cost:** `GlobalRateLimiter.acquireForKey` uses Redis for spacing — correct under multi-instance, adds latency vs pure in-memory.

### 2.2 What “optimal” means here

The bottleneck is **MailTester rate limits per API key** (spacing between calls per key). The system should:

1. Never exceed per-key spacing (provider limits).
2. Minimize time keys sit idle while work exists.
3. Avoid unnecessary Redis roundtrips when a single process could schedule calls.

---

## 3. Target architecture

### 3.1 Core idea: central key scheduler (in-process)

Within each Node worker process:

- Maintain **one scheduler** for all MailTester keys: for each key, `nextAvailableAt` (monotonic timestamp) or a token-bucket.
- **Any** in-flight job, when it needs a verification, **awaits** the scheduler: “give me the next key that is ready, respecting spacing.”
- Pick the key with **earliest** `nextAvailableAt` among healthy keys with quota — maximizes utilization.

No per-job partition of keys required for correctness; partitioning was for **multi-process** isolation. Inside one process, a single scheduler is simpler and more efficient.

### 3.2 Multi-instance (multiple Railway Node services)

Two sub-options (choose one before implementation):

**Option A — Redis-backed scheduler (recommended for multi-instance)**  
- Store per-key `nextAvailableAt` (or versioned lock) in Redis with atomic updates (`SET` / Lua script / Redlock-style short lock).  
- Each verification: read/update “next slot” for chosen key atomically.  
- **Pros:** Correct across N containers. **Cons:** Still Redis per call, but can be lighter than current `SET NX` + sleep pattern if designed as a single atomic “reserve slot” operation.

**Option B — Single writer + horizontal read-only**  
- Only **one** Node worker runs verifications; others route work (complex, usually not worth it).

**Option C — Keep multiple instances + partition keys by instance**  
- Instance 1 only uses keys subset K1, instance 2 uses K2 — similar to fair-share but static. Simpler ops, less flexible.

**Recommendation:** Plan for **Option A** if you stay on 2+ Node workers; pair with **in-process queue** so each process still runs many concurrent jobs.

### 3.3 Job concurrency model

**Change the queue loop from:**

```text
while true:
  job = await brPop(queue)
  await processJobFromQueue(job)   // blocks until job completes
```

**To:**

```text
while true:
  job = await brPop(queue)
  start processJobFromQueue(job) as detached async task   // do NOT await here
  enforce MAX_IN_FLIGHT_JOBS (semaphore / counter)
  optional: backpressure if queue depth or memory high
```

- `MAX_IN_FLIGHT_JOBS` should be derived from **key count × desired parallelism per key** (e.g. 1 concurrent call per key if API is strict) or a configurable cap.
- Each job must carry **jobId, userId** through to `verifyEmail` for logging and credits — **no module-level `currentJobContext` without a stack or AsyncLocalStorage.**

---

## 4. Code changes (high level)

### 4.1 `verifyEmail` and callers

- **Pass explicit context:** `{ jobId, userId, userEmail }` (or fetch user in verify path) for `logVerificationError` and metrics — remove reliance on mutable module singletons for concurrent jobs.
- **Key acquisition:** `await keyScheduler.acquire()` returns `{ apiKey }` and records usage time.
- **Retries / failover:** Failover stays within **same health/quota rules**; scheduler picks next eligible key.

### 4.2 `processJobFromQueue`

- Must be safe to run **N** copies in parallel in one process:
  - **Postgres pool** size ≥ expected concurrent queries (or serialize DB-heavy sections if needed).
  - **`pendingLeadUpdates`:** either **per-job buffers** + flush per job, or a **single writer queue** (channel) that batches by jobId — avoid one shared array mutated by concurrent jobs without design.
  - **Job status transitions:** idempotent updates; handle partial failure if one job throws.

### 4.3 Fair-share Redis keys

- Today: `fairshare:active_jobs`, heartbeats, allocation cache — used for **multi-instance** partitioning.
- After key-pool v2:
  - If using **global Redis scheduler**, may **deprecate** partition metadata or keep only for **admin visibility** (dashboard).
  - Document migration: flush or stop writing old keys after cutover.

### 4.4 Dedicated worker mode (`WORKER_MODE=dedicated`)

- Dedicated instances should use **all keys** with **local-only** scheduler (no cross-instance Redis if truly single-tenant). Keep behavior equivalent to today’s “all keys, local rotation.”

---

## 5. Rollout strategy

1. **Phase 0 — Instrumentation**  
   - Metrics: key idle time, verifications/sec per key, queue wait time, concurrent jobs per process.

2. **Phase 1 — Context threading**  
   - Refactor `verifyEmail` + error logging to explicit `jobContext` (no global `currentJobContext`). Ship alone — behavior unchanged.

3. **Phase 2 — Per-job buffers or writer queue**  
   - Fix `pendingLeadUpdates` for concurrency; load-test with **forced** parallel jobs in staging.

4. **Phase 3 — Non-blocking queue loop**  
   - Add semaphore + `MAX_IN_FLIGHT_JOBS`; keep fair-share or simple round-robin temporarily.

5. **Phase 4 — Key scheduler**  
   - In-process scheduler first (single instance staging).  
   - Then Redis atomic scheduler for production multi-instance.

6. **Phase 5 — Deprecate fair-share partitioning**  
   - Remove or slim `getAllocatedKeys` / card-dealing if redundant.

Each phase should be **deployable independently** with feature flags if needed.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Credit double-charge / wrong user | Thread `jobId`/`userId` everywhere; idempotent credit writes |
| DB connection exhaustion | Tune `pg` pool; limit `MAX_IN_FLIGHT_JOBS` |
| Race on lead updates | Per-job buffers or single-writer queue |
| Rate limit violations | Scheduler enforces spacing; integration tests with mock clock |
| Regression in enrichment / verification flows | Contract tests on job lifecycle; shadow traffic in staging |

---

## 7. Success metrics

- **Throughput:** verifications/sec at steady state with fixed key count.
- **P95 job duration** for large jobs vs baseline.
- **Redis commands/sec** on worker (should drop or stay flat with simpler atomic pattern).
- **Error rate** and **MailTester 429/limit** events (should not increase).

---

## 8. Out of scope (for this plan)

- Changing Python workers (enrichment/catchall/Vayne) — separate pipelines.
- OmniVerifier / MailTester API contract changes — follow existing clients in `backend/app/services/`.
- BullMQ migration — today’s simple Redis list + poller may remain unless product requires BullMQ features.

---

## 9. References (in-repo)

- `workers/index.js` — current fair-share + `GlobalRateLimiter`
- `workers/Dockerfile.nodejs` — deploy surface for Node worker
- `docs/SOURCE_OF_TRUTH.md` — where to commit changes

---

*Last updated: aligned with fair-share production baseline post global-lock removal.*
