"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Lead, Job } from "@/types";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import Link from "next/link";

export default function ResultsPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>(["all"]); // ["all"] or ["valid", "catchall", "invalid"]
  const [mxFilters, setMxFilters] = useState<string[]>([]); // Empty = all MX, or ["outlook", "google", "other"]
  const [verifyingCatchalls, setVerifyingCatchalls] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [jobData, leadsData] = await Promise.all([
        apiClient.getJob(jobId),
        apiClient.getResults(jobId),
      ]);
      setJob(jobData);
      setLeads(leadsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyCatchalls = async () => {
    setVerifyingCatchalls(true);
    setError("");
    try {
      const result = await apiClient.verifyCatchalls(jobId);
      // Reload data to get updated leads
      await loadData();
      alert(`Successfully verified ${result.verified_count} catchall emails!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify catchalls");
    } finally {
      setVerifyingCatchalls(false);
    }
  };

  // Helper function to get provider from MX record (fallback for old leads)
  const getProviderFromMX = (mxRecord?: string, mxProvider?: string): string => {
    // Use stored provider if available
    if (mxProvider) return mxProvider;
    
    // Parse from MX record as fallback
    if (!mxRecord || mxRecord.trim() === '') return 'other';
    
    const mxLower = mxRecord.toLowerCase();
    
    // Detect Outlook
    if (mxLower.includes('mail.protection.outlook.com') || mxLower.includes('outlook.com')) {
      return 'outlook';
    }
    
    // Detect Google
    if (mxLower.includes('.google.com') || mxLower.includes('.gmail.com')) {
      return 'google';
    }
    
    return 'other';
  };

  // Apply status filters (multi-select)
  const statusFilteredLeads =
    statusFilters.includes("all") || statusFilters.length === 0
      ? leads
      : leads.filter((lead) => {
          if (statusFilters.includes("valid") && 
              (lead.verification_status === "valid" || 
               lead.verification_tag === "valid-catchall" || 
               lead.verification_tag === "catchall-verified")) {
            return true;
          }
          if (statusFilters.includes("catchall") && 
              lead.verification_status === "catchall" && 
              lead.verification_tag !== "catchall-verified" && 
              lead.verification_tag !== "valid-catchall") {
            return true;
          }
          if (statusFilters.includes("invalid") && 
              (lead.verification_status === "invalid" || lead.verification_status === "not_found")) {
            return true;
          }
          return false;
        });
  
  // Apply MX provider filter (if any selected)
  const filteredLeads = mxFilters.length === 0
    ? statusFilteredLeads
    : statusFilteredLeads.filter((lead) => {
        const provider = getProviderFromMX(lead.mx_record, lead.mx_provider);
        return mxFilters.includes(provider);
      });

  // Extract unique extra column names from loaded leads (for table headers)
  const extraColumns = useMemo(() => {
    const cols = new Set<string>();
    leads.forEach(lead => {
      if (lead.extra_data) {
        Object.keys(lead.extra_data).forEach(key => cols.add(key));
      }
    });
    return Array.from(cols).sort();
  }, [leads]);
  
  // Stat block counts derived from job fields (accurate totals, not limited by preview)
  const validCount = job?.valid_emails_found ?? 0;
  const catchallCount = job?.catchall_emails_found ?? 0;
  const notFoundCount = (job?.total_leads ?? 0) - validCount - catchallCount;
  const canVerifyCatchalls = catchallCount > 0;

  // Limit preview to 10 rows for performance
  const PREVIEW_LIMIT = 10;
  const previewLeads = filteredLeads.slice(0, PREVIEW_LIMIT);

  const handleDownload = () => {
    if (downloading) return;
    setDownloading(true);
    const baseName = job?.job_name?.trim()
      ? job.job_name.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_").slice(0, 50)
      : jobId;
    const statusParam = !statusFilters.includes("all") && statusFilters.length > 0 ? statusFilters : undefined;
    const url = apiClient.getDownloadUrl(jobId, {
      status: statusParam,
      mx: mxFilters.length > 0 ? mxFilters : undefined,
      filename: `results-${baseName}`,
    });
    window.location.href = url;
    setTimeout(() => setDownloading(false), 3000);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  // Determine back link based on job type
  const backLink = job?.job_type === 'catchall_verification' ? '/verify-catchalls' : job?.job_type === 'verification' ? '/verify-emails' : '/find-valid-emails';
  const backLinkText = job?.job_type === 'catchall_verification' ? 'Back to Catchall Verifier' : job?.job_type === 'verification' ? 'Back to Verify Emails' : 'Back to Find Valid Emails';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          href={backLink}
          className="text-dashboard-accent hover:opacity-80 transition-opacity mb-4 inline-block"
        >
          ← {backLinkText}
        </Link>
        <h1 className="text-3xl font-bold text-dashboard-text">Results</h1>
      </div>

      {/* Stats Blocks - Click to Filter (Multi-select) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => {
            if (statusFilters.includes("all")) {
              setStatusFilters([]);
            } else {
              setStatusFilters(["all"]);
            }
          }}
          className="text-left glass-card p-6 transition-all"
          style={{
            borderColor: statusFilters.includes("all") ? 'rgba(59,130,246,0.35)' : undefined,
            boxShadow: statusFilters.includes("all") ? '0 0 0 1px rgba(59,130,246,0.25)' : undefined,
          }}
        >
          <p className="text-sm text-dashboard-text-muted">Total Leads</p>
          <p className="text-2xl font-bold text-dashboard-text">{job.total_leads}</p>
        </button>
        <button
          onClick={() => {
            let newFilters = statusFilters.filter(f => f !== "all");
            if (statusFilters.includes("valid")) {
              newFilters = newFilters.filter(f => f !== "valid");
            } else {
              newFilters.push("valid");
            }
            setStatusFilters(newFilters.length > 0 ? newFilters : ["all"]);
          }}
          className="text-left glass-card p-6 transition-all"
          style={{
            borderColor: statusFilters.includes("valid") ? 'rgba(59,130,246,0.35)' : undefined,
            boxShadow: statusFilters.includes("valid") ? '0 0 0 1px rgba(59,130,246,0.25)' : undefined,
          }}
        >
          <p className="text-sm text-dashboard-text-muted">Valid Emails</p>
          <p className="text-2xl font-bold" style={{ color: '#22C55E' }}>
            {validCount}
          </p>
        </button>
        <button
          onClick={() => {
            let newFilters = statusFilters.filter(f => f !== "all");
            if (statusFilters.includes("catchall")) {
              newFilters = newFilters.filter(f => f !== "catchall");
            } else {
              newFilters.push("catchall");
            }
            setStatusFilters(newFilters.length > 0 ? newFilters : ["all"]);
          }}
          className="text-left glass-card p-6 transition-all"
          style={{
            borderColor: statusFilters.includes("catchall") ? 'rgba(59,130,246,0.35)' : undefined,
            boxShadow: statusFilters.includes("catchall") ? '0 0 0 1px rgba(59,130,246,0.25)' : undefined,
          }}
        >
          <p className="text-sm text-dashboard-text-muted">Catchall Emails</p>
          <p className="text-2xl font-bold" style={{ color: '#F5A623' }}>
            {catchallCount}
          </p>
        </button>
        <button
          onClick={() => {
            let newFilters = statusFilters.filter(f => f !== "all");
            if (statusFilters.includes("invalid")) {
              newFilters = newFilters.filter(f => f !== "invalid");
            } else {
              newFilters.push("invalid");
            }
            setStatusFilters(newFilters.length > 0 ? newFilters : ["all"]);
          }}
          className="text-left glass-card p-6 transition-all"
          style={{
            borderColor: statusFilters.includes("invalid") ? 'rgba(59,130,246,0.35)' : undefined,
            boxShadow: statusFilters.includes("invalid") ? '0 0 0 1px rgba(59,130,246,0.25)' : undefined,
          }}
        >
          <p className="text-sm text-dashboard-text-muted">Not Found</p>
          <p className="text-2xl font-bold" style={{ color: '#E5484D' }}>
            {notFoundCount}
          </p>
        </button>
      </div>

      <div className="glass-card p-6">
        <div className="mb-4">
          {/* Filter bar - Description + Download on left, MX Provider on right */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Left side - Description and Download */}
            <div className="flex flex-col gap-2">
              <div className="text-sm text-dashboard-text-muted">
                Showing <span className="font-medium text-dashboard-text">{previewLeads.length}</span> of <span className="font-medium text-dashboard-text">{job.total_leads.toLocaleString()}</span>
                {!statusFilters.includes("all") && statusFilters.length > 0 && (
                  <span> {statusFilters.join(" + ")}</span>
                )}
                {statusFilters.includes("all") && " leads"}
                {mxFilters.length > 0 && <span> • MX: {mxFilters.join(", ")}</span>}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading || filteredLeads.length === 0}
                  className="px-3 py-1.5 border border-dashboard-accent text-dashboard-accent bg-transparent text-xs rounded-lg hover:bg-dashboard-accent/10 transition-colors disabled:opacity-50"
                >
                  {downloading ? "Downloading..." : "Download CSV"}
                </button>
              </div>
            </div>

            {/* Right side - MX Provider Filter */}
            <div className="flex flex-col items-start gap-2">
              <span className="text-sm font-medium text-dashboard-text">Filter by MX Provider</span>
              <div className="flex items-center justify-between w-full gap-3">
                <button
                  onClick={() => {
                    if (mxFilters.includes('outlook')) {
                      setMxFilters(mxFilters.filter(f => f !== 'outlook'));
                    } else {
                      setMxFilters([...mxFilters, 'outlook']);
                    }
                  }}
                  className={`p-2 rounded-md transition-all flex items-center justify-center ${
                    mxFilters.includes('outlook')
                      ? 'bg-dashboard-card ring-1 ring-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.6)]'
                      : 'bg-dashboard-card shadow-[0_0_8px_rgba(59,130,246,0.25)]'
                  }`}
                  style={{ opacity: mxFilters.includes('outlook') ? 1 : 0.75 }}
                  title="Outlook"
                >
                  <img
                    src="https://app.plusvibe.ai/v2/images/logos/microsoft.svg"
                    alt="Outlook"
                    className="h-5 w-auto"
                  />
                </button>
                <button
                  onClick={() => {
                    if (mxFilters.includes('google')) {
                      setMxFilters(mxFilters.filter(f => f !== 'google'));
                    } else {
                      setMxFilters([...mxFilters, 'google']);
                    }
                  }}
                  className={`p-2 rounded-md transition-all flex items-center justify-center ${
                    mxFilters.includes('google')
                      ? 'bg-dashboard-card ring-1 ring-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.6)]'
                      : 'bg-dashboard-card shadow-[0_0_8px_rgba(59,130,246,0.25)]'
                  }`}
                  style={{ opacity: mxFilters.includes('google') ? 1 : 0.75 }}
                  title="Google Workspace"
                >
                  <img
                    src="https://app.plusvibe.ai/v2/images/logos/google-workspace.svg"
                    alt="Google"
                    className="h-5 w-auto"
                  />
                </button>
                <button
                  onClick={() => {
                    if (mxFilters.includes('other')) {
                      setMxFilters(mxFilters.filter(f => f !== 'other'));
                    } else {
                      setMxFilters([...mxFilters, 'other']);
                    }
                  }}
                  className={`p-2 rounded-md transition-all flex items-center justify-center ${
                    mxFilters.includes('other')
                      ? 'bg-dashboard-card ring-1 ring-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.6)]'
                      : 'bg-dashboard-card shadow-[0_0_8px_rgba(59,130,246,0.25)]'
                  }`}
                  style={{ opacity: mxFilters.includes('other') ? 1 : 0.75 }}
                  title="Other"
                >
                  <img
                    src="https://app.plusvibe.ai/v2/images/logos/any-provider.svg"
                    alt="Other"
                    className="h-5 w-auto"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="min-w-full divide-y divide-dashboard-border">
            <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                  First name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                  Last name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                  Website
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                  MX type
                </th>
                {/* Dynamic columns from extra_data */}
                {extraColumns.map((col) => (
                  <th key={col} className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
              {previewLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-dashboard-card/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                    {lead.first_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                    {lead.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                    {lead.domain}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                    {lead.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          lead.verification_status === "valid" || lead.verification_tag === "valid-catchall"
                            ? "text-[#22c55e]"
                            : lead.verification_status === "catchall"
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                      >
                        {lead.verification_tag === "valid-catchall" ? "valid-catchall" : lead.verification_status?.replace(/_/g, ' ')}
                      </span>
                      {lead.verification_tag === "catchall-verified" && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-dashboard-accent/20 text-dashboard-accent border border-dashboard-accent/30">
                          Catchall-Verified
                        </span>
                      )}
                      {lead.verification_tag === "valid-catchall" && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-[#22c55e]/30 text-[#22c55e] border border-[#22c55e]/50">
                          Valid-Catchall
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                    {(() => {
                      const mxType = getProviderFromMX(lead.mx_record, lead.mx_provider);
                      return mxType.charAt(0).toUpperCase() + mxType.slice(1); // Capitalize first letter
                    })()}
                  </td>
                  {/* Dynamic cells from extra_data */}
                  {extraColumns.map((col) => (
                    <td key={col} className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                      {lead.extra_data?.[col] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLeads.length > PREVIEW_LIMIT && (
          <div className="mt-4 p-4 glass-card-hover text-center">
            <p className="text-dashboard-text-muted text-sm">
              Showing {PREVIEW_LIMIT} of {job.total_leads.toLocaleString()} results.
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="ml-2 text-dashboard-accent hover:underline font-medium disabled:opacity-50"
              >
                {downloading ? "Downloading..." : "Download CSV"}
              </button>
              {" "}to view all results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

