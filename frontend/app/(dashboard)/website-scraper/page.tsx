"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api";
import { WebsiteScraperJob, WebsiteScraperHealthStatus } from "@/types";
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

  // Check Crawl4AI health
  const checkHealth = useCallback(async () => {
    try {
      const status = await apiClient.getWebsiteScraperHealth();
      setHealthStatus(status);
    } catch (err) {
      setHealthStatus({ crawl4ai_api: "disconnected", message: "Could not check API status" });
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
      });
      
      // Clear file selection and mapping
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
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
          Extract emails and phone numbers from websites using Crawl4AI
        </p>
      </div>

      {/* API Health Status */}
      <div className={`mb-6 glass-card p-4 ${
        healthStatus?.crawl4ai_api === "connected" 
          ? "bg-green-500/10 border-green-500/30" 
          : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            healthStatus?.crawl4ai_api === "connected" ? "bg-green-500" : "bg-red-500"
          }`}></div>
          <div>
            <p className={`text-sm font-medium ${
              healthStatus?.crawl4ai_api === "connected" ? "text-green-400" : "text-red-400"
            }`}>
              {healthStatus?.crawl4ai_api === "connected" 
                ? "Crawl4AI Service Connected" 
                : "Crawl4AI Service Disconnected"}
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
              
              <div className="flex items-center justify-center gap-3">
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
                  <tr key={job.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text">
                      <span title={job.id}>{job.id.slice(0, 8)}...</span>
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
              a: "The Website Contact Scraper uses Crawl4AI to visit websites and extract contact information (emails and phone numbers) from the page content. It's useful for lead enrichment when you have a list of company websites.",
            },
            {
              q: "What format should my CSV be in?",
              a: "Your CSV should contain a column with website URLs. After uploading, you'll be asked to map the website column if it's not auto-detected. All other columns in your CSV will be preserved in the output.",
            },
            {
              q: "What data is extracted?",
              a: "The scraper extracts up to 2 email addresses and 2 phone numbers per website. It prioritizes mailto: and tel: links over plain text, filters out generic emails like noreply@ or webmaster@, and automatically deduplicates websites to prevent duplicate contacts.",
            },
            {
              q: "What does 'Hit Rate' mean?",
              a: "Hit rate is the percentage of websites where at least one email or phone number was found. A higher hit rate means more successful extractions.",
            },
            {
              q: "What are the limits?",
              a: "Maximum file size is 250MB with up to 50,000 rows. Processing time depends on the number of websites and their response times.",
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
