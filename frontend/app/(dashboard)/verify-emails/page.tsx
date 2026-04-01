"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { JobTable } from "@/components/dashboard/JobTable";
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
  // Show both single and file upload sections (single first by default)
  const [showSingleSection] = useState(true);
  const [showFileSection] = useState(true);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [jobName, setJobName] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);

  // Single verification state
  const [singleEmail, setSingleEmail] = useState("");
  const [singleResult, setSingleResult] = useState<{
    email: string;
    status: string;
    reason: string | null;
  } | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

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

    if (selectedFile.size > 200 * 1024 * 1024) {
      setUploadError("File size must be less than 200MB");
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
        job_name: jobName.trim() || undefined,
      });
      
      // Reset upload state
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      setJobName("");
      
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

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  const handleSingleVerify = async () => {
    if (!singleEmail.trim()) {
      setUploadError("Email is required");
      return;
    }

    setSingleLoading(true);
    setUploadError("");
    setSingleResult(null);
    setSelectedFile(null);

    try {
      const response = await apiClient.verifySingleEmail({
        email: singleEmail.trim(),
      });

      setSingleResult({
        email: response.email,
        status: response.status,
        reason: response.reason || null,
      });

      // Clear form after successful verification
      setSingleEmail("");
    } catch (err) {
      let errorMessage = "Verification failed";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "object" && err !== null) {
        // Handle cases where error is an object with a message or detail property
        const errorObj = err as Record<string, unknown>;
        if (typeof errorObj.detail === "string") {
          errorMessage = errorObj.detail;
        } else if (typeof errorObj.message === "string") {
          errorMessage = errorObj.message;
        } else {
          errorMessage = JSON.stringify(err);
        }
      }
      setUploadError(errorMessage);
    } finally {
      setSingleLoading(false);
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
        <h1 className="text-3xl font-bold text-dashboard-text">Verify Emails</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Manage and monitor your email verification jobs
        </p>
      </div>

      {error && (
        <div className="mb-4 badge-error px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Single Email Verification Section */}
      {showSingleSection && (
        <div className="mb-8 glass-card p-6 space-y-6">
          {uploadError && !selectedFile && (
            <div className="badge-error px-4 py-3 rounded-lg text-sm">
              {uploadError}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-dashboard-text mb-2">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={singleEmail}
                  onChange={(e) => setSingleEmail(e.target.value)}
                  placeholder="e.g., john@example.com"
                  className="apple-input w-full"
                />
              </div>
              <button
                onClick={handleSingleVerify}
                disabled={singleLoading || !singleEmail.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 h-[42px]"
              >
                {singleLoading && <LoadingSpinner size="sm" />}
                <span>{singleLoading ? "Verifying..." : "Verify Email"}</span>
              </button>
            </div>
          </div>

          {/* Single Verification Result */}
          {singleResult && (
            <div className="border-t border-dashboard-border pt-6">
              <h3 className="text-lg font-medium text-dashboard-text mb-4">
                Result
              </h3>
              <div className="glass-card-hover p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-dashboard-text-muted">Email:</span>
                  <button
                    onClick={() => handleCopyEmail(singleResult.email)}
                    className="flex items-center gap-2 font-medium text-dashboard-text cursor-pointer"
                    title="Click to copy"
                  >
                    {singleResult.email}
                    {copiedEmail ? (
                      <svg className="w-4 h-4 text-dashboard-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-dashboard-text-muted">Status:</span>
                  <span className={`font-medium ${
                    singleResult.status === 'valid' ? 'text-[#22c55e]' :
                    singleResult.status === 'catchall' ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {singleResult.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Upload Section */}
      {showFileSection && (
        <div className="mb-8 glass-card p-6 space-y-6">
          {uploadError && selectedFile && (
            <div className="badge-error px-4 py-3 rounded-lg text-sm">
              {uploadError}
            </div>
          )}

          <DropZone
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
          />

          {selectedFile && (
            <>
              <div className="border-t border-dashboard-border pt-6">
                <h3 className="text-lg font-medium text-dashboard-text mb-4">
                  File Information
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-dashboard-text-muted">File name:</span>
                    <span className="ml-2 font-medium text-dashboard-text">{selectedFile.name}</span>
                  </div>
                  <div>
                    <span className="text-dashboard-text-muted">File size:</span>
                    <span className="ml-2 font-medium text-dashboard-text">
                      {formatFileSize(selectedFile.size)}
                    </span>
                  </div>
                </div>
              </div>

              <FilePreview file={selectedFile} onMappingChange={handleMappingChange} mode="verification" />

              {/* Job Name Input - Optional */}
              <div className="border-t border-dashboard-border pt-6">
                <h3 className="text-lg font-medium text-dashboard-text mb-4">
                  Job Name (Optional)
                </h3>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="e.g., Email List Verification Feb 2024"
                  className="apple-input w-full"
                />
                <p className="mt-2 text-xs text-dashboard-text-muted">
                  Give your job a descriptive name to easily identify it later
                </p>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-dashboard-border">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setColumnMapping(null);
                    setIsMappingValid(false);
                    setJobName("");
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
      )}

      {/* Job History */}
      <JobTable jobs={filteredJobs} onDelete={handleDelete} onCancel={handleCancel} hitRateHeader="% Valid" />

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorModalMessage}
      />
    </div>
  );
}
