const { Worker } = require('bullmq');
const axios = require('axios');
const redis = require('redis');
require('dotenv').config();

const connection = {
  host: process.env.REDIS_URL.split('://')[1].split(':')[0] || 'localhost',
  port: process.env.REDIS_URL.split(':')[2] || 6379,
};

const worker = new Worker(
  'email-verification',
  async (job) => {
    const { jobId, leads } = job.data;

    

    console.log(`Processing job ${jobId} with ${leads.length} leads`);

    

    let processedCount = 0;
    const totalLeads = leads.length;

    

    for (const lead of leads) {
      try {
        // Simulate verification (in production, call MailTester API)
        const response = await axios.get(process.env.MAILTESTER_API_KEY ? 
          `https://happy.mailtester.ninja/ninja?email=${lead.email}&key=${process.env.MAILTESTER_API_KEY}` :
          null
        );

        

        console.log(`Verified: ${lead.email}`);
        processedCount++;

        

        await job.updateProgress((processedCount / totalLeads) * 100);
      } catch (error) {
        console.error(`Error verifying ${lead.email}:`, error.message);
      }
    }

    

    return { status: 'completed', processedCount };
  },
  {
    connection,
    limiter: {
      max: 170,
      duration: 30000,
    },
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

console.log('Worker started, waiting for jobs...');

