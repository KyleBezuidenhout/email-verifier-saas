const { Worker } = require('bullmq');
const axios = require('axios');
const redis = require('redis');
const { Pool } = require('pg');
const http = require('http');
require('dotenv').config();

// Parse Redis connection
const redisUrl = new URL(process.env.REDIS_URL);
const redisConnection = {
  host: redisUrl.hostname,
  port: redisUrl.port || 6379,
  password: redisUrl.password || undefined,
};

// Create Redis client for simple queue polling
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect().then(() => {
  // Initialize rate limiter with per-key 250ms spacing
  globalRateLimiter = new GlobalRateLimiter(redisClient, 165, 30000, MAILTESTER_API_KEYS.length);
  rateLimiter = globalRateLimiter; // Backwards compatibility alias
  
  const totalRate = MAILTESTER_API_KEYS.length * 165;
  const perKeySpacing = globalRateLimiter.perKeySpacingMs;
  const perKeyRate = Math.round(1000 / perKeySpacing);
  const totalRatePerSec = perKeyRate * MAILTESTER_API_KEYS.length;
  
  console.log(`✅ Rate limiter initialized with per-key spacing:`);
  console.log(`   - ${MAILTESTER_API_KEYS.length} API keys × 165/30s = ${totalRate} requests/30s total`);
  console.log(`   - Per-key spacing: ${perKeySpacing}ms (${perKeyRate} req/sec per key)`);
  console.log(`   - Total effective rate: ~${totalRatePerSec} requests/second`);
  console.log(`   - Max concurrent workers: 20 (prevents burst)`);
}).catch(console.error);

// PostgreSQL connection pool
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
  max: 50,                        // Increase from default 10 to 50
  min: 5,                         // Keep minimum connections warm
  idleTimeoutMillis: 30000,       // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Fail fast if can't connect in 10 seconds
  allowExitOnIdle: false,         // Keep pool alive for long-running worker
});

// MailTester API configuration
const MAILTESTER_BASE_URL = process.env.MAILTESTER_BASE_URL || 'https://happy.mailtester.ninja/ninja';

// Support multiple API keys (comma-separated) with fallback to single key
const MAILTESTER_API_KEYS = process.env.MAILTESTER_API_KEYS
  ? process.env.MAILTESTER_API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
  : (process.env.MAILTESTER_API_KEY ? [process.env.MAILTESTER_API_KEY] : []);

// Legacy single key for backwards compatibility
const MAILTESTER_API_KEY = MAILTESTER_API_KEYS[0] || process.env.MAILTESTER_API_KEY;

// Daily limit per key
const DAILY_LIMIT_PER_KEY = 500000;

// Error threshold for marking key unhealthy
const ERROR_THRESHOLD = 5; // errors per minute before marking unhealthy

// ==============================================
// PERFORMANCE TUNING CONSTANTS
// ==============================================

// PostgreSQL batch write settings
const BATCH_DB_WRITE_SIZE = 100;          // Max leads per bulk UPDATE
const BATCH_FLUSH_INTERVAL_MS = 5000;     // Flush to DB every 5 seconds max

// Adaptive thresholds based on job size
const SMALL_JOB_THRESHOLD = 500;          // Jobs with <= 500 people use frequent updates

// Progress update intervals (adaptive)
const PROGRESS_INTERVAL_SMALL_MS = 10000;  // 10 seconds for small jobs
const PROGRESS_INTERVAL_LARGE_MS = 120000; // 2 minutes for large jobs

// Usage tracking (reduces Redis writes by 100x)
const USAGE_TRACKING_INTERVAL = 100;      // Track every 100 API calls instead of every 1

// Cancellation check frequency (now based on completed items, not batches)
const CANCEL_CHECK_INTERVAL_SMALL = 20;   // Check every 20 completed people for small jobs
const CANCEL_CHECK_INTERVAL_LARGE = 100;  // Check every 100 completed people for large jobs

// Key health cache TTL
const KEY_HEALTH_CACHE_TTL_MS = 5000;     // Cache health status for 5 seconds
const KEY_REMAINING_CACHE_TTL_MS = 30000; // Cache remaining capacity for 30 seconds

// ==============================================
// STREAMING PIPELINE CONSTANTS
// ==============================================
// Maximum concurrent people/leads being processed simultaneously
// Limited to 20 to prevent burst of 429 errors
// Each key has 250ms spacing between calls (4 req/sec per key = 8 req/sec total with 2 keys)
const MAX_CONCURRENT_PEOPLE = 20;         // For enrichment jobs (each person = up to 16 API calls)
const MAX_CONCURRENT_LEADS = 20;          // For verification jobs (each lead = 1 API call)

// ============================================
// API USAGE TRACKING (for Admin Dashboard)
// ============================================
// Track usage per key per day (500k limit, resets at GMT+2 midnight)

const crypto = require('crypto');

function getKeyHash(apiKey) {
  // Get last 8 chars of SHA256 hash for key identification
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(-8);
}

function getTodayDateGMT2() {
  // Get today's date in GMT+2 (Africa/Johannesburg)
  const now = new Date();
  const gmt2Offset = 2 * 60; // GMT+2 in minutes
  const utcMinutes = now.getTime() / 60000 + now.getTimezoneOffset();
  const gmt2Date = new Date((utcMinutes + gmt2Offset) * 60000);
  return gmt2Date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Counter for batched usage tracking
let usageTrackingCounters = new Map(); // apiKey -> pending count

async function trackApiUsage(apiKey = MAILTESTER_API_KEY, forceFlush = false) {
  if (!redisClient.isReady || !apiKey) return;
  
  // Increment local counter
  const currentCount = (usageTrackingCounters.get(apiKey) || 0) + 1;
  usageTrackingCounters.set(apiKey, currentCount);
  
  // Only write to Redis every USAGE_TRACKING_INTERVAL calls (or if forced)
  if (!forceFlush && currentCount < USAGE_TRACKING_INTERVAL) {
    return;
  }
  
  try {
    const keyHash = getKeyHash(apiKey);
    const today = getTodayDateGMT2();
    const usageKey = `mailtester:usage:${keyHash}:${today}`;
    
    // Increment by the accumulated count
    const countToAdd = usageTrackingCounters.get(apiKey) || 0;
    if (countToAdd > 0) {
      await redisClient.incrBy(usageKey, countToAdd);
      await redisClient.expire(usageKey, 48 * 60 * 60);
      usageTrackingCounters.set(apiKey, 0); // Reset counter
    }
  } catch (err) {
    console.error('Usage tracking error:', err.message);
  }
}

/**
 * Flush all pending usage counters to Redis
 * Call this at end of job or periodically
 */
async function flushAllUsageTracking() {
  for (const [apiKey, count] of usageTrackingCounters.entries()) {
    if (count > 0) {
      await trackApiUsage(apiKey, true);
    }
  }
}

// ==============================================
// KEY HEALTH CACHING SYSTEM
// ==============================================
// Caches API key health and remaining capacity to reduce Redis lookups

const keyHealthCache = new Map();

/**
 * Get cached key health status (reduces Redis calls by ~90%)
 */
async function getCachedKeyHealth(apiKey) {
  const cacheKey = `health_${apiKey}`;
  const cached = keyHealthCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < KEY_HEALTH_CACHE_TTL_MS) {
    return cached.value;
  }
  
  const healthy = await isKeyHealthy(apiKey);
  keyHealthCache.set(cacheKey, { value: healthy, timestamp: Date.now() });
  return healthy;
}

/**
 * Get cached key remaining capacity (reduces Redis calls by ~95%)
 */
async function getCachedKeyRemaining(apiKey) {
  const cacheKey = `remaining_${apiKey}`;
  const cached = keyHealthCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < KEY_REMAINING_CACHE_TTL_MS) {
    return cached.value;
  }
  
  const remaining = await getKeyRemaining(apiKey);
  keyHealthCache.set(cacheKey, { value: remaining, timestamp: Date.now() });
  return remaining;
}

/**
 * Invalidate cache for a specific key (call when key becomes unhealthy)
 */
function invalidateKeyCache(apiKey) {
  keyHealthCache.delete(`health_${apiKey}`);
  keyHealthCache.delete(`remaining_${apiKey}`);
}

// ============================================
// MULTI-KEY MANAGEMENT
// ============================================

// Get current usage for a key today
async function getKeyUsage(apiKey) {
  if (!redisClient.isReady || !apiKey) return 0;
  
  try {
    const keyHash = getKeyHash(apiKey);
    const today = getTodayDateGMT2();
    const usageKey = `mailtester:usage:${keyHash}:${today}`;
    const usage = await redisClient.get(usageKey);
    return usage ? parseInt(usage) : 0;
  } catch (err) {
    console.error('Error getting key usage:', err.message);
    return 0;
  }
}

// Get remaining capacity for a key today
async function getKeyRemaining(apiKey) {
  const usage = await getKeyUsage(apiKey);
  return Math.max(0, DAILY_LIMIT_PER_KEY - usage);
}

// ============================================
// KEY ERROR TRACKING & HEALTH
// ============================================

