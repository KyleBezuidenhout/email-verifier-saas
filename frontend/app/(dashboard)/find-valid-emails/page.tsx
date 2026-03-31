"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { JobTable } from "@/components/dashboard/JobTable";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorModal } from "@/components/common/ErrorModal";
import { DropZone } from "@/components/upload/DropZone";
import { FilePreview, ColumnMapping } from "@/components/upload/FilePreview";
import { SalesNavModal } from "@/components/upload/SalesNavModal";
import { formatFileSize } from "@/lib/utils";
import { useSSE } from "@/hooks/useSSE";
import { JobProgress } from "@/types";

export default function FindValidEmailsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  
  // Upload mode toggle
  const [uploadMode, setUploadMode] = useState<'file' | 'single'>('file');

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [jobName, setJobName] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);
  const [showSalesNavModal, setShowSalesNavModal] = useState(false);

  // Single enrichment state
  const [singleFirstName, setSingleFirstName] = useState("");
  const [singleLastName, setSingleLastName] = useState("");
  const [singleWebsite, setSingleWebsite] = useState("");
  const [singleResult, setSingleResult] = useState<{
    email: string;
    status: string;
    pattern: string | null;
  } | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);

  // Error modal state
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState("");

  useEffect(() => {
    loadJobs();
    
    // Check for CSV data from Sales Nav Scraper
    const urlParams = new URLSearchParams(window.location.search);
    const csvData = urlParams.get("csvData");
    const filename = urlParams.get("filename") || "sales-nav-leads.csv";
    const source = urlParams.get("source");
    
    if (csvData && source === "Sales Nav") {
      // Create a File object from the CSV data
      const blob = new Blob([decodeURIComponent(csvData)], { type: "text/csv" });
      const file = new File([blob], filename, { type: "text/csv" });
      setSelectedFile(file);
      
      // Clean up URL params
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const loadJobs = async () => {
    try {
      // Only get enrichment jobs (exclude verification jobs)
      const jobList = await apiClient.getJobs('enrichment');
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

    setUploading(true);
    setUploadError("");

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get("source");

      console.log("[upload] starting", {
        file: selectedFile.name,
        size: selectedFile.size,
        mapping: columnMapping,
        source,
        jobName,
      });

      const response = await apiClient.uploadFile(selectedFile, {
        column_first_name: columnMapping.first_name,
        column_last_name: columnMapping.last_name,
        column_website: columnMapping.website,
        source: source === "Sales Nav" ? "Sales Nav" : undefined,
        job_name: jobName.trim() || undefined,
      });
      
      // Reset upload state
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      setJobName("");
      
      // Refresh jobs list
      await loadJobs();
      
      // Optionally scroll to the new job or show success message
      router.push(`/find-valid-emails?jobId=${response.job_id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setErrorModalMessage(errorMessage);
      setShowErrorModal(true);
    } finally {
      setUploading(false);
    }
  };

  const handleSalesNavStart = async (url: string) => {
    // TODO: Implement SalesNav import - scraping only, no auto-enrichment
    console.log("SalesNav scraping:", { url });
  };

  const handleSingleEnrich = async () => {
    if (!singleWebsite.trim()) {
      setUploadError("Website is required");
      return;
    }

    setSingleLoading(true);
    setUploadError("");
    setSingleResult(null);

    try {
      const response = await apiClient.enrichSingleAuthenticated({
        first_name: singleFirstName.trim() || undefined,
        last_name: singleLastName.trim() || undefined,
        company_website: singleWebsite.trim(),
      });

      setSingleResult({
        email: response.email,
        status: response.status,
        pattern: response.pattern,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Enrichment failed";
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dashboard-text">Find Valid Emails</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Manage and monitor your email enrichment jobs
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Upload Mode Toggle */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => {
            setUploadMode('file');
            setUploadError("");
            setSingleResult(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            uploadMode === 'file'
              ? 'bg-dashboard-accent text-white'
              : 'bg-dashboard-card text-dashboard-text-muted hover:text-dashboard-text'
          }`}
        >
          File Upload
        </button>
        <button
          onClick={() => {
            setUploadMode('single');
            setUploadError("");
            setSelectedFile(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            uploadMode === 'single'
              ? 'bg-dashboard-accent text-white'
              : 'bg-dashboard-card text-dashboard-text-muted hover:text-dashboard-text'
          }`}
        >
          Single Email
        </button>
      </div>

      {/* Upload Section */}
      <div className="mb-8 glass-card p-6 space-y-6">
        {uploadMode === 'file' ? (
          // File Upload Mode
          <>
            <div className="glass-card-hover p-4">
              <p className="text-sm text-dashboard-text-muted">
                <strong className="text-dashboard-text">Note:</strong> CSV must include a <strong>website</strong>, <strong>first name</strong>, and <strong>last name</strong> column.
              </p>
            </div>

            {uploadError && (
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

                <FilePreview file={selectedFile} onMappingChange={handleMappingChange} />

                {/* Job Name Input - Optional */}
                <div className="border-t border-dashboard-border pt-6">
                  <h3 className="text-lg font-medium text-dashboard-text mb-4">
                    Job Name (Optional)
                  </h3>
                  <input
                    type="text"
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="e.g., Q4 Tech Leads, Marketing Campaign Jan 2024"
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
                    title={!isMappingValid ? "Please map all required columns first" : ""}
                  >
                    {uploading && <LoadingSpinner size="sm" />}
                    <span>{uploading ? "Uploading..." : "Upload & Verify"}</span>
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          // Single Enrichment Mode
          <>
            <div className="glass-card-hover p-4">
              <p className="text-sm text-dashboard-text-muted">
                <strong className="text-dashboard-text">Note:</strong> Enter a <strong>website</strong>, <strong>first name</strong>, and <strong>last name</strong> to find a valid email.
              </p>
            </div>

            {uploadError && (
              <div className="badge-error px-4 py-3 rounded-lg text-sm">
                {uploadError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dashboard-text mb-2">
                  Website <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={singleWebsite}
                  onChange={(e) => setSingleWebsite(e.target.value)}
                  placeholder="e.g., example.com or https://example.com"
                  className="apple-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dashboard-text mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={singleFirstName}
                    onChange={(e) => setSingleFirstName(e.target.value)}
                    placeholder="e.g., John"
                    className="apple-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dashboard-text mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={singleLastName}
                    onChange={(e) => setSingleLastName(e.target.value)}
                    placeholder="e.g., Smith"
                    className="apple-input w-full"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <button
                  onClick={() => {
                    setSingleFirstName("");
                    setSingleLastName("");
                    setSingleWebsite("");
                    setUploadError("");
                    setSingleResult(null);
                  }}
                  className="btn-secondary"
                  disabled={singleLoading}
                >
                  Clear
                </button>
                <button
                  onClick={handleSingleEnrich}
                  disabled={singleLoading || !singleWebsite.trim()}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {singleLoading && <LoadingSpinner size="sm" />}
                  <span>{singleLoading ? "Enriching..." : "Find Email"}</span>
                </button>
              </div>
            </div>

            {/* Single Enrichment Result */}
            {singleResult && (
              <div className="border-t border-dashboard-border pt-6">
                <h3 className="text-lg font-medium text-dashboard-text mb-4">
                  Result
                </h3>
                <div className="glass-card-hover p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-dashboard-text-muted">Email:</span>
                    <span className="font-medium text-dashboard-text">{singleResult.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-dashboard-text-muted">Status:</span>
                    <span className={`font-medium ${
                      singleResult.status === 'valid' ? 'text-green-400' :
                      singleResult.status === 'catchall' ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {singleResult.status}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Job History */}
      <JobTable jobs={jobs} onDelete={handleDelete} onCancel={handleCancel} />

      <SalesNavModal
        isOpen={showSalesNavModal}
        onClose={() => setShowSalesNavModal(false)}
        onStart={handleSalesNavStart}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorModalMessage}
      />
    </div>
  );
}

