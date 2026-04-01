"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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

const MAX_ROWS = 10000;

export default function VerifyCatchallsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [jobName, setJobName] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);
  const [rowCount, setRowCount] = useState<number | null>(null);

  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState("");

  useEffect(() => {
    loadJobs();
  }, []);

  // Count rows when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setRowCount(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      setRowCount(Math.max(0, lines.length - 1)); // subtract header
    };
    reader.readAsText(selectedFile);
  }, [selectedFile]);

  const loadJobs = async () => {
    try {
      const jobList = await apiClient.getJobs("catchall_verification");
      setJobs(
        jobList.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return jobs.filter((job) => new Date(job.created_at) >= thirtyDaysAgo);
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
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel job");
    }
  };

  const handleMappingChange = useCallback(
    (mapping: ColumnMapping, isValid: boolean) => {
      setColumnMapping(mapping);
      setIsMappingValid(isValid);
    },
    []
  );

  const rowLimitExceeded = rowCount !== null && rowCount > MAX_ROWS;

  const handleUpload = async () => {
    if (!selectedFile || !isMappingValid || !columnMapping) {
      setUploadError("Please map the email column before uploading");
      return;
    }
    if (!columnMapping.email) {
      setUploadError("Email column is required");
      return;
    }
    if (rowLimitExceeded) {
      setUploadError(
        `File exceeds the ${MAX_ROWS.toLocaleString()} row limit (${rowCount?.toLocaleString()} rows detected)`
      );
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      await apiClient.uploadCatchallFile(selectedFile, {
        column_email: columnMapping.email,
        job_name: jobName.trim() || undefined,
      });

      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      setJobName("");
      setRowCount(null);

      await loadJobs();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Upload failed";
      setErrorModalMessage(errorMessage);
      setShowErrorModal(true);
    } finally {
      setUploading(false);
    }
  };

  // SSE progress for processing jobs
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
              status: progress.status as
                | "pending"
                | "processing"
                | "completed"
                | "failed",
            }
          : job
      )
    );
  }, []);

  const getToken = () => {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie.split(";");
    const tokenCookie = cookies.find((c) => c.trim().startsWith("token="));
    return tokenCookie ? tokenCookie.split("=")[1] : null;
  };

  const processingJobs = filteredJobs.filter((j) => j.status === "processing");
  const firstProcessingJob =
    processingJobs.length > 0 ? processingJobs[0] : null;

  useSSE(
    firstProcessingJob?.id || null,
    getToken(),
    handleProgressUpdate,
    (err) => console.error("SSE error:", err)
  );

  // Quick stats
  const completedJobs = filteredJobs.filter((j) => j.status === "completed");
  const totalVerified = completedJobs.reduce(
    (sum, j) => sum + j.total_leads,
    0
  );
  const totalValid = completedJobs.reduce(
    (sum, j) => sum + j.valid_emails_found,
    0
  );
  const totalRisky = completedJobs.reduce(
    (sum, j) => sum + j.catchall_emails_found,
    0
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
        <h1 className="text-3xl font-bold text-dashboard-text">
          Catchall Verifier
        </h1>
        <p className="mt-2 text-dashboard-text-muted">
          Upload a CSV of catchall emails and verify which are actually
          deliverable
        </p>
      </div>

      {error && (
        <div className="mb-4 badge-error px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Quick Stats */}
      {completedJobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-5">
            <p className="text-sm text-dashboard-text-muted">Total Verified</p>
            <p className="text-2xl font-bold text-dashboard-text">
              {totalVerified.toLocaleString()}
            </p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm text-dashboard-text-muted">
              Valid (Deliverable)
            </p>
            <p className="text-2xl font-bold text-[#22c55e]">
              {totalValid.toLocaleString()}
            </p>
          </div>
          <div className="glass-card p-5">
            <p className="text-sm text-dashboard-text-muted">
              Risky (Undeliverable)
            </p>
            <p className="text-2xl font-bold text-yellow-400">
              {totalRisky.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="mb-8 glass-card p-6 space-y-6">
        {uploadError && (
          <div className="badge-error px-4 py-3 rounded-lg text-sm">
            {uploadError}
          </div>
        )}

        <div className="glass-card-hover p-4">
          <p className="text-sm text-dashboard-text-muted">
            <strong className="text-dashboard-text">Note:</strong> CSV must
            include an <strong>email</strong> column. Maximum{" "}
            <strong>{MAX_ROWS.toLocaleString()}</strong> rows per upload. 1
            credit per email.
          </p>
        </div>

        <DropZone onFileSelect={setSelectedFile} selectedFile={selectedFile} />

        {selectedFile && (
          <>
            <div className="border-t border-dashboard-border pt-6">
              <h3 className="text-lg font-medium text-dashboard-text mb-4">
                File Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-dashboard-text-muted">File name:</span>
                  <span className="ml-2 font-medium text-dashboard-text">
                    {selectedFile.name}
                  </span>
                </div>
                <div>
                  <span className="text-dashboard-text-muted">File size:</span>
                  <span className="ml-2 font-medium text-dashboard-text">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
                <div>
                  <span className="text-dashboard-text-muted">Rows:</span>
                  <span
                    className={`ml-2 font-medium ${
                      rowLimitExceeded
                        ? "text-red-400"
                        : "text-dashboard-text"
                    }`}
                  >
                    {rowCount !== null
                      ? `${rowCount.toLocaleString()}${
                          rowLimitExceeded
                            ? ` (exceeds ${MAX_ROWS.toLocaleString()} limit)`
                            : ""
                        }`
                      : "Counting..."}
                  </span>
                </div>
              </div>
            </div>

            <FilePreview
              file={selectedFile}
              onMappingChange={handleMappingChange}
              mode="catchall"
            />

            {/* Job Name */}
            <div className="border-t border-dashboard-border pt-6">
              <h3 className="text-lg font-medium text-dashboard-text mb-4">
                Job Name (Optional)
              </h3>
              <input
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="e.g., March Catchall Batch"
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
                  setRowCount(null);
                }}
                className="btn-secondary"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !isMappingValid || rowLimitExceeded}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                title={
                  rowLimitExceeded
                    ? `File exceeds ${MAX_ROWS.toLocaleString()} row limit`
                    : !isMappingValid
                    ? "Please map the email column first"
                    : ""
                }
              >
                {uploading && <LoadingSpinner size="sm" />}
                <span>
                  {uploading
                    ? "Uploading..."
                    : `Verify${
                        rowCount !== null
                          ? ` ${rowCount.toLocaleString()} Emails`
                          : ""
                      }`}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Job History */}
      <div className="mb-4">
        <h2 className="text-lg font-medium text-dashboard-text mb-2">
          Recent Catchall Jobs (Last 30 Days)
        </h2>
        <p className="text-sm text-dashboard-text-muted">
          Showing {filteredJobs.length} of {jobs.length} total catchall
          verification jobs
        </p>
      </div>
      <JobTable
        jobs={filteredJobs}
        onDelete={handleDelete}
        onCancel={handleCancel}
      />

      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorModalMessage}
      />
    </div>
  );
}
