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
redisClient.connect().catch(console.error);

// PostgreSQL connection pool
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

// MailTester API configuration
const MAILTESTER_BASE_URL = process.env.MAILTESTER_BASE_URL || 'https://happy.mailtester.ninja/ninja';
const MAILTESTER_API_KEY = process.env.MAILTESTER_API_KEY;

// ============================================
// SERIALIZED RATE LIMITER WITH SPACING
// ============================================
// Ensures minimum 180ms between API calls to prevent bursting
// 170 requests / 30 seconds = ~176ms per request

class SerializedRateLimiter {
  constructor(requestsPerWindow, windowMs) {
    this.requestsPerWindow = requestsPerWindow;  // 170 requests
    this.windowMs = windowMs;                     // 30000ms (30 seconds)
    this.minSpacingMs = Math.ceil(windowMs / requestsPerWindow) + 10; // ~187ms
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.queue = [];
    this.processing = false;
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      
      // Check if window has reset
      if (now - this.windowStart >= this.windowMs) {
        this.requestCount = 0;
        this.windowStart = now;
      }
      
      // Check if we've hit the window limit
      if (this.requestCount >= this.requestsPerWindow) {
        const waitTime = this.windowMs - (now - this.windowStart) + 100;
        console.log(`Rate limit: Window limit reached, waiting ${Math.ceil(waitTime/1000)}s for reset...`);
        await new Promise(r => setTimeout(r, waitTime));
        this.requestCount = 0;
        this.windowStart = Date.now();
        continue;
      }
      
      // Enforce minimum spacing between requests
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minSpacingMs) {
        await new Promise(r => setTimeout(r, this.minSpacingMs - timeSinceLastRequest));
      }
      
      // Grant the request
      this.lastRequestTime = Date.now();
      this.requestCount++;
      const resolve = this.queue.shift();
      resolve();
    }

    this.processing = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  getStatus() {
    return {
      availableTokens: this.requestsPerWindow - this.requestCount,
      queueLength: this.queue.length,
      maxTokens: this.requestsPerWindow,
      minSpacingMs: this.minSpacingMs,
    };
  }
}

// Create the rate limiter instance (170 per 30 seconds, ~187ms spacing)
const rateLimiter = new SerializedRateLimiter(170, 30000);

// Rate limit function
async function rateLimit() {
  await rateLimiter.acquire();
}

