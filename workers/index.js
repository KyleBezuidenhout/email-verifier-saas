const { Worker } = require('bullmq');
const axios = require('axios');
const redis = require('redis');
const { Pool } = require('pg');
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
  // Initialize distributed rate limiter after Redis connection is established
  rateLimiter = new DistributedRateLimiter(redisClient, 165, 30000);
  console.log('Distributed rate limiter initialized (165 requests per 30 seconds)');
}).catch(console.error);

// PostgreSQL connection pool
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

// MailTester API configuration
const MAILTESTER_BASE_URL = process.env.MAILTESTER_BASE_URL || 'https://happy.mailtester.ninja/ninja';
const MAILTESTER_API_KEY = process.env.MAILTESTER_API_KEY;

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

async function trackApiUsage(apiKey = MAILTESTER_API_KEY) {
  if (!redisClient.isReady || !apiKey) return;
  
  try {
    const keyHash = getKeyHash(apiKey);
    const today = getTodayDateGMT2();
    const usageKey = `mailtester:usage:${keyHash}:${today}`;
    
    await redisClient.incr(usageKey);
    // Expire after 48 hours
    await redisClient.expire(usageKey, 48 * 60 * 60);
  } catch (err) {
    // Don't fail verification if tracking fails
    console.error('Usage tracking error:', err.message);
  }
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
// DISTRIBUTED RATE LIMITER WITH REDIS
// ============================================
// Ensures rate limits are shared across all worker instances
// 170 requests / 30 seconds = ~176ms per request

class DistributedRateLimiter {
  constructor(redisClient, requestsPerWindow, windowMs) {
    this.redis = redisClient;
    this.requestsPerWindow = requestsPerWindow; // 165
    this.windowMs = windowMs; // 30000
    this.minSpacingMs = Math.ceil(windowMs / requestsPerWindow) + 10; // ~192ms
    this.key = 'mailtester:rate_limit';
  }

  async acquire() {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowKey = `${this.key}:${windowStart}`;
    
    // Check current count BEFORE incrementing to prevent exceeding limit
    const currentCountStr = await this.redis.get(windowKey);
    const currentCount = currentCountStr ? parseInt(currentCountStr) : 0;
    
    // If we're at or over the limit, wait for next window
    if (currentCount >= this.requestsPerWindow) {
      const nextWindow = windowStart + this.windowMs;
      const waitTime = nextWindow - Date.now() + 100; // +100ms buffer
      
      if (waitTime > 0) {
        console.log(`Rate limit reached (${currentCount}/${this.requestsPerWindow}). Waiting ${Math.ceil(waitTime/1000)}s for next window...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Retry in next window
        return this.acquire();
      }
    }
    
    // Now increment (we know we're under the limit)
    const count = await this.redis.incr(windowKey);
    
    // Set expiration on first request in window
    if (count === 1) {
      await this.redis.expire(windowKey, Math.ceil(this.windowMs / 1000) + 1);
    }
    
    // Double-check after increment (in case of race condition with other workers)
    if (count > this.requestsPerWindow) {
      // We exceeded - decrement and wait
      await this.redis.decr(windowKey);
      const nextWindow = windowStart + this.windowMs;
      const waitTime = nextWindow - Date.now() + 100;
      
      if (waitTime > 0) {
        console.log(`Rate limit exceeded after increment (${count}/${this.requestsPerWindow}). Waiting ${Math.ceil(waitTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.acquire();
      }
    }
    
    // Enforce minimum spacing between requests (using Redis for coordination)
    const lastRequestKey = `${this.key}:last_request`;
    const lastRequestTimeStr = await this.redis.get(lastRequestKey);
    
    if (lastRequestTimeStr) {
      const lastRequestTime = parseInt(lastRequestTimeStr);
      if (!isNaN(lastRequestTime)) {
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < this.minSpacingMs) {
          const waitTime = this.minSpacingMs - timeSinceLastRequest;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // Update last request time
    await this.redis.set(lastRequestKey, Date.now().toString(), 'EX', Math.ceil(this.windowMs / 1000));
  }

  async getStatus() {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowKey = `${this.key}:${windowStart}`;
    const countStr = await this.redis.get(windowKey);
    const count = countStr ? parseInt(countStr) : 0;
    
    return {
      availableTokens: this.requestsPerWindow - count,
      maxTokens: this.requestsPerWindow,
      currentCount: count,
    };
  }
}

// Create the distributed rate limiter instance (165 per 30 seconds, ~192ms spacing)
// Note: rateLimiter will be initialized after Redis client is connected
let rateLimiter;

// Rate limit function
async function rateLimit() {
  // Wait for rate limiter to be initialized if Redis connection is still pending
  while (!rateLimiter) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await rateLimiter.acquire();
}

// Verify email using MailTester API with retry logic (with rate limiting)
async function verifyEmail(email, retryCount = 0) {
  const MAX_RETRIES = 3;
  
  await rateLimit();
  
  try {
    const response = await axios.get(MAILTESTER_BASE_URL, {
      params: {
        email: email,
        key: MAILTESTER_API_KEY,
      },
      timeout: 30000, // 30 second timeout
    });
    
    // Track API usage after successful call
    await trackApiUsage(MAILTESTER_API_KEY);
    
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
    await trackApiUsage(MAILTESTER_API_KEY);
    
    // Handle 429 Too Many Requests with exponential backoff
    if (error.response?.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
        console.log(`429 rate limited for ${email}, retrying in ${backoffMs/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return verifyEmail(email, retryCount + 1);
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
    
    // Retry once on network errors
    if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && retryCount < MAX_RETRIES) {
      console.log(`Network error for ${email}, retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return verifyEmail(email, retryCount + 1);
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

// Verify email without rate limiting (for verification jobs with manual timing control)
async function verifyEmailWithoutRateLimit(email, retryCount = 0) {
  const MAX_RETRIES = 3;
  
  try {
    const response = await axios.get(MAILTESTER_BASE_URL, {
      params: {
        email: email,
        key: MAILTESTER_API_KEY,
      },
      timeout: 30000, // 30 second timeout
    });
    
    // Track API usage after successful call
    await trackApiUsage(MAILTESTER_API_KEY);
    
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
    await trackApiUsage(MAILTESTER_API_KEY);
    
    // Handle 429 Too Many Requests with exponential backoff
    if (error.response?.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
        console.log(`429 rate limited for ${email}, retrying in ${backoffMs/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return verifyEmailWithoutRateLimit(email, retryCount + 1);
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
    
    // Retry once on network errors
    if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && retryCount < MAX_RETRIES) {
      console.log(`Network error for ${email}, retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return verifyEmailWithoutRateLimit(email, retryCount + 1);
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
console.log(`Rate limit: 165 requests per 30 seconds (~192ms spacing between calls)`);
console.log(`Using distributed Redis-based rate limiter for multi-worker coordination`);

// Simple Redis list poller
async function pollSimpleQueue() {
  const queueName = 'simple-email-verification-queue';
  
  console.log(`\n[${new Date().toISOString()}] Starting simple queue poller for: ${queueName}`);
  
  while (true) {
    try {
      // Blocking pop from Redis list (waits up to 5 seconds)
      const result = await redisClient.brPop(queueName, 5);
      
      if (result && result.element) {
        const jobIdStr = result.element;
        console.log(`\n[${new Date().toISOString()}] ✅ Got job from queue: ${jobIdStr}`);
        
        try {
          await processJobFromQueue(jobIdStr);
          console.log(`\n[${new Date().toISOString()}] ✅ Job ${jobIdStr} completed successfully`);
        } catch (error) {
          console.error(`\n[${new Date().toISOString()}] ❌ Error processing job ${jobIdStr}:`, error.message);
          console.error('Stack:', error.stack);
          // Job will remain in failed state, continue processing other jobs
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
      
      await updateLeadStatus(lead.id, result.status, result.message, result.mx, result.provider);
      
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
      await updateLeadStatus(lead.id, 'error', error.message);
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
async function isJobCancelled(jobId) {
  const result = await pgPool.query(
    'SELECT status FROM jobs WHERE id = $1',
    [jobId]
  );
  return result.rows.length > 0 && result.rows[0].status === 'cancelled';
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
      const PROGRESS_INTERVAL_MS = 3000; // Update progress every 3 seconds
      
      // Use distributed rate limiter (coordinates across all jobs and workers)
      console.log(`Starting verification with distributed rate limiter: ${totalLeads} leads`);
      
      for (let i = 0; i < leads.length; i++) {
        // Check if job was cancelled before processing lead
        if (await isJobCancelled(jobId)) {
          console.log(`Job ${jobId} was cancelled, stopping processing...`);
          await updateJobStatus(jobId, 'cancelled');
          return { status: 'cancelled', message: 'Job was cancelled during processing' };
        }
        
        const lead = leads[i];
        
        try {
          // Skip leads with empty or null emails
          if (!lead.email || lead.email.trim() === '') {
            console.log(`Skipping lead ${lead.id} - empty email`);
            await updateLeadStatus(lead.id, 'error', 'Empty email address');
            processedCount++;
            continue;
          }
          
          // Verify email (with distributed rate limiter - coordinates across all jobs)
          const result = await verifyEmail(lead.email);
          
          await updateLeadStatus(lead.id, result.status, result.message, result.mx, result.provider);
          
          if (result.status === 'valid') {
            validCount++;
            finalResultIds.push(lead.id);
          } else if (result.status === 'catchall') {
            catchallCount++;
            finalResultIds.push(lead.id);
          } else if (result.status === 'invalid') {
            finalResultIds.push(lead.id);
          }
          
          processedCount++;
          
          // Update progress every 3 seconds
          if (Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS) {
            const progressPercent = Math.round((processedCount / totalLeads) * 100);
            await updateJobStatus(jobId, 'processing', {
              processed_leads: processedCount,
              valid_emails_found: validCount,
              catchall_emails_found: catchallCount,
            });
            lastProgressUpdate = Date.now();
            console.log(`Progress: ${processedCount}/${totalLeads} (${progressPercent}%) | Valid: ${validCount} | Catchall: ${catchallCount}`);
          }
          
        } catch (error) {
          console.error(`Error processing lead ${lead.id}:`, error.message);
          await updateLeadStatus(lead.id, 'error', error.message);
          processedCount++;
        }
      }
      
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
      
      console.log(`\n========================================`);
      console.log(`Verification job ${jobId} completed successfully!`);
      console.log(`Final results: ${validCount} valid, ${catchallCount} catchall, ${processedCount} total processed`);
      console.log(`Credits charged: ${costInCredits} (1 per lead)`);
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
    console.log(`Enrichment job detected - using permutation logic with early exit`);
    
    // Get all leads for this job
    const leadsResult = await pgPool.query(
      'SELECT * FROM leads WHERE job_id = $1 ORDER BY prevalence_score DESC',
      [jobId]
    );
    
    const leads = leadsResult.rows;
    const totalPermutations = leads.length;
    
    // Get unique people count from job (not permutations)
    const uniquePeopleCount = jobData.total_leads;
    
    console.log(`Found ${totalPermutations} email permutations to verify for ${uniquePeopleCount} unique people`);
    
    if (totalPermutations === 0) {
      await updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
      });
      return { status: 'completed', message: 'No leads to process' };
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
    
    // Convert to array for batch processing
    const peopleArray = Array.from(leadsByPerson.entries());
    
    console.log(`Grouped into ${peopleArray.length} unique people - processing in parallel batches of 10`);
    
    let completedPeopleCount = 0;
    let validCount = 0;
    let catchallCount = 0;
    let totalApiCalls = 0;
    let savedApiCalls = 0;
    const finalResultIds = [];
    let lastProgressUpdate = Date.now();
    const PROGRESS_INTERVAL_MS = 3000; // Update progress every 3 seconds
    
    // Process people in parallel batches of 10
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < peopleArray.length; i += BATCH_SIZE) {
      // Check if job was cancelled before processing batch
      if (await isJobCancelled(jobId)) {
        console.log(`Job ${jobId} was cancelled, stopping processing...`);
        await updateJobStatus(jobId, 'cancelled');
        return { status: 'cancelled', message: 'Job was cancelled during processing' };
      }
      
      const batch = peopleArray.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(peopleArray.length / BATCH_SIZE);
      
      console.log(`\n--- Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} people in parallel ---`);
      
      // Process all people in this batch simultaneously
      // Each person still does early-exit internally, but multiple people run in parallel
      const batchPromises = batch.map(([personKey, personLeads]) => 
        processPersonWithEarlyExit(personKey, personLeads)
      );
      
      // Wait for all people in batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Aggregate results from batch
      for (const result of batchResults) {
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
      }
      
      // Check if job was cancelled after batch completes
      if (await isJobCancelled(jobId)) {
        console.log(`Job ${jobId} was cancelled, stopping processing...`);
        await updateJobStatus(jobId, 'cancelled');
        return { status: 'cancelled', message: 'Job was cancelled during processing' };
      }
      
      // Update progress after each batch (or if 3 seconds have passed)
      if (Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS || i + BATCH_SIZE >= peopleArray.length) {
        const progressPercent = Math.round((completedPeopleCount / uniquePeopleCount) * 100);
        
        await updateJobStatus(jobId, 'processing', {
          processed_leads: completedPeopleCount,
          valid_emails_found: validCount,
          catchall_emails_found: catchallCount,
        });
        lastProgressUpdate = Date.now();
        
        const rlStatus = await rateLimiter.getStatus();
        console.log(`Progress: ${completedPeopleCount}/${uniquePeopleCount} people (${progressPercent}%) | API calls: ${totalApiCalls} | Saved: ${savedApiCalls} | Tokens: ${rlStatus.availableTokens}/${rlStatus.maxTokens}`);
      }
    }
    
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
    
    console.log(`\n========================================`);
    console.log(`Job ${jobId} completed successfully!`);
    console.log(`Final results: ${validCount} valid, ${catchallCount} catchall`);
    console.log(`Credits charged: ${costInCredits} (1 per lead)`);
    console.log(`Total API calls: ${totalApiCalls} (saved ${savedApiCalls} calls with early exit)`);
    if (totalApiCalls + savedApiCalls > 0) {
      console.log(`Efficiency: ${Math.round((savedApiCalls / (totalApiCalls + savedApiCalls)) * 100)}% reduction in API calls`);
    }
    console.log(`========================================\n`);
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    await updateJobStatus(jobId, 'failed');
    throw error;
  }
}

// Start simple queue poller
pollSimpleQueue().catch(console.error);
