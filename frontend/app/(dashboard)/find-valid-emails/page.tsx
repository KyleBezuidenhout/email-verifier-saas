"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { JobTable } from "@/components/dashboard/JobTable";
import { QuickStats } from "@/components/dashboard/QuickStats";
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
  
  // Upload-related state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);
  const [showSalesNavModal, setShowSalesNavModal] = useState(false);
  
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

    // Company size is required - either from CSV column mapping OR from dropdown selection
    const hasCompanySizeFromCSV = !!(columnMapping.company_size && columnMapping.company_size.trim() !== "");
    const hasCompanySizeFromDropdown = !!(companySize && companySize.trim() !== "");
    
    if (!hasCompanySizeFromCSV && !hasCompanySizeFromDropdown) {
      setUploadError("Company size is required. Please select a company size range from the Advanced Options.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      // Check if this is from Sales Nav Scraper
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get("source");
      
      const response = await apiClient.uploadFile(selectedFile, {
        company_size: companySize || undefined,
        column_first_name: columnMapping.first_name,
        column_last_name: columnMapping.last_name,
        column_website: columnMapping.website,
        column_company_size: columnMapping.company_size || undefined,
        source: source === "Sales Nav" ? "Sales Nav" : undefined,
      });
      
      // Reset upload state
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      setCompanySize("");
      
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

  const handleSalesNavStart = async (url: string, autoEnrich: boolean, companySize?: string) => {
    // TODO: Implement SalesNav import
    console.log("SalesNav import:", { url, autoEnrich, companySize });
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
        <h1 className="text-3xl font-bold text-apple-text">Find Valid Emails</h1>
        <p className="mt-2 text-apple-text-muted">
          Manage and monitor your email verification jobs
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Quick Stats */}
      <QuickStats jobs={jobs} />

      {/* Upload Section */}
      <div className="mb-8 dashbrd-card p-6 space-y-6">
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

            <FilePreview file={selectedFile} onMappingChange={handleMappingChange} />

            {/* Only show Advanced Options if company_size is NOT mapped from CSV */}
            {!columnMapping?.company_size && (
              <div className="border-t border-apple-border pt-6">
                <h3 className="text-lg font-medium text-apple-text mb-4">
                  Advanced Options
                </h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="company-size"
                      className="block text-sm font-medium text-apple-text-muted mb-2"
                    >
                      Company Size (required - not detected in CSV)
                    </label>
                    <select
                      id="company-size"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className={`apple-input w-full ${!companySize ? "border-apple-warning" : ""}`}
                    >
                      <option value="">-- Select company size range --</option>
                      <option value="1-50">1-50 employees (Small)</option>
                      <option value="51-200">51-200 employees (Medium)</option>
                      <option value="201-500">201-500 employees (Mid-Market)</option>
                      <option value="500+">500+ employees (Enterprise)</option>
                    </select>
                    {!companySize && (
                      <p className="mt-1 text-xs text-apple-warning">
                        Required: Select a company size range to optimize email permutation order
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Show confirmation if company_size IS mapped */}
            {columnMapping?.company_size && (
              <div className="border-t border-apple-border pt-6">
                <div className="flex items-center gap-2 text-apple-success">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm">Company size mapped from CSV column: <strong>{columnMapping.company_size}</strong></span>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-4 pt-6 border-t border-apple-border">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setColumnMapping(null);
                  setIsMappingValid(false);
                  setCompanySize("");
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

