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

// Create Redis client for queue polling
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

// Vayne API configuration
const VAYNE_API_KEY = process.env.VAYNE_API_KEY;
const VAYNE_API_BASE_URL = process.env.VAYNE_API_BASE_URL || 'https://www.vayne.io';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://www.billionverifier.io';

// Admin email (skip credit deduction)
const ADMIN_EMAIL = 'ben@superwave.io';

// Queue name
const QUEUE_NAME = 'vayne-order-queue';

// Poll interval (check queue every 2 seconds)
const POLL_INTERVAL_MS = 2000;

// ============================================
// VAYNE API CLIENT
// ============================================

async function vayneRequest(method, endpoint, data = null) {
  const url = `${VAYNE_API_BASE_URL}${endpoint}`;
  const config = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${VAYNE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  };
  
  if (data) {
    config.data = data;
  }
  
  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`Vayne API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function updateVayneCookie(liAtCookie) {
  console.log('Updating Vayne LinkedIn cookie...');
  const response = await vayneRequest('PATCH', '/api/linkedin_authentication', {
    li_at_cookie: liAtCookie,
  });
  console.log('✅ Vayne cookie updated successfully');
  return response;
}

async function createVayneOrder(orderData) {
  console.log('Creating Vayne order...');
  const response = await vayneRequest('POST', '/api/orders', {
    url: orderData.sales_nav_url,
    export_format: orderData.export_format,
    only_qualified: orderData.only_qualified,
    secondary_webhook: orderData.webhook_url,
  });
  
  // Extract order from nested response
  const order = response.order || response;
  
  // Convert numeric ID to string
  if (order.id) {
    order.id = String(order.id);
  }
  
  console.log(`✅ Vayne order created: ${order.id}`);
  return order;
}

// ============================================
// DATABASE HELPERS
// ============================================

async function getOrder(orderId) {
  const result = await pgPool.query(
    'SELECT * FROM vayne_orders WHERE id = $1',
    [orderId]
  );
  return result.rows[0];
}

async function updateOrderStatus(orderId, status, updates = {}) {
  const setClauses = ['status = $1'];
  const values = [status];
  let paramIndex = 2;
  
  if (updates.vayne_order_id) {
    setClauses.push(`vayne_order_id = $${paramIndex}`);
    values.push(updates.vayne_order_id);
    paramIndex++;
  }
  
  if (updates.leads_found !== undefined) {
    setClauses.push(`leads_found = $${paramIndex}`);
    values.push(updates.leads_found);
    paramIndex++;
  }
  
  if (updates.progress_percentage !== undefined) {
    setClauses.push(`progress_percentage = $${paramIndex}`);
    values.push(updates.progress_percentage);
    paramIndex++;
  }
  
  if (updates.completed_at) {
    setClauses.push(`completed_at = $${paramIndex}`);
    values.push(updates.completed_at);
    paramIndex++;
  }
  
  values.push(orderId);
  
  await pgPool.query(
    `UPDATE vayne_orders SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

async function deductCredits(userId, amount, isAdmin) {
  if (isAdmin || amount <= 0) {
    return;
  }
  
  await pgPool.query(
    'UPDATE users SET credits = GREATEST(0, credits - $1) WHERE id = $2',
    [amount, userId]
  );
  console.log(`Deducted ${amount} credits from user ${userId}`);
}

// ============================================
// ORDER PROCESSING
// ============================================

async function processOrder(orderId) {
  console.log(`\n========================================`);
  console.log(`Processing Vayne order: ${orderId}`);
  console.log(`========================================`);
  
  try {
    // Get order from database
    const order = await getOrder(orderId);
    
    if (!order) {
      console.error(`Order ${orderId} not found in database`);
      return;
    }
    
    // Check if order is already completed or failed
    if (order.status === 'completed' || order.status === 'failed') {
      console.log(`Order ${orderId} is already ${order.status}, skipping`);
      return;
    }
    
    // Check if user is admin
    const userResult = await pgPool.query('SELECT email FROM users WHERE id = $1', [order.user_id]);
    const userEmail = userResult.rows[0]?.email;
    const isAdmin = userEmail === ADMIN_EMAIL;
    
    // Update status to processing
    await updateOrderStatus(orderId, 'processing');
    
    // Step 1: Update Vayne cookie (required before creating order)
    if (!order.linkedin_cookie) {
      throw new Error('LinkedIn cookie is required but not found in order');
    }
    
    await updateVayneCookie(order.linkedin_cookie);
    
    // Step 2: Create Vayne order
    const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks/vayne/orders`;
    const vayneOrder = await createVayneOrder({
      sales_nav_url: order.sales_nav_url,
      export_format: order.export_format,
      only_qualified: order.only_qualified,
      webhook_url: webhookUrl,
    });
    
    // Step 3: Map Vayne status to our status
    const scrapingStatus = vayneOrder.scraping_status || 'initialization';
    const statusMapping = {
      'initialization': 'pending',
      'scraping': 'processing',
      'finished': 'completed',
      'failed': 'failed',
    };
    const mappedStatus = statusMapping[scrapingStatus] || 'pending';
    
    // Step 4: Update order in database with Vayne order ID
    const estimatedLeads = order.leads_found || 0;
    await updateOrderStatus(orderId, mappedStatus, {
      vayne_order_id: vayneOrder.id,
      leads_found: vayneOrder.total || estimatedLeads,
    });
    
    // Step 5: Deduct credits (if not admin and not already deducted)
    // Note: Credits are deducted when order is created in backend, but we check here too
    if (mappedStatus === 'pending' || mappedStatus === 'processing') {
      // Order is now with Vayne - webhooks will update status
      console.log(`✅ Order ${orderId} submitted to Vayne (ID: ${vayneOrder.id})`);
      console.log(`   Status: ${mappedStatus}`);
      console.log(`   Estimated leads: ${vayneOrder.total || estimatedLeads}`);
      console.log(`   Webhooks will handle status updates`);
    }
    
    console.log(`\n========================================`);
    console.log(`Order ${orderId} processed successfully`);
    console.log(`========================================\n`);
    
  } catch (error) {
    console.error(`Error processing order ${orderId}:`, error);
    await updateOrderStatus(orderId, 'failed');
    throw error;
  }
}

// ============================================
// QUEUE POLLER
// ============================================

async function pollQueue() {
  if (!redisClient.isReady) {
    console.log('Redis not ready, waiting...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    return;
  }
  
  try {
    // Pop order ID from queue (blocking pop with 1 second timeout)
    const orderId = await redisClient.brPop(
      redisClient.commandOptions({ isolated: true }),
      QUEUE_NAME,
      1
    );
    
    if (orderId && orderId.element) {
      const orderIdStr = orderId.element;
      console.log(`\n📦 Got order from queue: ${orderIdStr}`);
      
      // Process order
      await processOrder(orderIdStr);
    }
  } catch (error) {
    console.error('Error polling queue:', error);
  }
  
  // Continue polling
  setTimeout(pollQueue, POLL_INTERVAL_MS);
}

// ============================================
// HEALTH CHECK SERVER
// ============================================

const HEALTH_PORT = process.env.PORT || 8080;

const healthServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'sales-nav-worker',
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
  console.log(`✅ Sales Nav Worker started`);
  console.log(`✅ Health check server running on port ${HEALTH_PORT}`);
  console.log(`✅ Polling queue: ${QUEUE_NAME}`);
  console.log(`✅ Vayne API: ${VAYNE_API_BASE_URL}`);
  console.log(`\nWaiting for orders...\n`);
});

// Start queue poller
pollQueue().catch(console.error);

