"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { JobTable } from "@/components/dashboard/JobTable";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { DropZone } from "@/components/upload/DropZone";
import { FilePreview, ColumnMapping } from "@/components/upload/FilePreview";
import { VerificationModeToggle } from "@/components/upload/VerificationModeToggle";
import { SalesNavModal } from "@/components/upload/SalesNavModal";
import { formatFileSize } from "@/lib/utils";
import { useSSE } from "@/hooks/useSSE";
import { JobProgress } from "@/types";

export default function DashboardPage() {
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
  const [isVerificationOnly, setIsVerificationOnly] = useState(false);
  const [showSalesNavModal, setShowSalesNavModal] = useState(false);

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

    setUploading(true);
    setUploadError("");

    try {
      const response = await apiClient.uploadFile(selectedFile, {
        company_size: companySize || undefined,
        column_first_name: columnMapping.first_name,
        column_last_name: columnMapping.last_name,
        column_website: columnMapping.website,
        column_company_size: columnMapping.company_size || undefined,
      });
      
      // Reset upload state
      setSelectedFile(null);
      setColumnMapping(null);
      setIsMappingValid(false);
      setCompanySize("");
      
      // Refresh jobs list
      await loadJobs();
      
      // Optionally scroll to the new job or show success message
      router.push(`/dashboard?jobId=${response.job_id}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
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
        <h1 className="text-3xl font-bold text-omni-white">Job Dashboard</h1>
        <p className="mt-2 text-omni-gray">
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
      <div className="mb-8 bg-omni-dark border border-omni-border rounded-lg p-6 space-y-6">
        {uploadError && (
          <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
            {uploadError}
          </div>
        )}

        <VerificationModeToggle
          isVerificationOnly={isVerificationOnly}
          onToggle={setIsVerificationOnly}
        />

        <DropZone
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
        />

        {selectedFile && (
          <>
            <div className="border-t border-omni-border pt-6">
              <h3 className="text-lg font-medium text-omni-white mb-4">
                File Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-omni-gray">File name:</span>
                  <span className="ml-2 font-medium text-omni-white">{selectedFile.name}</span>
                </div>
                <div>
                  <span className="text-omni-gray">File size:</span>
                  <span className="ml-2 font-medium text-omni-white">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
              </div>
            </div>

            <FilePreview file={selectedFile} onMappingChange={handleMappingChange} />

            {!isVerificationOnly && (
              <div className="border-t border-omni-border pt-6">
                <h3 className="text-lg font-medium text-omni-white mb-4">
                  Advanced Options
                </h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="company-size"
                      className="block text-sm font-medium text-omni-gray mb-2"
                    >
                      Company Size (optional)
                    </label>
                    <select
                      id="company-size"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="w-full px-4 py-2 border border-omni-border rounded-lg focus:ring-2 focus:ring-omni-cyan focus:border-omni-cyan bg-omni-black text-omni-white"
                    >
                      <option value="">Select company size</option>
                      <option value="1-50">1-50 employees</option>
                      <option value="51-200">51-200 employees</option>
                      <option value="201-500">201-500 employees</option>
                      <option value="500+">500+ employees</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-4 pt-6 border-t border-omni-border">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setColumnMapping(null);
                  setIsMappingValid(false);
                  setCompanySize("");
                  setUploadError("");
                }}
                className="px-4 py-2 border border-omni-border rounded-lg text-omni-gray hover:bg-omni-dark transition-colors"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !isMappingValid}
                className="px-6 py-2 bg-omni-cyan text-omni-black rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-medium transition-opacity"
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
      <JobTable jobs={jobs} onDelete={handleDelete} />

      <SalesNavModal
        isOpen={showSalesNavModal}
        onClose={() => setShowSalesNavModal(false)}
        onStart={handleSalesNavStart}
      />
    </div>
  );
}