// Verify email using MailTester API with retry logic
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
    
    const code = response.data?.code || 'ko';
    const message = response.data?.message || '';
    
    let status = 'invalid';
    if (code === 'ok') {
      status = 'valid';
    } else if (code === 'mb' || message.toLowerCase().includes('catch')) {
      status = 'catchall';
    }
    
    return {
      status,
      message,
      mx: response.data?.mx || '',
    };
  } catch (error) {
    // Handle 429 Too Many Requests with exponential backoff
    if (error.response?.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
        console.log(`429 rate limited for ${email}, retrying in ${backoffMs/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return verifyEmail(email, retryCount + 1);
      }
      console.error(`Max retries exceeded for ${email}`);
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
async function updateLeadStatus(leadId, status, message = '') {
  await pgPool.query(
    'UPDATE leads SET verification_status = $1 WHERE id = $2',
    [status, leadId]
  );
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
    
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    
    // Get all leads for this job
    const leadsResult = await pgPool.query(
      'SELECT * FROM leads WHERE job_id = $1 ORDER BY prevalence_score DESC',
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
    
    // Process leads in batches
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      // Process batch in parallel (respecting rate limit)
      const batchPromises = batch.map(async (lead) => {
        try {
          const result = await verifyEmail(lead.email);
          
          await updateLeadStatus(lead.id, result.status, result.message);
          
          if (result.status === 'valid') {
            validCount++;
          } else if (result.status === 'catchall') {
            catchallCount++;
          }
          
          processedCount++;
          
          // Update job progress every 10 leads
          if (processedCount % 10 === 0) {
            await updateJobStatus(jobId, 'processing', {
              processed_leads: processedCount,
              valid_emails_found: validCount,
              catchall_emails_found: catchallCount,
            });
            
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
    
    // Apply deduplication
    console.log('Applying deduplication...');
    const allLeads = await pgPool.query(
      'SELECT * FROM leads WHERE job_id = $1',
      [jobId]
    );
    
    const finalResults = deduplicateLeads(allLeads.rows);
    
    // Mark final results in database
    const finalResultIds = [];
    
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
    const finalValidCount = finalResults.filter(r => r.verification_status === 'valid').length;
    const finalCatchallCount = finalResults.filter(r => r.verification_status === 'catchall').length;
    
    // Calculate cost
    const costInCredits = finalValidCount + finalCatchallCount;
    
    // Mark job as completed
    await updateJobStatus(jobId, 'completed', {
      processed_leads: processedCount,
      valid_emails_found: finalValidCount,
      catchall_emails_found: finalCatchallCount,
      cost_in_credits: costInCredits,
      completed_at: new Date(),
    });
    
    // Deduct credits
    if (costInCredits > 0) {
      await pgPool.query(
        'UPDATE users SET credits = credits - $1 WHERE id = $2',
        [costInCredits, jobData.user_id]
      );
    }
    
    console.log(`Job ${jobId} completed successfully!`);
    console.log(`Final results: ${finalValidCount} valid, ${finalCatchallCount} catchall`);
    
      return {
        status: 'completed',
        processedCount: uniquePeopleCount,
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
console.log(`Rate limit: 170 requests per 30 seconds (~187ms spacing between calls)`);

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
  
  // Process permutations one by one (in order of prevalence score)
  for (const lead of personLeads) {
    try {
      const result = await verifyEmail(lead.email);
      apiCalls++;
      permutationsVerified++;
      
      await updateLeadStatus(lead.id, result.status, result.message);
      
      if (result.status === 'valid') {
        // *** EARLY EXIT: Found valid email! ***
        finalLeadId = lead.id;
        validFound = 1;
        foundValid = true;
        resultType = 'valid';
        
        // Calculate how many API calls we saved
        const remainingPermutations = personLeads.length - permutationsVerified;
        savedCalls = remainingPermutations;
        
        console.log(`  ✓ VALID found for ${personKey} on permutation ${permutationsVerified}/${personLeads.length} - skipping ${remainingPermutations} remaining`);
        break; // Stop verifying this person's remaining permutations
        
      } else if (result.status === 'catchall') {
        // Track best catchall (we already sorted by prevalence, so first catchall is best)
        if (!bestCatchall) {
          bestCatchall = lead;
        }
        catchallFound++;
      }
      // If invalid or error, continue to next permutation
      
    } catch (error) {
      console.error(`Error processing lead ${personLeads[0]?.id}:`, error.message);
      await updateLeadStatus(personLeads[0]?.id, 'error', error.message);
      apiCalls++;
      permutationsVerified++;
    }
  }
  
  // If no valid found, use best catchall or mark as not_found
  if (!foundValid) {
    if (bestCatchall) {
      finalLeadId = bestCatchall.id;
      resultType = 'catchall';
      console.log(`  ~ CATCHALL selected for ${personKey} (verified all ${permutationsVerified} permutations)`);
    } else {
      // No valid or catchall found - mark first lead as not_found
      finalLeadId = personLeads[0].id;
      resultType = 'not_found';
      console.log(`  ✗ NOT_FOUND for ${personKey} (verified all ${permutationsVerified} permutations)`);
    }
  }
  
  return {
    personKey,
    finalLeadId,
    resultType,
    validFound,
    catchallFound,
    apiCalls,
    savedCalls,
  };
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
    
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    
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
    
    // Process people in parallel batches of 10
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < peopleArray.length; i += BATCH_SIZE) {
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
      
      // Update progress after each batch
      const progressPercent = Math.round((completedPeopleCount / uniquePeopleCount) * 100);
      
      await updateJobStatus(jobId, 'processing', {
        processed_leads: completedPeopleCount,
        valid_emails_found: validCount,
        catchall_emails_found: catchallCount,
      });
      
      const rlStatus = rateLimiter.getStatus();
      console.log(`Progress: ${completedPeopleCount}/${uniquePeopleCount} people (${progressPercent}%) | API calls: ${totalApiCalls} | Saved: ${savedApiCalls} | Tokens: ${rlStatus.availableTokens}/${rlStatus.maxTokens}`);
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
    
    // Calculate cost (only charged for valid + catchall results)
    const costInCredits = validCount + catchallCount;
    
    // Mark job as completed
    await updateJobStatus(jobId, 'completed', {
      processed_leads: uniquePeopleCount,
      valid_emails_found: validCount,
      catchall_emails_found: catchallCount,
      cost_in_credits: costInCredits,
      completed_at: new Date(),
    });
    
    // Deduct credits
    if (costInCredits > 0) {
      await pgPool.query(
        'UPDATE users SET credits = credits - $1 WHERE id = $2',
        [costInCredits, jobData.user_id]
      );
    }
    
    console.log(`\n========================================`);
    console.log(`Job ${jobId} completed successfully!`);
    console.log(`Final results: ${validCount} valid, ${catchallCount} catchall`);
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
