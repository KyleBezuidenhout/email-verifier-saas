"use client";

import { Job } from "@/types";

interface QuickStatsProps {
  jobs: Job[];
}

export function QuickStats({ jobs }: QuickStatsProps) {
  const totalVerified = jobs.reduce(
    (sum, job) => sum + (job.valid_emails_found || 0) + (job.catchall_emails_found || 0),
    0
  );
  
  const totalCost = jobs.reduce((sum, job) => sum + (job.cost_in_credits || 0) * 0.1, 0);
  
  const completedJobs = jobs.filter(j => j.status === "completed");
  const avgProcessingTime = completedJobs.length > 0 
    ? completedJobs.reduce((sum, job) => {
        if (job.completed_at && job.created_at) {
          const start = new Date(job.created_at).getTime();
          const end = new Date(job.completed_at).getTime();
          return sum + (end - start) / 1000 / 60; // minutes
        }
        return sum;
      }, 0) / completedJobs.length
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">Total Verified</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          {totalVerified.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">emails found</div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">Total Cost</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          ${totalCost.toFixed(2)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">spent</div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">Avg Speed</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          {avgProcessingTime > 0 ? `${avgProcessingTime.toFixed(1)}` : "—"}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">minutes per job</div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">Uptime</div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
          99.9%
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">guaranteed</div>
      </div>
    </div>
  );
}