// Track an error for a specific key (1-minute windows)
async function trackKeyError(apiKey) {
  if (!redisClient.isReady || !apiKey) return;
  
  try {
    const keyHash = getKeyHash(apiKey);
    const window = Math.floor(Date.now() / 60000); // 1-minute windows
    const errorKey = `mailtester:errors:${keyHash}:${window}`;
    
    await redisClient.incr(errorKey);
    await redisClient.expire(errorKey, 300); // 5 min TTL for cleanup
  } catch (err) {
    console.error('Error tracking key error:', err.message);
  }
}

// Get error count for a key in current minute
async function getKeyErrorCount(apiKey) {
  if (!redisClient.isReady || !apiKey) return 0;
  
  try {
    const keyHash = getKeyHash(apiKey);
    const window = Math.floor(Date.now() / 60000);
    const errorKey = `mailtester:errors:${keyHash}:${window}`;
    
    const count = await redisClient.get(errorKey);
    return count ? parseInt(count) : 0;
  } catch (err) {
    return 0;
  }
}

// Check if a key is healthy (less than ERROR_THRESHOLD errors in current minute)
async function isKeyHealthy(apiKey) {
  if (!redisClient.isReady || !apiKey) return true; // Assume healthy if can't check
  
  try {
    // Check error count
    const errorCount = await getKeyErrorCount(apiKey);
    if (errorCount >= ERROR_THRESHOLD) return false;
    
    // Check if manually marked unhealthy
    const keyHash = getKeyHash(apiKey);
    const unhealthyKey = `mailtester:unhealthy:${keyHash}`;
    const isUnhealthy = await redisClient.get(unhealthyKey);
    
    return !isUnhealthy;
  } catch (err) {
    return true; // Assume healthy on error
  }
}

// Mark a key as unhealthy (auto-recovers after 5 minutes)
async function markKeyUnhealthy(apiKey) {
  if (!redisClient.isReady || !apiKey) return;
  
  try {
    const keyHash = getKeyHash(apiKey);
    const unhealthyKey = `mailtester:unhealthy:${keyHash}`;
    
    await redisClient.set(unhealthyKey, Date.now().toString());
    await redisClient.expire(unhealthyKey, 300); // Auto-recover after 5 min
    
    console.log(`⚠️ Key ...${apiKey.slice(-4)} marked unhealthy (will recover in 5 min)`);
    // Invalidate cache so we don't use stale health status
    invalidateKeyCache(apiKey);
  } catch (err) {
    console.error('Error marking key unhealthy:', err.message);
  }
}

// Get the best available API key (healthy + most remaining capacity)
async function getBestAvailableKey() {
  if (MAILTESTER_API_KEYS.length === 0) {
    console.error('No API keys configured!');
    return null;
  }
  
  if (MAILTESTER_API_KEYS.length === 1) {
    return MAILTESTER_API_KEYS[0];
  }
  
  let bestKey = null;
  let bestRemaining = -1;
  
  // First pass: find best healthy key
  for (const key of MAILTESTER_API_KEYS) {
    const healthy = await isKeyHealthy(key);
    const remaining = await getKeyRemaining(key);
    
    if (healthy && remaining > bestRemaining) {
      bestRemaining = remaining;
      bestKey = key;
    }
  }
  
  // Fallback: if all keys unhealthy, use one with most capacity anyway
  if (!bestKey) {
    console.log('⚠️ All keys unhealthy, using key with most remaining capacity...');
    for (const key of MAILTESTER_API_KEYS) {
      const remaining = await getKeyRemaining(key);
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        bestKey = key;
      }
    }
  }
  
  return bestKey || MAILTESTER_API_KEYS[0];
}

// Get next healthy key excluding the specified one
async function getNextHealthyKey(excludeKey) {
  for (const key of MAILTESTER_API_KEYS) {
    if (key !== excludeKey) {
      const healthy = await isKeyHealthy(key);
      const remaining = await getKeyRemaining(key);
      if (healthy && remaining > 0) {
        return key;
      }
    }
  }
  // No healthy alternative found
  return null;
}

// ============================================
// ERROR LOGGING (for Admin Dashboard)
// ============================================
// Log verification errors with user/job context

async function logVerificationError(userId, userEmail, jobId, errorType, errorMessage, emailAttempted = null) {
  if (!redisClient.isReady) return;
  
  try {
    const today = getTodayDateGMT2();
    const errorsKey = `verification:errors:${today}`;
    const countsKey = `verification:error_counts:${today}`;
    
    const errorEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      user_id: userId,
      user_email: userEmail,
      job_id: jobId,
      error_type: errorType,
      error_message: errorMessage,
      email_attempted: emailAttempted
    });
    
    // Add to list (newest first)
    await redisClient.lPush(errorsKey, errorEntry);
    // Trim to max 10000 errors per day
    await redisClient.lTrim(errorsKey, 0, 9999);
    // Expire after 7 days
    await redisClient.expire(errorsKey, 7 * 24 * 60 * 60);
    
    // Increment count for this user/job/type
    const countField = `${userId}:${jobId}:${errorType}`;
    await redisClient.hIncrBy(countsKey, countField, 1);
    await redisClient.expire(countsKey, 7 * 24 * 60 * 60);
  } catch (err) {
    // Don't fail verification if logging fails
    console.error('Error logging error:', err.message);
  }
}

// Current job context for error logging
let currentJobContext = { userId: null, userEmail: null, jobId: null };

// ==============================================
// DEFERRED DATABASE WRITE SYSTEM
// ==============================================
// Collects verification results in memory and writes to DB in batches
// This reduces 175,488 individual UPDATEs to ~1,755 batch UPDATEs

const pendingLeadUpdates = [];
let lastFlushTime = Date.now();

/**
 * Queue a lead status update for batch processing
 * Does NOT write to database immediately
 */
function queueLeadUpdate(leadId, status, mx = '', provider = '') {
  pendingLeadUpdates.push({ 
    id: leadId, 
    status, 
    mx: mx || '', 
    provider: provider || '' 
  });
}

/**
 * Flush all pending lead updates to database in a single transaction
 * Uses bulk UPDATE for maximum efficiency
 */
async function flushPendingLeadUpdates() {
  if (pendingLeadUpdates.length === 0) return 0;
  
  // Extract all pending updates and clear the buffer
  const updates = pendingLeadUpdates.splice(0, pendingLeadUpdates.length);
  let totalFlushed = 0;
  
  // Process in chunks to avoid query size limits
  for (let i = 0; i < updates.length; i += BATCH_DB_WRITE_SIZE) {
    const chunk = updates.slice(i, i + BATCH_DB_WRITE_SIZE);
    try {
      await executeBulkLeadUpdate(chunk);
      totalFlushed += chunk.length;
    } catch (error) {
      // Put failed chunk back at the front of pending updates for retry
      console.error(`Failed to flush ${chunk.length} lead updates:`, error.message);
      pendingLeadUpdates.unshift(...chunk);
      // Also put remaining unprocessed updates back
      const remaining = updates.slice(i + BATCH_DB_WRITE_SIZE);
      if (remaining.length > 0) {
        pendingLeadUpdates.unshift(...remaining);
      }
      throw error; // Re-throw to signal failure
    }
  }
  
  lastFlushTime = Date.now();
  return totalFlushed;
}

/**
 * Execute a bulk UPDATE for a chunk of lead updates
 * Uses PostgreSQL's UPDATE FROM VALUES pattern for efficiency
 */
