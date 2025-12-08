"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { JobTable } from "@/components/dashboard/JobTable";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import Link from "next/link";
import { useSSE } from "@/hooks/useSSE";
import { JobProgress } from "@/types";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const jobList = await apiClient.getJobs();
      setJobs(jobList.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      await apiClient.deleteJob(jobId);
      setJobs(jobs.filter((j) => j.id !== jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job");
    }
  };

  // Real-time progress updates via SSE
  const handleProgressUpdate = (progress: JobProgress) => {
    setJobs((prevJobs) =>
      prevJobs.map((job) =>
        job.id === progress.job_id
          ? {
              ...job,
              processed_leads: progress.processed_leads,
              total_leads: progress.total_leads,
              valid_emails_found: progress.valid_emails_found,
              catchall_emails_found: progress.catchall_emails_found,
              status: progress.status as 'pending' | 'processing' | 'completed' | 'failed',
            }
          : job
      )
    );
  };

  // Get token from cookie for SSE
  const getToken = () => {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie.split(";");
    const tokenCookie = cookies.find((c) => c.trim().startsWith("token="));
    return tokenCookie ? tokenCookie.split("=")[1] : null;
  };

  // Connect SSE for processing jobs
  const processingJobs = jobs.filter((j) => j.status === "processing");
  const firstProcessingJob = processingJobs.length > 0 ? processingJobs[0] : null;
  
  useSSE(
    firstProcessingJob?.id || null,
    getToken(),
    handleProgressUpdate,
    (err) => console.error("SSE error:", err)
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Manage and monitor your email verification jobs
          </p>
        </div>
        <Link
          href="/upload"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Upload CSV
        </Link>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <JobTable jobs={jobs} onDelete={handleDelete} />
    </div>
  );
}

