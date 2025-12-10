"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Lead, Job } from "@/types";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function ResultsPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [mxFilters, setMxFilters] = useState<string[]>([]); // Empty = all MX, or ["outlook", "google", "other"]
  const [verifyingCatchalls, setVerifyingCatchalls] = useState(false);

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

  // Apply status filter first
  const statusFilteredLeads =
    filter === "all"
      ? leads
      : filter === "valid"
      ? leads.filter((lead) => lead.verification_status === "valid" || lead.verification_tag === "valid-catchall" || lead.verification_tag === "catchall-verified")
      : filter === "invalid"
      ? leads.filter((lead) => lead.verification_status === "invalid" || lead.verification_status === "not_found")
      : leads.filter((lead) => lead.verification_status === filter);
  
  // Apply MX provider filter (if any selected)
  const filteredLeads = mxFilters.length === 0
    ? statusFilteredLeads
    : statusFilteredLeads.filter((lead) => {
        const provider = getProviderFromMX(lead.mx_record, lead.mx_provider);
        return mxFilters.includes(provider);
      });

  // Valid leads include both regular valid and catchall-verified/valid-catchall
  const validLeads = leads.filter((l) => 
    l.verification_status === "valid" || 
    l.verification_tag === "catchall-verified" || 
    l.verification_tag === "valid-catchall"
  );
  // Catchall leads that haven't been verified yet
  const catchallLeads = leads.filter((l) => 
    l.verification_status === "catchall" && 
    l.verification_tag !== "catchall-verified" && 
    l.verification_tag !== "valid-catchall"
  );
  const notFoundLeads = leads.filter((l) => l.verification_status === "invalid" || l.verification_status === "not_found");
  
  // Extract unique extra column names from all leads
  const extraColumns = useMemo(() => {
    const cols = new Set<string>();
    leads.forEach(lead => {
      if (lead.extra_data) {
        Object.keys(lead.extra_data).forEach(key => cols.add(key));
      }
    });
    return Array.from(cols).sort(); // Sort alphabetically for consistent ordering
  }, [leads]);
  
  // Calculate filtered counts for display in filter buttons
  const filteredValidLeads = filteredLeads.filter((l) => 
    l.verification_status === "valid" || 
    l.verification_tag === "catchall-verified" || 
    l.verification_tag === "valid-catchall"
  );
  const filteredCatchallLeads = filteredLeads.filter((l) => 
    l.verification_status === "catchall" && 
    l.verification_tag !== "catchall-verified" && 
    l.verification_tag !== "valid-catchall"
  );
  const filteredNotFoundLeads = filteredLeads.filter((l) => 
    l.verification_status === "invalid" || l.verification_status === "not_found"
  );
  
  // Check if user can verify catchalls (job has catchall leads)
  const canVerifyCatchalls = catchallLeads.length > 0;
  
  const totalVerified = validLeads.length; // Only count verified emails (includes valid-catchall)
  const totalCost = job ? (job.cost_in_credits || 0) * 0.1 : 0;
  const costPerEmail = totalVerified > 0 ? totalCost / totalVerified : 0;
  const competitorCost = totalVerified * 0.50; // Competitors charge $0.50 per email
  const savings = competitorCost - totalCost;
  
  const processingTime = job && job.completed_at && job.created_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000 / 60)
    : 0;

  const downloadCSV = () => {
    // Build headers: standard columns + extra columns from CSV
    const standardHeaders = ["First Name", "Last Name", "Website", "Email", "Status", "MX Type"];
    const headers = [...standardHeaders, ...extraColumns];
    
    // Helper to escape CSV values (handle commas, quotes, newlines)
    const escapeCSV = (value: string) => {
      if (!value) return "";
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };
    
    const csv = [
      headers.map(escapeCSV).join(","),
      ...filteredLeads.map((lead) => {
        const mxType = getProviderFromMX(lead.mx_record, lead.mx_provider);
        const mxTypeDisplay = mxType.charAt(0).toUpperCase() + mxType.slice(1); // Capitalize first letter
        
        // Standard values
        const standardValues = [
          lead.first_name,
          lead.last_name,
          lead.domain,
          lead.email,
          lead.verification_tag === "valid-catchall" ? "valid-catchall" : lead.verification_status,
          mxTypeDisplay,
        ];
        
        // Extra column values
        const extraValues = extraColumns.map(col => lead.extra_data?.[col] || "");
        
        return [...standardValues, ...extraValues].map(escapeCSV).join(",");
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${jobId}.csv`;
    a.click();
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
        <div className="bg-apple-error/20 border border-apple-error/30 text-apple-error px-4 py-3 rounded-lg">
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  // Determine back link based on job type
  const backLink = job?.job_type === 'verification' ? '/verify-emails' : '/find-valid-emails';
  const backLinkText = job?.job_type === 'verification' ? 'Back to Verify Emails' : 'Back to Find Valid Emails';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          href={backLink}
          className="text-apple-accent hover:opacity-80 transition-opacity mb-4 inline-block"
        >
          ← {backLinkText}
        </Link>
        <h1 className="text-3xl font-bold text-apple-text">Results</h1>
        <p className="mt-2 text-apple-text-muted">Job ID: {jobId}</p>
      </div>

      {/* Hit Rate Summary Banner - Only show after completion */}
      {job && (
        <div className="mb-8 bg-apple-surface border border-apple-border rounded-lg p-6">
          {job.status === "completed" ? (
            <h2 className="text-3xl font-bold text-[#007AFF]">
              {job.job_type === "enrichment"
                ? `${job.total_leads > 0 ? Math.min(((validLeads.length + catchallLeads.length) / job.total_leads) * 100, 100).toFixed(1) : "0.0"}% of Emails Were Found`
                : `${job.total_leads > 0 ? Math.min((validLeads.length / job.total_leads) * 100, 100).toFixed(1) : "0.0"}% of Emails Are Valid`
              }
            </h2>
          ) : job.status === "processing" ? (
            <h2 className="text-3xl font-bold text-apple-text-muted">
              Processing... {job.processed_leads}/{job.total_leads} leads
            </h2>
          ) : (
            <h2 className="text-3xl font-bold text-apple-text-muted">
              Status: {job.status}
            </h2>
          )}
        </div>
      )}

      {/* Stats Blocks - Click to Filter */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => setFilter("all")}
          className={`text-left bg-apple-surface border p-6 rounded-lg transition-all hover:border-apple-accent ${
            filter === "all" ? "border-apple-accent ring-2 ring-apple-accent/20" : "border-apple-border"
          }`}
        >
          <p className="text-sm text-apple-text-muted">Total Leads</p>
          <p className="text-2xl font-bold text-apple-text">{job.total_leads}</p>
        </button>
        <button
          onClick={() => setFilter("valid")}
          className={`text-left bg-apple-surface border p-6 rounded-lg transition-all hover:border-apple-accent ${
            filter === "valid" ? "border-apple-accent ring-2 ring-apple-accent/20" : "border-apple-border"
          }`}
        >
          <p className="text-sm text-apple-text-muted">Valid Emails</p>
          <p className="text-2xl font-bold text-apple-accent">
            {validLeads.length}
          </p>
        </button>
        <button
          onClick={() => setFilter("catchall")}
          className={`text-left bg-apple-surface border p-6 rounded-lg transition-all hover:border-yellow-500 ${
            filter === "catchall" ? "border-yellow-500 ring-2 ring-yellow-500/20" : "border-apple-border"
          }`}
        >
          <p className="text-sm text-apple-text-muted">Catchall Emails</p>
          <p className="text-2xl font-bold text-yellow-500">
            {catchallLeads.length}
          </p>
        </button>
        <button
          onClick={() => setFilter("invalid")}
          className={`text-left bg-apple-surface border p-6 rounded-lg transition-all hover:border-red-500 ${
            filter === "invalid" ? "border-red-500 ring-2 ring-red-500/20" : "border-apple-border"
          }`}
        >
          <p className="text-sm text-apple-text-muted">Not Found</p>
          <p className="text-2xl font-bold text-red-500">
            {notFoundLeads.length}
          </p>
        </button>
      </div>

      <div className="bg-apple-surface border border-apple-border rounded-lg p-6">
        <div className="mb-4">
          {/* Current Filter Info & MX Provider Filter */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div className="text-sm text-apple-text-muted">
              Showing <span className="font-medium text-apple-text">{filteredLeads.length}</span> {filter === "all" ? "leads" : filter === "valid" ? "valid emails" : filter === "catchall" ? "catchall emails" : "not found"}
              {mxFilters.length > 0 && <span> • Filtered by: {mxFilters.join(", ")}</span>}
            </div>
          </div>
          
          {/* MX Provider Filter */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-apple-text-muted">MX Provider:</span>
            <div className="flex space-x-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mxFilters.includes('outlook')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMxFilters([...mxFilters, 'outlook']);
                    } else {
                      setMxFilters(mxFilters.filter(f => f !== 'outlook'));
                    }
                  }}
                  className="w-4 h-4 rounded border-apple-border bg-apple-bg text-apple-accent focus:ring-apple-accent"
                />
                <span className="text-sm text-apple-text">Outlook Only</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mxFilters.includes('google')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMxFilters([...mxFilters, 'google']);
                    } else {
                      setMxFilters(mxFilters.filter(f => f !== 'google'));
                    }
                  }}
                  className="w-4 h-4 rounded border-apple-border bg-apple-bg text-apple-accent focus:ring-apple-accent"
                />
                <span className="text-sm text-apple-text">Google Only</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mxFilters.includes('other')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMxFilters([...mxFilters, 'other']);
                    } else {
                      setMxFilters(mxFilters.filter(f => f !== 'other'));
                    }
                  }}
                  className="w-4 h-4 rounded border-apple-border bg-apple-bg text-apple-accent focus:ring-apple-accent"
                />
                <span className="text-sm text-apple-text">Other MX</span>
              </label>
            </div>
            {mxFilters.length > 0 && (
              <button
                onClick={() => setMxFilters([])}
                className="text-xs text-apple-text-muted hover:text-apple-text underline"
              >
                Clear ({mxFilters.length})
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            {catchallLeads.length > 0 && (
              <button
                disabled={true}
                title="Catchall verification temporarily unavailable"
                className="px-4 py-2 bg-apple-surface text-apple-text-muted rounded-lg cursor-not-allowed transition-opacity text-sm font-medium flex items-center space-x-2 border border-apple-border"
              >
                <span>Verify Catchalls (Coming Soon)</span>
              </button>
            )}
            <button
              onClick={downloadCSV}
              className="px-4 py-2 bg-apple-accent text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              Download CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-apple-border">
            <thead className="bg-apple-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                  First Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                  Last Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                  Website
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                  MX Type
                </th>
                {/* Dynamic columns from extra_data */}
                {extraColumns.map((col) => (
                  <th key={col} className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-apple-surface divide-y divide-apple-border">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-apple-surface transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                    {lead.first_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                    {lead.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                    {lead.domain}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                    {lead.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          lead.verification_status === "valid" || lead.verification_tag === "valid-catchall"
                            ? "bg-apple-success/20 text-apple-success border border-apple-success/30"
                            : lead.verification_status === "catchall"
                            ? "bg-apple-warning/20 text-apple-warning border border-apple-warning/30"
                            : "bg-apple-error/20 text-apple-error border border-apple-error/30"
                        }`}
                      >
                        {lead.verification_tag === "valid-catchall" ? "valid-catchall" : lead.verification_status}
                      </span>
                      {lead.verification_tag === "catchall-verified" && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-apple-accent/20 text-apple-accent border border-apple-accent/30">
                          Catchall-Verified
                        </span>
                      )}
                      {lead.verification_tag === "valid-catchall" && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-apple-success/30 text-apple-success border border-apple-success/50">
                          Valid-Catchall
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                    {(() => {
                      const mxType = getProviderFromMX(lead.mx_record, lead.mx_provider);
                      return mxType.charAt(0).toUpperCase() + mxType.slice(1); // Capitalize first letter
                    })()}
                  </td>
                  {/* Dynamic cells from extra_data */}
                  {extraColumns.map((col) => (
                    <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                      {lead.extra_data?.[col] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

