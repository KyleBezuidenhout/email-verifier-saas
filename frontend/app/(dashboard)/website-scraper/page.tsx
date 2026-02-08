"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api";
import { WebsiteScraperJob, WebsiteScraperHealthStatus, WebsiteScraperPreviewResponse } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { FilePreview, ColumnMapping } from "@/components/upload/FilePreview";

export default function WebsiteScraperPage() {
  // Health check state
  const [healthStatus, setHealthStatus] = useState<WebsiteScraperHealthStatus | null>(null);
  
  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Jobs state
  const [jobs, setJobs] = useState<WebsiteScraperJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  
  // UI state
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [deleteConfirmJobId, setDeleteConfirmJobId] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  
  // Column mapping state
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);
  const [jobName, setJobName] = useState("");
  
  // Optional feature toggles (both default to ON)
  const [enableCache, setEnableCache] = useState(true);
  const [enableSublinkScraping, setEnableSublinkScraping] = useState(true);
  
  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<WebsiteScraperPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);

  // Check ZenRows health
  const checkHealth = useCallback(async () => {
    try {
      const status = await apiClient.getWebsiteScraperHealth();
      setHealthStatus(status);
    } catch (err) {
      setHealthStatus({ zenrows_api: "disconnected", message: "Could not check API status" });
    }
  }, []);

  // Load jobs
  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const response = await apiClient.getWebsiteScraperJobs(100, 0);
      // Sort by date, newest first
      const sortedJobs = response.jobs.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setJobs(sortedJobs);
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setInitialLoading(true);
        await Promise.all([checkHealth(), loadJobs()]);
      } catch (err) {
        console.error("Error loading initial data:", err);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [checkHealth, loadJobs]);

  // Poll for job status updates
  useEffect(() => {
    const POLL_INTERVAL = 30000; // 30 seconds

    const pollJobStatuses = async () => {
      const activeJobs = jobs.filter(
        (job) => job.status === "pending" || job.status === "processing"
      );

      if (activeJobs.length === 0) return;

      const updates = await Promise.allSettled(
        activeJobs.map(async (job) => {
          const result = await apiClient.pollWebsiteScraperJobStatus(job.id);
          return { jobId: job.id, result };
        })
      );

      setJobs((currentJobs) =>
        currentJobs.map((job) => {
          const update = updates.find(
            (u) => u.status === "fulfilled" && u.value.jobId === job.id
          );
          if (update && update.status === "fulfilled") {
            const { result } = update.value;
            return {
              ...job,
              status: result.status as WebsiteScraperJob["status"],
              completed_leads: result.completed_leads,
              progress_percentage: result.progress_percentage,
              hit_rate_percentage: result.hit_rate_percentage,
              error_message: result.error_message || undefined,
            };
          }
          return job;
        })
      );
    };

    const intervalId = setInterval(pollJobStatuses, POLL_INTERVAL);
    // Initial poll after 5 seconds
    const timeoutId = setTimeout(pollJobStatuses, 5000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [jobs]);

  // Handle file drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".csv")) {
        setSelectedFile(file);
      } else {
        setError("Only CSV files are supported");
        setShowErrorModal(true);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith(".csv")) {
        setSelectedFile(file);
        // Reset mapping when new file is selected
        setColumnMapping(null);
        setIsMappingValid(false);
      } else {
        setError("Only CSV files are supported");
        setShowErrorModal(true);
      }
    }
  };

  // Handle mapping change
  const handleMappingChange = useCallback((mapping: ColumnMapping, isValid: boolean) => {
    setColumnMapping(mapping);
    setIsMappingValid(isValid);
  }, []);

  // Upload file
  const handleUpload = async () => {
    if (!selectedFile) return;

    // Validate column mapping
    if (!isMappingValid || !columnMapping || !columnMapping.website) {
      setError("Please map the website column before uploading");
      setShowErrorModal(true);
      return;
    }

    // Validate file size (250MB max)
    const MAX_SIZE = 250 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      setError("File too large. Maximum size is 250MB.");
      setShowErrorModal(true);
      return;
    }

    setUploading(true);
    try {
      const result = await apiClient.uploadWebsiteScraperFile(selectedFile, {
        column_website: columnMapping.website,
        job_name: jobName.trim() || undefined,
        enable_cache: enableCache,
        enable_sublink_scraping: enableSublinkScraping,
      });
      
      // Clear file selection and mapping
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      setJobName("");
      setEnableCache(true);
      setEnableSublinkScraping(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Reload jobs
      await loadJobs();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "Failed to upload file");
      setShowErrorModal(true);
    } finally {
      setUploading(false);
    }
  };

  // Delete job
  const handleDeleteJob = async (jobId: string) => {
    if (deleteConfirmJobId === jobId) {
      try {
        await apiClient.deleteWebsiteScraperJob(jobId);
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        setDeleteConfirmJobId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete job");
        setShowErrorModal(true);
        setDeleteConfirmJobId(null);
      }
    } else {
      setDeleteConfirmJobId(jobId);
    }
  };

  // Download results
  const handleDownloadResults = async (jobId: string) => {
    setDownloadingJobId(jobId);
    try {
      await apiClient.downloadWebsiteScraperResults(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download results");
      setShowErrorModal(true);
    } finally {
      setDownloadingJobId(null);
    }
  };

  // Preview results
  const handlePreviewResults = async (jobId: string) => {
    setPreviewJobId(jobId);
    setPreviewLoading(true);
    setShowPreviewModal(true);
    try {
      const data = await apiClient.getWebsiteScraperPreview(jobId);
      setPreviewData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
      setShowErrorModal(true);
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle row click for preview
  const handleRowClick = (job: WebsiteScraperJob, e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    // Only allow preview for completed jobs
    if (job.status === "completed") {
      handlePreviewResults(job.id);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Loading state
  if (initialLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dashboard-text">Website Contact Scraper</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Extract emails and phone numbers from websites using ZenRows
        </p>
      </div>

      {/* API Health Status */}
      <div className={`mb-6 glass-card p-4 ${
        healthStatus?.zenrows_api === "connected" 
          ? "bg-green-500/10 border-green-500/30" 
          : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            healthStatus?.zenrows_api === "connected" ? "bg-green-500" : "bg-red-500"
          }`}></div>
          <div>
            <p className={`text-sm font-medium ${
              healthStatus?.zenrows_api === "connected" ? "text-green-400" : "text-red-400"
            }`}>
              {healthStatus?.zenrows_api === "connected" 
                ? "ZenRows API Connected" 
                : "ZenRows API Disconnected"}
            </p>
            <p className="text-xs text-dashboard-text-muted">{healthStatus?.message}</p>
          </div>
          <button
            onClick={checkHealth}
            className="ml-auto px-3 py-1 text-xs bg-dashboard-card hover:bg-dashboard-border rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <ErrorModal
        isOpen={showErrorModal}
        message={error}
        onClose={() => setShowErrorModal(false)}
      />

      {/* Results Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setShowPreviewModal(false);
              setPreviewData(null);
              setPreviewJobId(null);
            }}
          />
          
          {/* Modal */}
          <div className="relative bg-dashboard-surface border border-dashboard-border rounded-2xl p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-dashboard-text">Results Preview</h2>
                {previewData && (
                  <p className="text-sm text-dashboard-text-muted mt-1">
                    Showing {previewData.preview_count} of {previewData.total_rows.toLocaleString()} results
                    {previewData.hit_rate_percentage > 0 && (
                      <span className="ml-2">
                        • Hit Rate: <span className={`font-medium ${
                          previewData.hit_rate_percentage >= 50 ? "text-green-400" :
                          previewData.hit_rate_percentage >= 25 ? "text-yellow-400" :
                          "text-red-400"
                        }`}>{previewData.hit_rate_percentage.toFixed(1)}%</span>
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewData(null);
                  setPreviewJobId(null);
                }}
                className="p-2 hover:bg-dashboard-card rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : previewData && previewData.rows.length > 0 ? (
              <div className="flex-1 overflow-auto">
                <table className="min-w-full divide-y divide-dashboard-border">
                  <thead style={{ background: "rgba(13, 15, 18, 0.5)" }} className="sticky top-0">
                    <tr>
                      {previewData.columns.map((col) => (
                        <th 
                          key={col} 
                          className="px-4 py-2 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider whitespace-nowrap"
                        >
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: "rgba(13, 15, 18, 0.3)" }} className="divide-y divide-dashboard-border">
                    {previewData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-dashboard-card/30">
                        {previewData.columns.map((col) => (
                          <td 
                            key={col} 
                            className={`px-4 py-2 text-sm whitespace-nowrap max-w-[200px] truncate ${
                              col === 'email_1' || col === 'email_2' 
                                ? row[col] ? 'text-green-400' : 'text-dashboard-text-muted'
                                : col === 'phone_1' || col === 'phone_2'
                                ? row[col] ? 'text-blue-400' : 'text-dashboard-text-muted'
                                : col === 'extraction_status'
                                ? row[col] === 'success' ? 'text-green-400' 
                                  : row[col] === 'error' ? 'text-red-400'
                                  : row[col] === 'not_found' ? 'text-yellow-400'
                                  : 'text-dashboard-text-muted'
                                : 'text-dashboard-text'
                            }`}
                            title={row[col] || '-'}
                          >
                            {row[col] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-dashboard-text-muted">No results available</p>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-dashboard-border">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewData(null);
                  setPreviewJobId(null);
                }}
                className="px-4 py-2 bg-dashboard-card text-dashboard-text rounded-lg hover:bg-dashboard-border transition-colors"
              >
                Close
              </button>
              {previewJobId && (
                <button
                  onClick={() => {
                    handleDownloadResults(previewJobId);
                  }}
                  disabled={downloadingJobId === previewJobId}
                  className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50"
                >
                  {downloadingJobId === previewJobId ? "Downloading..." : "Download Full CSV"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File Upload */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-4">
          Upload CSV with Website URLs
        </label>
        
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? "border-dashboard-accent bg-dashboard-accent/10"
              : "border-dashboard-border hover:border-dashboard-accent/50"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          
          {selectedFile ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-dashboard-accent">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium">{selectedFile.name}</span>
              </div>
              <p className="text-sm text-dashboard-text-muted">
                {formatFileSize(selectedFile.size)}
              </p>
              
              {/* File Preview with Column Mapping */}
              <FilePreview 
                file={selectedFile} 
                mode="website-scraper"
                onMappingChange={handleMappingChange}
              />
              
              {/* Job Name Input - Optional */}
              <div className="mt-4 text-left">
                <label className="block text-sm font-medium text-dashboard-text mb-2">
                  Job Name (Optional)
                </label>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="e.g., Tech Companies Contact Extraction"
                  className="apple-input w-full"
                />
                <p className="mt-1 text-xs text-dashboard-text-muted">
                  Give your job a descriptive name to easily identify it later
                </p>
              </div>
              
              {/* Optional Feature Toggles */}
              <div className="mt-4 text-left space-y-3">
                <label className="block text-sm font-medium text-dashboard-text mb-2">
                  Scraping Options
                </label>
                
                {/* Cache Toggle */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="enableCache"
                    checked={enableCache}
                    onChange={(e) => setEnableCache(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-dashboard-border bg-dashboard-card text-dashboard-accent focus:ring-dashboard-accent"
                  />
                  <div>
                    <label htmlFor="enableCache" className="text-sm text-dashboard-text cursor-pointer">
                      Use cached results
                    </label>
                    <p className="text-xs text-dashboard-text-muted">
                      Reuse previously scraped results for matching URLs (saves credits)
                    </p>
                  </div>
                </div>
                
                {/* Sublink Scraping Toggle */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="enableSublinkScraping"
                    checked={enableSublinkScraping}
                    onChange={(e) => setEnableSublinkScraping(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-dashboard-border bg-dashboard-card text-dashboard-accent focus:ring-dashboard-accent"
                  />
                  <div>
                    <label htmlFor="enableSublinkScraping" className="text-sm text-dashboard-text cursor-pointer">
                      Scrape contact pages
                    </label>
                    <p className="text-xs text-dashboard-text-muted">
                      If no email on main page, try /contact, /about pages (uses extra credits)
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !isMappingValid}
                  className="px-6 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      Uploading...
                    </span>
                  ) : (
                    "Start Extraction"
                  )}
                </button>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setColumnMapping(null);
                    setIsMappingValid(false);
                    setJobName("");
                    setEnableCache(true);
                    setEnableSublinkScraping(true);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="px-4 py-2 text-dashboard-text-muted hover:text-dashboard-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="space-y-3">
                <svg className="mx-auto w-12 h-12 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-dashboard-text">
                  <span className="text-dashboard-accent font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-dashboard-text-muted">
                  CSV files only. Max 250MB, 50,000 rows.
                </p>
              </div>
            </label>
          )}
        </div>
        
        <p className="mt-3 text-xs text-dashboard-text-muted">
          Your CSV should contain a column with website URLs. Duplicate domains are automatically 
          removed to prevent extracting the same contacts multiple times.
        </p>
      </div>

      {/* Jobs History */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-dashboard-text">Extraction Jobs</h3>
          <button
            onClick={loadJobs}
            disabled={loadingJobs}
            className="px-3 py-1 text-xs bg-dashboard-card hover:bg-dashboard-border rounded-lg transition-colors"
          >
            {loadingJobs ? "Loading..." : "Refresh"}
          </button>
        </div>
        
        {loadingJobs && jobs.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-dashboard-text-muted text-center py-8">
            No extraction jobs yet. Upload a CSV to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: "rgba(13, 15, 18, 0.5)" }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Job ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Upload Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Leads
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Hit Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody style={{ background: "rgba(13, 15, 18, 0.3)" }} className="divide-y divide-dashboard-border">
                {jobs.map((job) => (
                  <tr 
                    key={job.id}
                    onClick={(e) => handleRowClick(job, e)}
                    className={`transition-colors ${
                      job.status === "completed" 
                        ? "hover:bg-dashboard-card/50 cursor-pointer" 
                        : ""
                    }`}
                    title={job.status === "completed" ? "Click to preview results" : undefined}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text">
                      <span 
                        title={job.job_name || job.id}
                        className="cursor-default"
                      >
                        {job.job_name 
                          ? (job.job_name.length > 15 ? `${job.job_name.slice(0, 15)}...` : job.job_name)
                          : `${job.id.slice(0, 8)}...`
                        }
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text">
                      {job.total_leads.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          job.status === "completed"
                            ? "bg-green-500/20 text-green-400"
                            : job.status === "processing"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : job.status === "pending"
                            ? "bg-blue-500/20 text-blue-400"
                            : job.status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text">
                      {job.status === "completed" ? (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-green-400">100%</span>
                        </div>
                      ) : job.status === "failed" ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-red-400">Failed</span>
                          {job.error_message && (
                            <span className="text-xs text-red-400/70 max-w-[200px] truncate" title={job.error_message}>
                              {job.error_message}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 bg-dashboard-card rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-dashboard-accent h-2 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${job.progress_percentage || 5}%` }}
                            />
                          </div>
                          <span className="text-xs text-dashboard-text-muted w-10">
                            {job.progress_percentage || 0}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text">
                      {job.status === "completed" ? (
                        <span className={`font-medium ${
                          job.hit_rate_percentage >= 50 ? "text-green-400" :
                          job.hit_rate_percentage >= 25 ? "text-yellow-400" :
                          "text-red-400"
                        }`}>
                          {job.hit_rate_percentage.toFixed(1)}%
                        </span>
                      ) : job.status === "processing" ? (
                        <span className="text-dashboard-text-muted">
                          {job.hit_rate_percentage.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-dashboard-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {job.status === "completed" && (
                          <button
                            onClick={() => handleDownloadResults(job.id)}
                            disabled={downloadingJobId === job.id}
                            className="px-3 py-1.5 bg-dashboard-accent text-white text-xs rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50"
                          >
                            {downloadingJobId === job.id ? "Downloading..." : "Download CSV"}
                          </button>
                        )}
                        {deleteConfirmJobId === job.id ? (
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="text-red-400 hover:text-red-300 transition-colors text-xs"
                          >
                            Confirm Delete
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="text-dashboard-text-muted hover:text-red-400 transition-colors text-xs"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-dashboard-text mb-4">Frequently Asked Questions</h3>
        <div className="space-y-2">
          {[
            {
              q: "What is the Website Contact Scraper?",
              a: "The Website Contact Scraper uses ZenRows to visit websites and extract contact information (emails and phone numbers) from the page content. It uses intelligent tiered scraping to handle difficult sites while minimizing costs.",
            },
            {
              q: "What format should my CSV be in?",
              a: "Your CSV should contain a column with website URLs. After uploading, you'll be asked to map the website column if it's not auto-detected. All other columns in your CSV will be preserved in the output.",
            },
            {
              q: "What data is extracted?",
              a: "The scraper extracts up to 2 email addresses and 2 phone numbers per website. It prioritizes mailto: and tel: links, filters out generic emails like noreply@ or webmaster@, and automatically tries /contact pages if the homepage has no contacts.",
            },
            {
              q: "What does 'Hit Rate' mean?",
              a: "Hit rate is the percentage of websites where at least one email or phone number was found. A higher hit rate means more successful extractions.",
            },
            {
              q: "What are the limits?",
              a: "Maximum file size is 250MB with up to 50,000 rows. Processing is highly parallelized for fast turnaround times.",
            },
          ].map((faq, idx) => (
            <div key={idx} className="border-b border-dashboard-border last:border-0">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between py-3 text-left"
              >
                <span className="text-sm font-medium text-dashboard-text">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-dashboard-text-muted transition-transform ${
                    openFaq === idx ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === idx && <p className="pb-3 text-sm text-dashboard-text-muted">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
