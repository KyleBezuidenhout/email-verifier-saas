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

// Rate limiting: 170 emails per 30 seconds
const RATE_LIMIT = {
  max: 170,
  window: 30000, // 30 seconds in milliseconds
};

// Track rate limit
let requestCount = 0;
let windowStart = Date.now();

// Rate limiter function
async function rateLimit() {
  const now = Date.now();
  
  // Reset window if expired
  if (now - windowStart >= RATE_LIMIT.window) {
    requestCount = 0;
    windowStart = now;
  }
  
  // Wait if limit reached
  if (requestCount >= RATE_LIMIT.max) {
    const waitTime = RATE_LIMIT.window - (now - windowStart);
    console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, waitTime + 100)); // Add 100ms buffer
    requestCount = 0;
    windowStart = Date.now();
  }
  
  requestCount++;
}

// Verify email using MailTester API
async function verifyEmail(email) {
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
    console.error(`Error verifying ${email}:`, error.message);
    // Retry once on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      return verifyEmail(email); // Retry
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
console.log(`Rate limit: ${RATE_LIMIT.max} requests per ${RATE_LIMIT.window / 1000} seconds`);

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

// Process job from simple queue (extracted logic)
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
    
    let processedPermutations = 0;
    let validCount = 0;
    let catchallCount = 0;
    const completedUniquePeople = new Set(); // Track unique people completed
    
    // Process leads in batches
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      // Process batch in parallel (respecting rate limit)
      const batchPromises = batch.map(async (lead) => {
        try {
          const result = await verifyEmail(lead.email);
          
          await updateLeadStatus(lead.id, result.status, result.message);
          
          // Mark this unique person as processed (regardless of result)
          const personKey = `${lead.first_name.toLowerCase()}_${lead.last_name.toLowerCase()}_${lead.domain.toLowerCase()}`;
          const wasNewPerson = !completedUniquePeople.has(personKey);
          
          if (result.status === 'valid') {
            validCount++;
            completedUniquePeople.add(personKey);
          } else if (result.status === 'catchall') {
            catchallCount++;
            completedUniquePeople.add(personKey);
          } else {
            // Even if invalid, mark person as processed for progress tracking
            completedUniquePeople.add(personKey);
          }
          
          processedPermutations++;
          
          // Calculate progress based on unique people (not permutations)
          const uniquePeopleProcessed = completedUniquePeople.size;
          const progressPercent = Math.round((uniquePeopleProcessed / uniquePeopleCount) * 100);
          
          // Update job progress every 10 permutations or when a new unique person is completed
          if (processedPermutations % 10 === 0 || wasNewPerson) {
            await updateJobStatus(jobId, 'processing', {
              processed_leads: uniquePeopleProcessed, // Show unique people, not permutations
              valid_emails_found: validCount,
              catchall_emails_found: catchallCount,
            });
            
            console.log(`Progress: ${uniquePeopleProcessed}/${uniquePeopleCount} unique people (${progressPercent}%) - ${processedPermutations}/${totalPermutations} permutations verified`);
          }
        } catch (error) {
          console.error(`Error processing lead ${lead.id}:`, error.message);
          await updateLeadStatus(lead.id, 'error', error.message);
          processedPermutations++;
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    // Final progress update - use unique people count
    const finalUniquePeopleProcessed = completedUniquePeople.size;
    await updateJobStatus(jobId, 'processing', {
      processed_leads: finalUniquePeopleProcessed,
      valid_emails_found: validCount,
      catchall_emails_found: catchallCount,
    });
    
    console.log(`Verification complete. Valid: ${validCount}, Catchall: ${catchallCount}, Processed: ${finalUniquePeopleProcessed}/${uniquePeopleCount} unique people`);
    
    // Apply deduplication
    console.log('Applying deduplication...');
    const allLeads = await pgPool.query(
      'SELECT * FROM leads WHERE job_id = $1',
      [jobId]
    );
    
    const finalResults = deduplicateLeads(allLeads.rows);
    
    // Mark final results
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
    
    // Mark job as completed - use unique people count
    await updateJobStatus(jobId, 'completed', {
      processed_leads: uniquePeopleCount, // All unique people completed
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
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    await updateJobStatus(jobId, 'failed');
    throw error;
  }
}

// Start simple queue poller
pollSimpleQueue().catch(console.error);
