"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { JobTable } from "@/components/dashboard/JobTable";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorModal } from "@/components/common/ErrorModal";
import { DropZone } from "@/components/upload/DropZone";
import { FilePreview, ColumnMapping } from "@/components/upload/FilePreview";
import { formatFileSize } from "@/lib/utils";
import { useSSE } from "@/hooks/useSSE";
import { JobProgress } from "@/types";

export default function VerifyEmailsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  
  // Upload-related state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);
  
  // Error modal state
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState("");

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      // Only get verification jobs
      const jobList = await apiClient.getJobs('verification');
      setJobs(jobList.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs to last 30 days
  const filteredJobs = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return jobs.filter(job => new Date(job.created_at) >= thirtyDaysAgo);
  }, [jobs]);

  const handleDelete = async (jobId: string) => {
    try {
      await apiClient.deleteJob(jobId);
      setJobs(jobs.filter((j) => j.id !== jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job");
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await apiClient.cancelJob(jobId);
      // Reload jobs to get updated status
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel job");
    }
  };

  // Upload-related handlers
  const handleMappingChange = useCallback((mapping: ColumnMapping, isValid: boolean) => {
    setColumnMapping(mapping);
    setIsMappingValid(isValid);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !isMappingValid || !columnMapping) {
      setUploadError("Please map all required columns before uploading");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError("File size must be less than 10MB");
      return;
    }

    // Verify that email column is mapped
    if (!columnMapping.email) {
      setUploadError("Email column is required for verification");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const response = await apiClient.uploadVerifyFile(selectedFile, {
        column_email: columnMapping.email,
        column_first_name: columnMapping.first_name,
        column_last_name: columnMapping.last_name,
      });
      
      // Reset upload state
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      
      // Refresh jobs list
      await loadJobs();
      
      // Don't redirect - let user stay on verify-emails page to see the job in the list
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setErrorModalMessage(errorMessage);
      setShowErrorModal(true);
    } finally {
      setUploading(false);
    }
  };

  // Real-time progress updates via SSE
  const handleProgressUpdate = useCallback((progress: JobProgress) => {
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
  }, []);

  // Get token from cookie for SSE
  const getToken = () => {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie.split(";");
    const tokenCookie = cookies.find((c) => c.trim().startsWith("token="));
    return tokenCookie ? tokenCookie.split("=")[1] : null;
  };

  // Connect SSE for processing jobs
  const processingJobs = filteredJobs.filter((j) => j.status === "processing");
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text">Verify Emails</h1>
        <p className="mt-2 text-apple-text-muted">
          Verify email addresses directly using our verification service (no permutation logic)
        </p>
      </div>

      {error && (
        <div className="mb-4 badge-error px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Quick Stats - only for last 30 days */}
      <QuickStats jobs={filteredJobs} />

      {/* Upload Section */}
      <div className="mb-8 dashbrd-card p-6 space-y-6">
        {uploadError && (
          <div className="badge-error px-4 py-3 rounded-lg text-sm">
            {uploadError}
          </div>
        )}

        <div className="bg-dashbrd-card-hover border border-apple-border rounded-lg p-4">
          <p className="text-sm text-apple-text-muted">
            <strong className="text-apple-text">Note:</strong> CSV must include an <strong>email</strong> column. 
            Optional columns: first_name, last_name for display purposes.
          </p>
        </div>

        <DropZone
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
        />

        {selectedFile && (
          <>
            <div className="border-t border-apple-border pt-6">
              <h3 className="text-lg font-medium text-apple-text mb-4">
                File Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-apple-text-muted">File name:</span>
                  <span className="ml-2 font-medium text-apple-text">{selectedFile.name}</span>
                </div>
                <div>
                  <span className="text-apple-text-muted">File size:</span>
                  <span className="ml-2 font-medium text-apple-text">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
              </div>
            </div>

            <FilePreview file={selectedFile} onMappingChange={handleMappingChange} mode="verification" />

            <div className="flex justify-end space-x-4 pt-6 border-t border-apple-border">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setColumnMapping(null);
                  setIsMappingValid(false);
                  setUploadError("");
                }}
                className="btn-secondary"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !isMappingValid}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                title={!isMappingValid ? "Please map the email column first" : ""}
              >
                {uploading && <LoadingSpinner size="sm" />}
                <span>{uploading ? "Uploading..." : "Upload & Verify"}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Job History - Last 30 Days Only */}
      <div className="mb-4">
        <h2 className="text-lg font-medium text-apple-text mb-2">
          Recent Verification Jobs (Last 30 Days)
        </h2>
        <p className="text-sm text-apple-text-muted">
          Showing {filteredJobs.length} of {jobs.length} total verification jobs
        </p>
      </div>
      <JobTable jobs={filteredJobs} onDelete={handleDelete} onCancel={handleCancel} />

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorModalMessage}
      />
    </div>
  );
}