async function executeBulkLeadUpdate(updates) {
  if (updates.length === 0) return;
  
  const client = await pgPool.connect();
  try {
    // Build VALUES clause: ($1, $2, $3, $4), ($5, $6, $7, $8), ...
    const valueClauses = [];
    const params = [];
    
    updates.forEach((update, index) => {
      const offset = index * 4;
      valueClauses.push(`($${offset + 1}::bigint, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      params.push(update.id, update.status, update.mx, update.provider);
    });
    
    const query = `
      UPDATE leads AS l SET
        verification_status = v.status,
        mx_record = v.mx,
        mx_provider = v.provider
      FROM (VALUES ${valueClauses.join(', ')}) AS v(id, status, mx, provider)
      WHERE l.id = v.id
    `;
    
    await client.query(query, params);
  } finally {
    client.release();
  }
}

/**
 * Check if we should flush based on buffer size or time elapsed
 */
function shouldFlushPendingUpdates() {
  if (pendingLeadUpdates.length >= BATCH_DB_WRITE_SIZE) return true;
  if (Date.now() - lastFlushTime >= BATCH_FLUSH_INTERVAL_MS) return true;
  return false;
}

/**
 * Get count of pending updates (for logging)
 */
function getPendingUpdateCount() {
  return pendingLeadUpdates.length;
}

// Admin email constant - admin has infinite credits
const ADMIN_EMAIL = 'ben@superwave.io';

// ============================================
// MX PROVIDER PARSING
// ============================================
// Extract provider category from MX hostname
function extractProviderFromMX(mxHostname) {
  if (!mxHostname || mxHostname.trim() === '') {
    return 'other';
  }
  
  const mxLower = mxHostname.toLowerCase();
  
  // Detect Outlook: *.mail.protection.outlook.com
  if (mxLower.includes('mail.protection.outlook.com') || mxLower.includes('outlook.com')) {
    return 'outlook';
  }
  
  // Detect Google: *.google.com or *.gmail.com
  if (mxLower.includes('.google.com') || mxLower.includes('.gmail.com')) {
    return 'google';
  }
  
  // Everything else (including custom domains, other providers, etc.)
  return 'other';
}

// ============================================
// GLOBAL RATE LIMITER WITH MULTI-KEY SUPPORT
// ============================================
// Single shared rate limiter across ALL keys for maximum throughput
// Total capacity = numKeys × 165 per 30 seconds
// This enables TRUE parallel processing - 2x speed with 2 keys!

class GlobalRateLimiter {
  constructor(redisClient, requestsPerKeyPerWindow, windowMs, numKeys) {
    this.redis = redisClient;
    this.numKeys = numKeys;
    this.requestsPerKeyPerWindow = requestsPerKeyPerWindow; // 165 per key
    this.windowMs = windowMs; // 30000
    
    // Total capacity across all keys combined
    this.totalRequestsPerWindow = requestsPerKeyPerWindow * numKeys; // 165 * 2 = 330
    
    // Per-key spacing: 250ms between each API call for the same key
    // This ensures smooth distribution: 1000ms / 250ms = 4 req/sec per key
    // With 2 keys: 8 req/sec total
    this.perKeySpacingMs = 250;
    
    this.keyPrefix = 'mailtester:global_rate';
  }

  // Get Redis key for the global rate limit window
  _getWindowKey(windowStart) {
    return `${this.keyPrefix}:window:${windowStart}`;
  }

  // Get Redis key for tracking last request time per key
  _getKeyLastRequestKey(apiKey) {
    const keyHash = getKeyHash(apiKey);
    return `${this.keyPrefix}:last_request:${keyHash}`;
  }

  // Get Redis key for a specific API key's window (for per-key safety limits)
  _getKeyWindowKey(apiKey, windowStart) {
    const keyHash = getKeyHash(apiKey);
    return `${this.keyPrefix}:key:${keyHash}:${windowStart}`;
  }

  // Acquire a global rate limit slot (no spacing enforcement - spacing is per-key)
  async acquire() {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowKey = this._getWindowKey(windowStart);
    
    // Check global count across all keys
    const currentCountStr = await this.redis.get(windowKey);
    const currentCount = currentCountStr ? parseInt(currentCountStr) : 0;
    
    // If global limit reached, wait for next window
    if (currentCount >= this.totalRequestsPerWindow) {
      const nextWindow = windowStart + this.windowMs;
      const waitTime = nextWindow - Date.now() + 100;
      
      if (waitTime > 0) {
        console.log(`Global rate limit reached (${currentCount}/${this.totalRequestsPerWindow}). Waiting ${Math.ceil(waitTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.acquire();
      }
    }
    
    // Increment global counter
    const count = await this.redis.incr(windowKey);
    if (count === 1) {
      await this.redis.expire(windowKey, Math.ceil(this.windowMs / 1000) + 1);
    }
    
    // Double-check after increment
    if (count > this.totalRequestsPerWindow) {
      await this.redis.decr(windowKey);
      const nextWindow = windowStart + this.windowMs;
      const waitTime = nextWindow - Date.now() + 100;
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.acquire();
      }
    }
    
    // No global spacing - spacing is enforced per-key in acquireForKey()
  }

  // Acquire rate limit slot for a specific key with 250ms spacing enforcement
  // Returns true if acquired, false if key is at limit
  async acquireForKey(apiKey) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const keyWindowKey = this._getKeyWindowKey(apiKey, windowStart);
    const keyLastRequestKey = this._getKeyLastRequestKey(apiKey);
    
    // Check this specific key's count
    const currentCountStr = await this.redis.get(keyWindowKey);
    const currentCount = currentCountStr ? parseInt(currentCountStr) : 0;
    
    // If this key is at its individual limit, return false (caller should try another key)
    if (currentCount >= this.requestsPerKeyPerWindow) {
      return false;
    }
    
    // Enforce 250ms spacing between requests for this key
    const lastRequestTimeStr = await this.redis.get(keyLastRequestKey);
    if (lastRequestTimeStr) {
      const lastRequestTime = parseInt(lastRequestTimeStr);
      if (!isNaN(lastRequestTime)) {
        const timeSinceLastRequest = Date.now() - lastRequestTime;
        if (timeSinceLastRequest < this.perKeySpacingMs) {
          const waitTime = this.perKeySpacingMs - timeSinceLastRequest;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // Increment key-specific counter
    const count = await this.redis.incr(keyWindowKey);
    if (count === 1) {
      await this.redis.expire(keyWindowKey, Math.ceil(this.windowMs / 1000) + 1);
    }
    
    // If we exceeded, decrement and return false
    if (count > this.requestsPerKeyPerWindow) {
      await this.redis.decr(keyWindowKey);
      return false;
    }
    
    // Update last request time for this key
    await this.redis.set(keyLastRequestKey, Date.now().toString(), 'EX', Math.ceil(this.windowMs / 1000));
    
    return true;
  }

  // Get global status
  async getStatus() {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowKey = this._getWindowKey(windowStart);
    const countStr = await this.redis.get(windowKey);
    const count = countStr ? parseInt(countStr) : 0;
    
    return {
      availableTokens: this.totalRequestsPerWindow - count,
      maxTokens: this.totalRequestsPerWindow,
      currentCount: count,
      numKeys: this.numKeys,
      perKeySpacingMs: this.perKeySpacingMs,
    };
  }
}

// Global rate limiter instance
let globalRateLimiter;

// Legacy alias for backwards compatibility
let rateLimiter;

// ============================================
// GLOBAL ROUND-ROBIN VIA REDIS
// ============================================
// All workers share the same round-robin counter via Redis
// This ensures even distribution across all API keys

const ROUND_ROBIN_KEY = 'mailtester:round_robin_index';

// Get next key in round-robin fashion using GLOBAL Redis counter
// This ensures all workers across all Railway instances share the same index
async function getNextKeyRoundRobin() {
  if (MAILTESTER_API_KEYS.length === 0) return null;
  if (MAILTESTER_API_KEYS.length === 1) return MAILTESTER_API_KEYS[0];
  
  // Get and increment global round-robin index atomically via Redis
  let globalIndex = 0;
  if (redisClient.isReady) {
    try {
      // Atomic increment - all workers share this counter
      const newIndex = await redisClient.incr(ROUND_ROBIN_KEY);
      globalIndex = (newIndex - 1) % MAILTESTER_API_KEYS.length;
      
      // Set expiry to prevent stale data (1 hour)
      await redisClient.expire(ROUND_ROBIN_KEY, 3600);
    } catch (err) {
      console.error('Redis round-robin error, using fallback:', err.message);
      globalIndex = Math.floor(Math.random() * MAILTESTER_API_KEYS.length);
    }
  } else {
    // Fallback to random if Redis not ready
    globalIndex = Math.floor(Math.random() * MAILTESTER_API_KEYS.length);
  }
  
  // Try each key starting from global index, skip unhealthy ones
  for (let i = 0; i < MAILTESTER_API_KEYS.length; i++) {
    const idx = (globalIndex + i) % MAILTESTER_API_KEYS.length;
    const key = MAILTESTER_API_KEYS[idx];
    
    const healthy = await getCachedKeyHealth(key);
    const remaining = await getCachedKeyRemaining(key);
    
    if (healthy && remaining > 0) {
      return key;
    }
  }
  
  // All keys unhealthy or exhausted, return the one from global index anyway
  return MAILTESTER_API_KEYS[globalIndex];
}

// Global rate limit function - acquires a slot from the combined pool
async function rateLimit() {
  while (!globalRateLimiter) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await globalRateLimiter.acquire();
}

// Rate limit for a specific key (also increments key-specific counter for safety)
async function rateLimitForKey(apiKey) {
  while (!globalRateLimiter) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // First acquire global slot (fast ~91ms spacing with 2 keys)
  await globalRateLimiter.acquire();
  // Then track per-key usage for safety (doesn't add delay, just counting)
  await globalRateLimiter.acquireForKey(apiKey);
}

// Verify email using MailTester API with multi-key support and failover
// Uses per-key rate limiting with 250ms spacing between calls per key
async function verifyEmail(email, retryCount = 0, forceKey = null, keyAttempts = 0) {
  const MAX_RETRIES = 3;
  const MAX_KEY_ATTEMPTS = MAILTESTER_API_KEYS.length;
  
  // Try to acquire a rate limit slot for a key (with 250ms spacing per key)
  let apiKey = forceKey || await getNextKeyRoundRobin();
  let acquired = false;
  let attempts = 0;
  
  // Try keys until we find one that can accept the request
  while (!acquired && attempts < MAX_KEY_ATTEMPTS && apiKey) {
    // Acquire rate limit slot for this key (enforces 250ms spacing)
    acquired = await globalRateLimiter.acquireForKey(apiKey);
    
    if (!acquired) {
      // This key is at limit, try next key
      attempts++;
      if (attempts < MAX_KEY_ATTEMPTS) {
        apiKey = await getNextKeyRoundRobin();
      }
    }
  }
  
  if (!apiKey || !acquired) {
    console.error('No API keys available or all keys at rate limit!');
    return { status: 'error', message: 'All API keys at rate limit' };
  }
  
  try {
    const response = await axios.get(MAILTESTER_BASE_URL, {
      params: {
        email: email,
        key: apiKey,
      },
      timeout: 30000, // 30 second timeout
    });
    
    // Track API usage after successful call
    await trackApiUsage(apiKey);
    
    const code = response.data?.code || 'ko';
    const message = response.data?.message || '';
    const mx = response.data?.mx || '';
    
    let status = 'invalid';
    if (code === 'ok') {
      status = 'valid';
    } else if (code === 'mb' || message.toLowerCase().includes('catch')) {
      status = 'catchall';
    }
    
    // Parse provider from MX record
    const provider = extractProviderFromMX(mx);
    
    return {
      status,
      message,
      mx,
      provider,
    };
  } catch (error) {
    // Track usage even on error (API was still called)
    await trackApiUsage(apiKey);
    
    // Track error for this key
    await trackKeyError(apiKey);
    
    // Handle 429 Too Many Requests - try key switch after retries
    if (error.response?.status === 429) {
      // After 2 retries with same key, try switching to different key
      if (retryCount >= 2 && keyAttempts < MAX_KEY_ATTEMPTS - 1 && MAILTESTER_API_KEYS.length > 1) {
        const nextKey = await getNextHealthyKey(apiKey);
        if (nextKey && nextKey !== apiKey) {
          console.log(`🔄 429 error - switching from key ...${apiKey.slice(-4)} to ...${nextKey.slice(-4)}`);
          await markKeyUnhealthy(apiKey);
          return verifyEmail(email, 0, nextKey, keyAttempts + 1); // Reset retry count with new key
        }
      }
      
      // Standard retry with same key
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
        console.log(`429 rate limited for ${email}, retrying in ${backoffMs/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return verifyEmail(email, retryCount + 1, apiKey, keyAttempts);
      }
      
      console.error(`Max retries exceeded for ${email}`);
      // Log error for admin dashboard
      if (currentJobContext.jobId) {
        await logVerificationError(
          currentJobContext.userId,
          currentJobContext.userEmail,
          currentJobContext.jobId,
          'rate_limit_exceeded',
          'Rate limited - max retries exceeded',
          email
        );
      }
      return {
        status: 'error',
        message: 'Rate limited - max retries exceeded',
      };
    }
    
    // Handle network errors - try key switch after retries
    if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      // After 2 retries with same key, try switching
      if (retryCount >= 2 && keyAttempts < MAX_KEY_ATTEMPTS - 1 && MAILTESTER_API_KEYS.length > 1) {
        const nextKey = await getNextHealthyKey(apiKey);
        if (nextKey && nextKey !== apiKey) {
          console.log(`🔄 Network error - switching from key ...${apiKey.slice(-4)} to ...${nextKey.slice(-4)}`);
          await markKeyUnhealthy(apiKey);
          return verifyEmail(email, 0, nextKey, keyAttempts + 1);
        }
      }
      
      if (retryCount < MAX_RETRIES) {
        console.log(`Network error for ${email}, retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return verifyEmail(email, retryCount + 1, apiKey, keyAttempts);
      }
    }
    
    console.error(`Error verifying ${email}:`, error.message);
    // Log error for admin dashboard
    if (currentJobContext.jobId) {
      await logVerificationError(
        currentJobContext.userId,
        currentJobContext.userEmail,
        currentJobContext.jobId,
        'verification_error',
        error.message,
        email
      );
    }
    return {
      status: 'error',
      message: error.message,
    };
  }
}

// DEPRECATED: Use verifyEmail() instead - this is kept for backwards compatibility
// Verify email without rate limiting (now uses multi-key with failover)
async function verifyEmailWithoutRateLimit(email, retryCount = 0, currentKey = null, keyAttempts = 0) {
  // Just call the main verifyEmail function which handles everything
  return verifyEmail(email, retryCount, currentKey, keyAttempts);
}

// Deduplication logic (same as backend)
function deduplicateLeads(leads) {
  const uniqueLeads = new Map();
  
  for (const lead of leads) {
    const key = `${lead.first_name.toLowerCase()}_${lead.last_name.toLowerCase()}_${lead.domain.toLowerCase()}`;
    
    if (!uniqueLeads.has(key)) {
      uniqueLeads.set(key, []);
    }
    uniqueLeads.get(key).push(lead);
  }
  
  const finalResults = [];
  
  for (const [key, leadGroup] of uniqueLeads.entries()) {
    const valid = leadGroup.filter(l => l.verification_status === 'valid');
    const catchall = leadGroup.filter(l => l.verification_status === 'catchall');
    
    let best;
    if (valid.length > 0) {
      best = valid.reduce((max, lead) => 
        (lead.prevalence_score || 0) > (max.prevalence_score || 0) ? lead : max
      );
    } else if (catchall.length > 0) {
      best = catchall.reduce((max, lead) => 
        (lead.prevalence_score || 0) > (max.prevalence_score || 0) ? lead : max
      );
    } else {
      // No valid or catchall, mark first as not_found
      best = {
        ...leadGroup[0],
        email: '',
        verification_status: 'not_found',
        prevalence_score: 0,
      };
    }
    
    best.is_final_result = true;
    finalResults.push(best);
  }
  
  return finalResults;
}

// Update job status in database
async function updateJobStatus(jobId, status, updates = {}) {
  const setClause = ['status = $1'];
  const values = [status];
  let paramIndex = 2;
  
  if (updates.processed_leads !== undefined) {
    setClause.push(`processed_leads = $${paramIndex}`);
    values.push(updates.processed_leads);
    paramIndex++;
  }
  
  if (updates.valid_emails_found !== undefined) {
    setClause.push(`valid_emails_found = $${paramIndex}`);
    values.push(updates.valid_emails_found);
    paramIndex++;
  }
  
  if (updates.catchall_emails_found !== undefined) {
    setClause.push(`catchall_emails_found = $${paramIndex}`);
    values.push(updates.catchall_emails_found);
    paramIndex++;
  }
  
  if (updates.completed_at !== undefined) {
    setClause.push(`completed_at = $${paramIndex}`);
    values.push(updates.completed_at);
    paramIndex++;
  }
  
  if (updates.cost_in_credits !== undefined) {
    setClause.push(`cost_in_credits = $${paramIndex}`);
    values.push(updates.cost_in_credits);
    paramIndex++;
  }
  
  values.push(jobId);
  
  await pgPool.query(
    `UPDATE jobs SET ${setClause.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

// Update lead verification status
async function updateLeadStatus(leadId, status, message = '', mx = '', provider = '') {
  if (mx && provider) {
    await pgPool.query(
      'UPDATE leads SET verification_status = $1, mx_record = $2, mx_provider = $3 WHERE id = $4',
      [status, mx, provider, leadId]
    );
  } else if (mx) {
    await pgPool.query(
      'UPDATE leads SET verification_status = $1, mx_record = $2 WHERE id = $3',
      [status, mx, leadId]
    );
  } else {
    await pgPool.query(
      'UPDATE leads SET verification_status = $1 WHERE id = $2',
      [status, leadId]
    );
  }
}

// Mark leads as final results
async function markFinalResults(leadIds) {
  if (leadIds.length === 0) return;
  
  // Get job_id from first lead
  const jobResult = await pgPool.query('SELECT job_id FROM leads WHERE id = $1', [leadIds[0]]);
  if (jobResult.rows.length === 0) return;
  
  const jobId = jobResult.rows[0].job_id;
  
  // First, unmark all leads for this job
  await pgPool.query('UPDATE leads SET is_final_result = false WHERE job_id = $1', [jobId]);
  
  // Mark selected leads as final
  if (leadIds.length > 0) {
    const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
    await pgPool.query(
      `UPDATE leads SET is_final_result = true WHERE id IN (${placeholders})`,
      leadIds
    );
  }
}

// Process a job (extracted to be reusable)
async function processJob(jobId) {
  console.log(`\n[${new Date().toISOString()}] Processing job: ${jobId}`);
  
  try {
    // Get job details from database
    const jobResult = await pgPool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const jobData = jobResult.rows[0];
    const jobType = jobData.job_type || 'enrichment'; // Default to enrichment for backward compatibility
    
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    
    // Get all leads for this job
    // For verification jobs, no need to order by prevalence_score
    const orderBy = jobType === 'verification' ? 'id' : 'prevalence_score DESC';
    const leadsResult = await pgPool.query(
      `SELECT * FROM leads WHERE job_id = $1 ORDER BY ${orderBy}`,
      [jobId]
    );
    
    const leads = leadsResult.rows;
    const totalLeads = leads.length;
    
    console.log(`Found ${totalLeads} leads to verify (job_type: ${jobType})`);
    
    if (totalLeads === 0) {
      await updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
      });
      return { status: 'completed', message: 'No leads to process' };
    }
    
    let processedCount = 0;
    let validCount = 0;
    let catchallCount = 0;
    let lastProgressUpdate = Date.now();
    const PROGRESS_INTERVAL_MS = 3000; // Update progress every 3 seconds
    
    // Process leads in batches
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      // Process batch in parallel (respecting rate limit)
      const batchPromises = batch.map(async (lead) => {
        try {
          const result = await verifyEmail(lead.email);
          
          await updateLeadStatus(lead.id, result.status, result.message, result.mx, result.provider);
          
          if (result.status === 'valid') {
            validCount++;
          } else if (result.status === 'catchall') {
            catchallCount++;
          }
          
          processedCount++;
          
          // Update job progress every 3 seconds
          if (Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS) {
            await updateJobStatus(jobId, 'processing', {
              processed_leads: processedCount,
              valid_emails_found: validCount,
              catchall_emails_found: catchallCount,
            });
            lastProgressUpdate = Date.now();
            console.log(`Progress: ${processedCount}/${totalLeads} (${Math.round(processedCount / totalLeads * 100)}%)`);
          }
        } catch (error) {
          console.error(`Error processing lead ${lead.id}:`, error.message);
          await updateLeadStatus(lead.id, 'error', error.message);
          processedCount++;
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    // Final progress update
    await updateJobStatus(jobId, 'processing', {
      processed_leads: processedCount,
      valid_emails_found: validCount,
      catchall_emails_found: catchallCount,
    });
    
    console.log(`Verification complete. Valid: ${validCount}, Catchall: ${catchallCount}, Processed: ${processedCount}`);
    
    let finalValidCount, finalCatchallCount, finalResultIds;
    
    if (jobType === 'verification') {
      // For verification jobs: skip deduplication, mark all valid/catchall as final results
      console.log('Verification job: skipping deduplication, marking all results as final');
      
      const allLeads = await pgPool.query(
        'SELECT * FROM leads WHERE job_id = $1',
        [jobId]
      );
      
      finalResultIds = [];
      for (const lead of allLeads.rows) {
        if (lead.verification_status === 'valid' || lead.verification_status === 'catchall' || lead.verification_status === 'invalid') {
          finalResultIds.push(lead.id);
        }
      }
      
      await markFinalResults(finalResultIds);
      
      finalValidCount = validCount;
      finalCatchallCount = catchallCount;
    } else {
      // For enrichment jobs: apply deduplication logic
      console.log('Applying deduplication...');
      const allLeads = await pgPool.query(
        'SELECT * FROM leads WHERE job_id = $1',
        [jobId]
      );
      
      const finalResults = deduplicateLeads(allLeads.rows);
      
      // Mark final results in database
      finalResultIds = [];
      
      for (const result of finalResults) {
        if (result.id) {
          finalResultIds.push(result.id);
        } else if (result.verification_status === 'not_found') {
          const notFoundLead = await pgPool.query(
            `SELECT id FROM leads 
             WHERE job_id = $1 
             AND first_name = $2 
             AND last_name = $3 
             AND domain = $4 
             LIMIT 1`,
            [jobId, result.first_name, result.last_name, result.domain]
          );
          
          if (notFoundLead.rows.length > 0) {
            await pgPool.query(
              'UPDATE leads SET email = $1, verification_status = $2, is_final_result = true WHERE id = $3',
              ['', 'not_found', notFoundLead.rows[0].id]
            );
            finalResultIds.push(notFoundLead.rows[0].id);
          }
        }
      }
      
      await markFinalResults(finalResultIds);
      
      // Update final counts
      finalValidCount = finalResults.filter(r => r.verification_status === 'valid').length;
      finalCatchallCount = finalResults.filter(r => r.verification_status === 'catchall').length;
    }
    
    // Calculate cost (1 credit per lead processed)
    const costInCredits = jobData.total_leads;
    
    // Mark job as completed
    await updateJobStatus(jobId, 'completed', {
      processed_leads: processedCount,
      valid_emails_found: finalValidCount,
      catchall_emails_found: finalCatchallCount,
      cost_in_credits: costInCredits,
      completed_at: new Date(),
    });
    
    // Deduct credits (skip for admin, ensure credits never go below 0)
    if (costInCredits > 0) {
      // Check if user is admin
      const userResult = await pgPool.query('SELECT email FROM users WHERE id = $1', [jobData.user_id]);
      const userEmail = userResult.rows[0]?.email;
      
      if (userEmail !== ADMIN_EMAIL) {
        // Use GREATEST to ensure credits never go below 0
        await pgPool.query(
          'UPDATE users SET credits = GREATEST(0, credits - $1) WHERE id = $2',
          [costInCredits, jobData.user_id]
        );
        console.log(`Deducted ${costInCredits} credits from user ${userEmail}`);
      } else {
        console.log(`Admin user - skipping credit deduction for ${costInCredits} credits`);
      }
    }
    
    console.log(`Job ${jobId} completed successfully!`);
    console.log(`Final results: ${finalValidCount} valid, ${finalCatchallCount} catchall`);
    console.log(`Credits charged: ${costInCredits} (1 per lead)`);
    
    return {
      status: 'completed',
      processedCount: processedCount,
      validCount: finalValidCount,
      catchallCount: finalCatchallCount,
    };
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    await updateJobStatus(jobId, 'failed');
    throw error;
  }
}

console.log('Worker started, waiting for jobs...');
console.log(`MailTester API: ${MAILTESTER_BASE_URL}`);
console.log(`API Keys configured: ${MAILTESTER_API_KEYS.length}`);
if (MAILTESTER_API_KEYS.length > 0) {
  MAILTESTER_API_KEYS.forEach((key, i) => {
    console.log(`  Key ${i + 1}: ...${key.slice(-4)} (${DAILY_LIMIT_PER_KEY.toLocaleString()}/day)`);
  });
  const totalRate = MAILTESTER_API_KEYS.length * 165;
  const globalSpacing = Math.ceil(30000 / totalRate) + 5;
  console.log(`\n🚀 GLOBAL RATE LIMITER (Maximum Speed Mode):`);
  console.log(`   Combined rate: ${totalRate} requests per 30 seconds`);
  console.log(`   Global spacing: ~${globalSpacing}ms between requests`);
  console.log(`   Effective speed: ~${Math.round(1000/globalSpacing)} requests/second`);
  console.log(`   Speed multiplier: ${MAILTESTER_API_KEYS.length}x (vs single key)`);
  console.log(`   Total daily capacity: ${(MAILTESTER_API_KEYS.length * DAILY_LIMIT_PER_KEY).toLocaleString()} verifications\n`);
} else {
  console.log(`Rate limit: 165 requests per 30 seconds`);
}
console.log(`Using GLOBAL rate limiter with Redis-coordinated round-robin`);
console.log(`All workers share the same key rotation via Redis (even distribution!)`);
console.log(`Error failover: Auto-switch to healthy key after ${ERROR_THRESHOLD} errors/min`);

// Simple Redis list poller
async function pollSimpleQueue() {
  const queueName = 'simple-email-verification-queue';
  let lastQueuePollLog = 0; // Track last time we logged "waiting for jobs"
  
  console.log(`\n[${new Date().toISOString()}] 🚀 Starting simple queue poller for: ${queueName}`);
  
  while (true) {
    try {
      // Blocking pop from Redis list (waits up to 5 seconds)
      const result = await redisClient.brPop(queueName, 5);
      
      if (result && result.element) {
        const jobIdStr = result.element;
        console.log(`\n[${new Date().toISOString()}] 📥 DEQUEUED job ${jobIdStr} from queue '${queueName}'`);
        
        try {
          await processJobFromQueue(jobIdStr);
          console.log(`\n[${new Date().toISOString()}] ✅ Job ${jobIdStr} completed successfully`);
        } catch (error) {
          console.error(`\n[${new Date().toISOString()}] ❌ Error processing job ${jobIdStr}:`, error.message);
          console.error('Stack:', error.stack);
          // Job will remain in failed state, continue processing other jobs
        }
      } else {
        // No job available, log periodically (every 30 seconds) to show worker is alive
        const now = Date.now();
        if (!lastQueuePollLog || now - lastQueuePollLog > 30000) {
          console.log(`[${new Date().toISOString()}] ⏳ Waiting for jobs in queue '${queueName}'...`);
          lastQueuePollLog = now;
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`\n[${new Date().toISOString()}] ❌ Redis connection refused. Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error(`\n[${new Date().toISOString()}] ❌ Error polling queue:`, error.message);
        console.error('Stack:', error.stack);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

// Mark a single lead as final result
async function markLeadAsFinal(leadId, jobId) {
  await pgPool.query(
    'UPDATE leads SET is_final_result = true WHERE id = $1',
    [leadId]
  );
}

// Mark a lead as not_found
async function markLeadAsNotFound(leadId) {
  await pgPool.query(
    'UPDATE leads SET email = $1, verification_status = $2, is_final_result = true WHERE id = $3',
    ['', 'not_found', leadId]
  );
}

// Process a single person's permutations with early exit (returns result object)
async function processPersonWithEarlyExit(personKey, personLeads) {
  let foundValid = false;
  let bestCatchall = null;
  let permutationsVerified = 0;
  let apiCalls = 0;
  let savedCalls = 0;
  let validFound = 0;
  let catchallFound = 0;
  let finalLeadId = null;
  let resultType = 'not_found';
  
  // Process all 16 permutations one by one (in order of prevalence score)
  for (const lead of personLeads) {
    try {
      const result = await verifyEmail(lead.email);
      apiCalls++;
      permutationsVerified++;
      
      queueLeadUpdate(lead.id, result.status, result.mx, result.provider);
      
      if (result.status === 'valid') {
        // *** EARLY EXIT: Found valid email! ***
        finalLeadId = lead.id;
        validFound = 1;
        foundValid = true;
        resultType = 'valid';
        
        // Calculate how many API calls we saved
        const remainingPermutations = personLeads.length - permutationsVerified;
        savedCalls = remainingPermutations;
        
        console.log(`  ✓ VALID found for ${personKey} on permutation ${permutationsVerified}/16 - skipping ${remainingPermutations} remaining`);
        break; // Stop verifying this person's remaining permutations
        
      } else if (result.status === 'catchall') {
        // Track best catchall by prevalence score (higher score = better)
        if (!bestCatchall || (lead.prevalence_score || 0) > (bestCatchall.prevalence_score || 0)) {
          bestCatchall = lead;
        }
        catchallFound++;
      }
      // If invalid or error, continue to next permutation
      
    } catch (error) {
      console.error(`Error processing lead ${lead.id}:`, error.message);
      queueLeadUpdate(lead.id, 'error', '', '');
      apiCalls++;
      permutationsVerified++;
    }
  }
  
  // If no valid found, use best catchall or mark as not_found
  if (!foundValid) {
    if (bestCatchall) {
      finalLeadId = bestCatchall.id;
      resultType = 'catchall';
      console.log(`  ~ CATCHALL selected for ${personKey} (verified all 16 permutations)`);
    } else {
      // No valid or catchall found - mark first lead as not_found
      finalLeadId = personLeads[0].id;
      resultType = 'not_found';
      console.log(`  ✗ NOT_FOUND for ${personKey} (verified all 16 permutations)`);
    }
  }
  
  // Return 1 for valid/catchall only if that's the final result type for this person
  // (not counting all permutations that were catchall)
  return {
    personKey,
    finalLeadId,
    resultType,
    validFound: resultType === 'valid' ? 1 : 0,
    catchallFound: resultType === 'catchall' ? 1 : 0,
    apiCalls,
    savedCalls,
  };
}

// Helper function to check if job is cancelled
// Check if job is cancelled OR deleted (both should stop processing)
async function isJobCancelled(jobId) {
  const result = await pgPool.query(
    'SELECT status FROM jobs WHERE id = $1',
    [jobId]
  );
  // Return true if:
  // 1. Job doesn't exist (was deleted) - rows.length === 0
  // 2. Job exists but status is 'cancelled'
  return result.rows.length === 0 || result.rows[0].status === 'cancelled';
}

// Process job from simple queue with EARLY EXIT + PARALLEL PEOPLE optimization
async function processJobFromQueue(jobId) {
  console.log(`\n[${new Date().toISOString()}] Processing job: ${jobId}`);
  
  try {
    // Get job details from database
    const jobResult = await pgPool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const jobData = jobResult.rows[0];
    const jobType = jobData.job_type || 'enrichment'; // Default to enrichment for backward compatibility
    
    // Get user info for error logging context
    const userResult = await pgPool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [jobData.user_id]
    );
    const userData = userResult.rows[0];
    
    // Set job context for error logging
    currentJobContext = {
      userId: jobData.user_id,
      userEmail: userData?.email || 'unknown',
      jobId: jobId
    };
    
    // Check if job is already cancelled before starting
    if (jobData.status === 'cancelled') {
      console.log(`Job ${jobId} is already cancelled, skipping...`);
      return { status: 'cancelled', message: 'Job was cancelled' };
    }
    
    // Check if job is waiting for CSV data
    if (jobData.status === 'waiting_for_csv') {
      console.log(`⏳ Job ${jobId} is waiting for CSV data (status: waiting_for_csv), skipping processing...`);
      console.log(`   This job will be processed once the webhook updates it with CSV data`);
      return { status: 'waiting_for_csv', message: 'Job waiting for CSV data' };
    }
    
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    
    // ============================================
    // VERIFICATION JOBS: Direct verification only (no permutations)
    // ============================================
    if (jobType === 'verification') {
      console.log(`Verification job detected - processing leads directly (no permutations)`);
      
      // Get all leads for this job (no need to order by prevalence_score)
      const leadsResult = await pgPool.query(
        'SELECT * FROM leads WHERE job_id = $1 ORDER BY id',
        [jobId]
      );
      
      const leads = leadsResult.rows;
      const totalLeads = leads.length;
      
      console.log(`Found ${totalLeads} leads to verify`);
      
      if (totalLeads === 0) {
        await updateJobStatus(jobId, 'completed', {
          completed_at: new Date(),
        });
        return { status: 'completed', message: 'No leads to process' };
      }
      
      let processedCount = 0;
      let validCount = 0;
      let catchallCount = 0;
      const finalResultIds = [];
      let lastProgressUpdate = Date.now();
      
      // Determine adaptive settings based on job size
      const isSmallJob = totalLeads <= SMALL_JOB_THRESHOLD;
      const progressIntervalMs = isSmallJob ? PROGRESS_INTERVAL_SMALL_MS : PROGRESS_INTERVAL_LARGE_MS;
      const cancelCheckInterval = isSmallJob ? CANCEL_CHECK_INTERVAL_SMALL : CANCEL_CHECK_INTERVAL_LARGE;
      
      console.log(`Adaptive settings: ${isSmallJob ? 'SMALL JOB' : 'LARGE JOB'} mode`);
      
      // Track job timing for throughput calculation
      const jobStartTime = Date.now();
      
      console.log(`Starting verification with STREAMING PIPELINE: ${totalLeads} leads (${MAX_CONCURRENT_LEADS} concurrent)`);
      console.log(`Using ${MAILTESTER_API_KEYS.length} API keys = ${MAILTESTER_API_KEYS.length}x speed!`);
      
      // ==============================================
      // STREAMING PIPELINE MODEL FOR VERIFICATION
      // ==============================================
      // Maintains MAX_CONCURRENT_LEADS in flight at all times.
      // As soon as one completes, the next starts immediately.
      
      let leadIndex = 0;
      let activeCount = 0;
      let isCancelled = false;
      let itemsSinceLastCancelCheck = 0;
      
      // Promise that resolves when all leads are processed
      let resolveAllDone;
      const allDonePromise = new Promise((resolve) => {
        resolveAllDone = resolve;
      });
      
      // Process a single lead and handle the result
      async function processNextLead() {
        // Check if we should stop
        if (isCancelled || leadIndex >= leads.length) {
          activeCount--;
          if (activeCount === 0) {
            resolveAllDone();
          }
          return;
        }
        
        // Get the next lead to process
        const currentIndex = leadIndex++;
        const lead = leads[currentIndex];
        
        try {
          // Skip leads with empty or null emails
          if (!lead.email || lead.email.trim() === '') {
            queueLeadUpdate(lead.id, 'error', '', '');
            processedCount++;
          } else {
            // Verify email (uses rate limiting with round-robin)
            const result = await verifyEmail(lead.email);
            
            queueLeadUpdate(lead.id, result.status, result.mx, result.provider);
            processedCount++;
            
            if (result.status === 'valid') {
              validCount++;
              finalResultIds.push(lead.id);
            } else if (result.status === 'catchall') {
              catchallCount++;
              finalResultIds.push(lead.id);
            } else if (result.status === 'invalid') {
              finalResultIds.push(lead.id);
            }
          }
          
          // Check for cancellation periodically
          itemsSinceLastCancelCheck++;
          if (itemsSinceLastCancelCheck >= cancelCheckInterval) {
            itemsSinceLastCancelCheck = 0;
            if (await isJobCancelled(jobId)) {
              console.log(`Job ${jobId} was cancelled, stopping pipeline...`);
              isCancelled = true;
            }
          }
          
          // Flush pending updates if buffer is full or timer expired
          if (shouldFlushPendingUpdates()) {
            const flushed = await flushPendingLeadUpdates();
            if (flushed > 0) {
              console.log(`  💾 Flushed ${flushed} lead updates to database`);
            }
          }
          
          // Update progress periodically
          if (Date.now() - lastProgressUpdate >= progressIntervalMs) {
            const progressPercent = Math.round((processedCount / totalLeads) * 100);
            await updateJobStatus(jobId, 'processing', {
              processed_leads: processedCount,
              valid_emails_found: validCount,
              catchall_emails_found: catchallCount,
            });
            lastProgressUpdate = Date.now();
            console.log(`🚀 Progress: ${processedCount}/${totalLeads} (${progressPercent}%) | Active: ${activeCount} | Valid: ${validCount} | Catchall: ${catchallCount}`);
          }
          
        } catch (error) {
          console.error(`Error processing lead ${lead.id}:`, error.message);
          queueLeadUpdate(lead.id, 'error', '', '');
          processedCount++;
        }
        
        // IMMEDIATELY start processing the next lead (streaming!)
        if (!isCancelled && leadIndex < leads.length) {
          processNextLead(); // Fire without await
        } else {
          activeCount--;
          if (activeCount === 0) {
            resolveAllDone();
          }
        }
      }
      
      // Start the initial batch of concurrent workers with slight stagger
      // This prevents all workers from hitting the rate limiter simultaneously
      console.log(`\n🚀 Starting streaming pipeline with ${MAX_CONCURRENT_LEADS} concurrent leads...`);
      const initialBatchSize = Math.min(MAX_CONCURRENT_LEADS, leads.length);
      for (let i = 0; i < initialBatchSize; i++) {
        activeCount++;
        // Stagger start times by 10ms each to prevent burst
        setTimeout(() => {
          processNextLead(); // Fire without await to start all concurrently
        }, i * 10);
      }
      
      // Wait for all leads to be processed
      await allDonePromise;
      
      // Handle cancellation
      if (isCancelled) {
        const flushed = await flushPendingLeadUpdates();
        console.log(`Flushed ${flushed} pending lead updates before cancellation`);
        await flushAllUsageTracking();
        await updateJobStatus(jobId, 'cancelled');
        return { status: 'cancelled', message: 'Job was cancelled during processing' };
      }
      
      // Final flush of pending updates
      const finalFlushed = await flushPendingLeadUpdates();
      if (finalFlushed > 0) {
        console.log(`💾 Final flush: ${finalFlushed} lead updates written to database`);
      }
      await flushAllUsageTracking();
      
      // Mark all processed leads as final results
      await pgPool.query('UPDATE leads SET is_final_result = false WHERE job_id = $1', [jobId]);
      
      if (finalResultIds.length > 0) {
        const placeholders = finalResultIds.map((_, i) => `$${i + 1}`).join(',');
        await pgPool.query(
          `UPDATE leads SET is_final_result = true WHERE id IN (${placeholders})`,
          finalResultIds
        );
      }
      
      // Calculate cost (1 credit per lead processed)
      const costInCredits = jobData.total_leads;
      
      // Mark job as completed
      await updateJobStatus(jobId, 'completed', {
        processed_leads: processedCount,
        valid_emails_found: validCount,
        catchall_emails_found: catchallCount,
        cost_in_credits: costInCredits,
        completed_at: new Date(),
      });
      
      // Deduct credits (skip for admin, ensure credits never go below 0)
      if (costInCredits > 0) {
        // Check if user is admin
        const userResult = await pgPool.query('SELECT email FROM users WHERE id = $1', [jobData.user_id]);
        const userEmail = userResult.rows[0]?.email;
        
        if (userEmail !== ADMIN_EMAIL) {
          await pgPool.query(
            'UPDATE users SET credits = GREATEST(0, credits - $1) WHERE id = $2',
            [costInCredits, jobData.user_id]
          );
          console.log(`Deducted ${costInCredits} credits from user ${userEmail}`);
        } else {
          console.log(`Admin user - skipping credit deduction for ${costInCredits} credits`);
        }
      }
      
      // Calculate throughput statistics
      const jobDurationMs = Date.now() - jobStartTime;
      const jobDurationMin = jobDurationMs / 60000;
      const leadsPerMinute = jobDurationMin > 0 ? Math.round(processedCount / jobDurationMin) : 0;
      const leadsPerSecond = jobDurationMs > 0 ? Math.round((processedCount / jobDurationMs) * 1000 * 10) / 10 : 0;
      
      console.log(`\n========================================`);
      console.log(`✅ Verification job ${jobId} completed successfully!`);
      console.log(`----------------------------------------`);
      console.log(`📊 RESULTS:`);
      console.log(`   Valid: ${validCount} | Catchall: ${catchallCount} | Total: ${processedCount}`);
      console.log(`----------------------------------------`);
      console.log(`⚡ PERFORMANCE (Streaming Pipeline):`);
      console.log(`   Duration: ${Math.round(jobDurationMin * 10) / 10} minutes`);
      console.log(`   Throughput: ${leadsPerMinute} leads/minute (${leadsPerSecond}/sec)`);
      console.log(`----------------------------------------`);
      console.log(`💰 Credits charged: ${costInCredits} (1 per lead)`);
      console.log(`========================================\n`);
      
      return {
        status: 'completed',
        processedCount: processedCount,
        validCount: validCount,
        catchallCount: catchallCount,
      };
    }
    
    // ============================================
    // ENRICHMENT JOBS: Permutation logic with early exit
    // ============================================
    console.log(`\n========================================`);
    console.log(`🔄 ENRICHMENT JOB ${jobId} - Starting processing`);
    console.log(`Job status: ${jobData.status}`);
    console.log(`Job type: ${jobData.job_type}`);
    console.log(`Total leads (unique people): ${jobData.total_leads}`);
    console.log(`Input file path: ${jobData.input_file_path || 'N/A'}`);
    console.log(`========================================\n`);
    
    // Get all leads for this job
    console.log(`📋 Fetching leads for job ${jobId}...`);
    const leadsResult = await pgPool.query(
      'SELECT * FROM leads WHERE job_id = $1 ORDER BY prevalence_score DESC',
      [jobId]
    );
    
    const leads = leadsResult.rows;
    const totalPermutations = leads.length;
    
    // Get unique people count from job (not permutations)
    const uniquePeopleCount = jobData.total_leads;
    
    // Determine adaptive settings based on job size
    const isSmallJob = uniquePeopleCount <= SMALL_JOB_THRESHOLD;
    const progressIntervalMs = isSmallJob ? PROGRESS_INTERVAL_SMALL_MS : PROGRESS_INTERVAL_LARGE_MS;
    const cancelCheckInterval = isSmallJob ? CANCEL_CHECK_INTERVAL_SMALL : CANCEL_CHECK_INTERVAL_LARGE;
    
    console.log(`Adaptive settings: ${isSmallJob ? 'SMALL JOB' : 'LARGE JOB'} mode`);
    console.log(`  - Progress updates: every ${progressIntervalMs / 1000}s`);
    console.log(`  - Cancellation checks: every ${cancelCheckInterval} completed people`);
    
    // Track job timing for throughput calculation
    const jobStartTime = Date.now();
    
    console.log(`✅ Found ${totalPermutations} email permutations to verify for ${uniquePeopleCount} unique people`);
    
    if (totalPermutations === 0) {
      console.log(`⚠️ No leads found for job ${jobId} - marking as completed`);
      await updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
      });
      return { status: 'completed', message: 'No leads to process' };
    }
    
    if (!jobData.input_file_path) {
      console.error(`❌ CRITICAL: Job ${jobId} has no input_file_path - cannot process enrichment job`);
      await updateJobStatus(jobId, 'failed', {
        completed_at: new Date(),
      });
      return { status: 'failed', message: 'Job has no input file path' };
    }
    
    // ============================================
    // EARLY EXIT + PARALLEL PEOPLE OPTIMIZATION
    // ============================================
    const leadsByPerson = new Map();
    for (const lead of leads) {
      const key = `${lead.first_name.toLowerCase()}_${lead.last_name.toLowerCase()}_${lead.domain.toLowerCase()}`;
      if (!leadsByPerson.has(key)) {
        leadsByPerson.set(key, []);
      }
      leadsByPerson.get(key).push(lead);
    }
    
    // Sort each person's permutations by prevalence score (highest first)
    for (const [key, personLeads] of leadsByPerson) {
      personLeads.sort((a, b) => (b.prevalence_score || 0) - (a.prevalence_score || 0));
    }
    
    // Convert to array for streaming processing
    const peopleArray = Array.from(leadsByPerson.entries());
    
    console.log(`Grouped into ${peopleArray.length} unique people - using STREAMING PIPELINE (${MAX_CONCURRENT_PEOPLE} concurrent)`);
    
    // ==============================================
    // STREAMING PIPELINE MODEL
    // ==============================================
    // Instead of fixed batches with Promise.all(), we maintain a constant
    // number of people being processed. As soon as one finishes, the next starts.
    // This keeps the rate limiter at ~100% utilization!
    
    let completedPeopleCount = 0;
    let validCount = 0;
    let catchallCount = 0;
    let totalApiCalls = 0;
    let savedApiCalls = 0;
    const finalResultIds = [];
    let lastProgressUpdate = Date.now();
    let itemsSinceLastCancelCheck = 0;
    let personIndex = 0;
    let activeCount = 0;
    let isCancelled = false;
    let pipelineError = null;
    
    // Promise that resolves when all people are processed
    let resolveAllDone;
    let rejectAllDone;
    const allDonePromise = new Promise((resolve, reject) => {
      resolveAllDone = resolve;
      rejectAllDone = reject;
    });
    
    // Process a single person and handle the result
    async function processNextPerson() {
      // Check if we should stop
      if (isCancelled || pipelineError || personIndex >= peopleArray.length) {
        activeCount--;
        if (activeCount === 0) {
          resolveAllDone();
        }
        return;
      }
      
      // Get the next person to process
      const currentIndex = personIndex++;
      const [personKey, personLeads] = peopleArray[currentIndex];
      
      try {
        // Process this person (with early exit optimization)
        const result = await processPersonWithEarlyExit(personKey, personLeads);
        
        // Handle the result
        if (result.finalLeadId) {
          finalResultIds.push(result.finalLeadId);
          
          // Mark as final immediately based on result type
          if (result.resultType === 'valid' || result.resultType === 'catchall') {
            await markLeadAsFinal(result.finalLeadId, jobId);
          } else {
            await markLeadAsNotFound(result.finalLeadId);
          }
        }
        
        validCount += result.validFound;
        catchallCount += result.catchallFound;
        totalApiCalls += result.apiCalls;
        savedApiCalls += result.savedCalls;
        completedPeopleCount++;
        
        // Check for cancellation periodically
        itemsSinceLastCancelCheck++;
        if (itemsSinceLastCancelCheck >= cancelCheckInterval) {
          itemsSinceLastCancelCheck = 0;
          if (await isJobCancelled(jobId)) {
            console.log(`Job ${jobId} was cancelled, stopping pipeline...`);
            isCancelled = true;
          }
        }
        
        // Flush pending lead updates if needed
        if (shouldFlushPendingUpdates()) {
          const flushed = await flushPendingLeadUpdates();
          if (flushed > 0) {
            console.log(`  💾 Flushed ${flushed} lead updates to database`);
          }
        }
        
        // Update progress periodically
        if (Date.now() - lastProgressUpdate >= progressIntervalMs) {
          const progressPercent = Math.round((completedPeopleCount / uniquePeopleCount) * 100);
          
          await updateJobStatus(jobId, 'processing', {
            processed_leads: completedPeopleCount,
            valid_emails_found: validCount,
            catchall_emails_found: catchallCount,
          });
          
          const rlStatus = await rateLimiter.getStatus();
          console.log(`🚀 Progress: ${completedPeopleCount}/${uniquePeopleCount} (${progressPercent}%) | Active: ${activeCount} | API: ${totalApiCalls} | Saved: ${savedApiCalls} | Tokens: ${rlStatus.availableTokens}/${rlStatus.maxTokens}`);
          
          lastProgressUpdate = Date.now();
        }
        
      } catch (error) {
        console.error(`Error processing person ${personKey}:`, error.message);
        // Continue processing other people even if one fails
        completedPeopleCount++;
      }
      
      // IMMEDIATELY start processing the next person (this is the key to streaming!)
      if (!isCancelled && !pipelineError && personIndex < peopleArray.length) {
        // Don't await - fire and forget to keep pipeline full
        processNextPerson();
      } else {
        activeCount--;
        if (activeCount === 0) {
          resolveAllDone();
        }
      }
    }
    
    // Start the initial batch of concurrent workers with slight stagger
    // This prevents all workers from hitting the rate limiter simultaneously
    console.log(`\n🚀 Starting streaming pipeline with ${MAX_CONCURRENT_PEOPLE} concurrent people...`);
    const initialBatchSize = Math.min(MAX_CONCURRENT_PEOPLE, peopleArray.length);
    for (let i = 0; i < initialBatchSize; i++) {
      activeCount++;
      // Stagger start times by 10ms each to prevent burst
      setTimeout(() => {
        processNextPerson(); // Fire without await to start all concurrently
      }, i * 10);
    }
    
    // Wait for all people to be processed
    await allDonePromise;
    
    // Handle cancellation
    if (isCancelled) {
      const flushed = await flushPendingLeadUpdates();
      console.log(`Flushed ${flushed} pending lead updates before cancellation`);
      await flushAllUsageTracking();
      await updateJobStatus(jobId, 'cancelled');
      return { status: 'cancelled', message: 'Job was cancelled during processing' };
    }
    
    // Final flush of any remaining pending updates
    const finalFlushed = await flushPendingLeadUpdates();
    if (finalFlushed > 0) {
      console.log(`💾 Final flush: ${finalFlushed} lead updates written to database`);
    }
    
    // Flush all usage tracking counters
    await flushAllUsageTracking();
    console.log(`📊 Usage tracking flushed to Redis`);
    
    // Unmark all leads first, then mark final results
    await pgPool.query('UPDATE leads SET is_final_result = false WHERE job_id = $1', [jobId]);
    
    if (finalResultIds.length > 0) {
      const placeholders = finalResultIds.map((_, i) => `$${i + 1}`).join(',');
      await pgPool.query(
        `UPDATE leads SET is_final_result = true WHERE id IN (${placeholders})`,
        finalResultIds
      );
    }
    
    // Calculate cost (1 credit per unique person/lead)
    const costInCredits = uniquePeopleCount;
    
    // Mark job as completed
    await updateJobStatus(jobId, 'completed', {
      processed_leads: uniquePeopleCount,
      valid_emails_found: validCount,
      catchall_emails_found: catchallCount,
      cost_in_credits: costInCredits,
      completed_at: new Date(),
    });
    
    // Deduct credits (skip for admin, ensure credits never go below 0)
    if (costInCredits > 0) {
      // Check if user is admin
      const userResult = await pgPool.query('SELECT email FROM users WHERE id = $1', [jobData.user_id]);
      const userEmail = userResult.rows[0]?.email;
      
      if (userEmail !== ADMIN_EMAIL) {
        await pgPool.query(
          'UPDATE users SET credits = GREATEST(0, credits - $1) WHERE id = $2',
          [costInCredits, jobData.user_id]
        );
        console.log(`Deducted ${costInCredits} credits from user ${userEmail}`);
      } else {
        console.log(`Admin user - skipping credit deduction for ${costInCredits} credits`);
      }
    }
    
    // Calculate throughput statistics
    const jobDurationMs = Date.now() - jobStartTime;
    const jobDurationMin = jobDurationMs / 60000;
    const peoplePerMinute = jobDurationMin > 0 ? Math.round(uniquePeopleCount / jobDurationMin) : 0;
    const apiCallsPerSecond = jobDurationMs > 0 ? Math.round((totalApiCalls / jobDurationMs) * 1000 * 10) / 10 : 0;
    
    console.log(`\n========================================`);
    console.log(`✅ Job ${jobId} completed successfully!`);
    console.log(`----------------------------------------`);
    console.log(`📊 RESULTS:`);
    console.log(`   Valid: ${validCount} | Catchall: ${catchallCount} | Total: ${uniquePeopleCount}`);
    console.log(`----------------------------------------`);
    console.log(`⚡ PERFORMANCE (Streaming Pipeline):`);
    console.log(`   Duration: ${Math.round(jobDurationMin * 10) / 10} minutes`);
    console.log(`   Throughput: ${peoplePerMinute} people/minute`);
    console.log(`   API calls: ${totalApiCalls} total (${apiCallsPerSecond}/sec)`);
    console.log(`   Early exit savings: ${savedApiCalls} calls saved (${totalApiCalls + savedApiCalls > 0 ? Math.round((savedApiCalls / (totalApiCalls + savedApiCalls)) * 100) : 0}%)`);
    console.log(`----------------------------------------`);
    console.log(`💰 Credits charged: ${costInCredits} (1 per lead)`);
    console.log(`========================================\n`);
    
  } catch (error) {
    console.error(`\n❌ ERROR processing enrichment job ${jobId}:`, error);
    console.error(`Error message: ${error.message}`);
    if (error.stack) {
      console.error(`Error stack:`, error.stack);
    }
    
    // Attempt to flush any pending updates before marking as failed
    try {
      const emergencyFlushed = await flushPendingLeadUpdates();
      if (emergencyFlushed > 0) {
        console.log(`💾 Emergency flush: saved ${emergencyFlushed} lead updates before failure`);
      }
      await flushAllUsageTracking();
    } catch (flushError) {
      console.error(`Failed to flush pending updates:`, flushError.message);
    }
    
    // Try to update job status to failed
    try {
      await updateJobStatus(jobId, 'failed', {
        completed_at: new Date(),
      });
      console.log(`✅ Marked enrichment job ${jobId} as failed`);
    } catch (updateError) {
      console.error(`❌ Failed to update job ${jobId} status to failed:`, updateError);
    }
    
    throw error;
  }
}

// ============================================
// HEALTH CHECK SERVER
// Keeps Railway from sleeping the worker container
// ============================================
const HEALTH_PORT = process.env.PORT || 3000;

const healthServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      redis: redisClient.isReady ? 'connected' : 'disconnected',
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

healthServer.listen(HEALTH_PORT, '0.0.0.0', () => {
  console.log(`✅ Health check server running on port ${HEALTH_PORT}`);
});

// Start simple queue poller
pollSimpleQueue().catch(console.error);
