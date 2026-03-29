"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { Speedometer } from "@/components/dashboard/Speedometer";
import { AnalyticsPanel } from "@/components/admin/AnalyticsPanel";

import { PLANS, formatCredits } from "@/lib/plans";

const PLAN_OPTIONS = PLANS.map((p) => ({ id: p.id, name: p.name }));

interface ClientData {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  credits: number;
  plan?: string;
  custom_credit_price?: number | null;
  max_concurrent_jobs: number;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  stats: {
    total_jobs: number;
    enrichment_jobs: number;
    verification_jobs: number;
    total_valid_emails: number;
    total_catchall_emails: number;
    total_leads_processed: number;
  };
}

interface FairshareStatus {
  active_job_count: number;
  queued_job_count: number;
  waiting_room_count: number;
  total_keys: number | null;
  active_jobs: Array<{
    job_id: string;
    user_id: string;
    user_email: string;
    job_type: string;
    total_leads: number;
    processed_leads: number;
    keys_allocated: number | null;
    throughput: {
      rate_per_hour: number;
      items_processed: number;
      window_seconds: number;
      timestamp: string;
    } | null;
  }>;
  queued_jobs: Array<{
    job_id: string;
    user_id: string;
    user_email: string;
    job_type: string;
    total_leads: number;
  }>;
  waiting_room_jobs: Array<{
    job_id: string;
    user_id: string;
    user_email: string;
    job_type: string;
    total_leads: number;
  }>;
}

interface AdminJob {
  id: string;
  status: string;
  job_type: string;
  original_filename: string | null;
  total_leads: number;
  processed_leads: number;
  valid_emails_found: number;
  catchall_emails_found: number;
  cost_in_credits: number;
  created_at: string;
  completed_at: string | null;
  file_url: string | null;
  failure_reason: string | null;
  client: {
    id: string;
    email: string;
    full_name: string | null;
    company_name: string | null;
  };
}

interface ApiKeyUsage {
  key_id: string;
  key_preview: string;
  usage_today: number;
  remaining: number;
  limit: number;
  usage_percentage: number;
  resets_at: string;
  date: string;
}

interface ErrorLog {
  timestamp: string;
  user_id: string;
  user_email: string;
  job_id: string;
  error_type: string;
  error_message: string;
  email_attempted: string | null;
}

export default function AdminConsolePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // State
  const [activeTab, setActiveTab] = useState<"overview" | "analytics" | "clients" | "jobs" | "api-keys" | "errors">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<{
    clients: { total: number; active: number };
    jobs: { total: number; by_status: Record<string, number>; today: number };
    leads: { total_processed: number; total_valid: number; total_catchall: number; today: number };
  } | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [lowCreditClients, setLowCreditClients] = useState<ClientData[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [apiKeyUsage, setApiKeyUsage] = useState<ApiKeyUsage[]>([]);
  const [omniCredits, setOmniCredits] = useState<{
    balance: number;
    last_credits_deducted: number | null;
    updated_at: string | null;
  } | null>(null);
  const [vayneStats, setVayneStats] = useState<{
    keys: Array<{
      key_index: number;
      key_preview: string;
      credit_available: number;
      daily_limit_leads: number;
      error: string | null;
    }>;
    total_credit_available: number;
    total_daily_limit_leads: number;
  } | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [errorSummary, setErrorSummary] = useState<{ total_errors: number; by_type: Record<string, number> } | null>(null);
  const chartPeriod = "week" as const;

  // Fair-share monitoring
  const [fairshareStatus, setFairshareStatus] = useState<FairshareStatus | null>(null);

  // Max jobs editing
  const [editingMaxJobsClientId, setEditingMaxJobsClientId] = useState<string | null>(null);
  const [maxJobsValue, setMaxJobsValue] = useState<string>("");
  const [maxJobsLoading, setMaxJobsLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState<string | null>(null);
  const [editingCustomPriceClientId, setEditingCustomPriceClientId] = useState<string | null>(null);
  const [customPriceValue, setCustomPriceValue] = useState<string>("");

  // Credit assignment state
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMessage, setCreditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Job deletion state
  const [deleteConfirmJobId, setDeleteConfirmJobId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Check if user is admin
  useEffect(() => {
    if (!authLoading && user && !user.is_admin) {
      router.push("/sales-nav-scraper");
    }
  }, [user, authLoading, router]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!user?.is_admin) return;

    try {
      setLoading(true);
      setError(null);

      const [statsRes, clientsRes, lowCreditRes, jobsRes, enrichmentRes, fairshareRes] = await Promise.all([
        apiClient.getAdminStats(),
        apiClient.getAdminClients(200),
        apiClient.getAdminLowCreditClients(10),
        apiClient.getAdminJobs(100),
        apiClient.getAdminEnrichmentStats(chartPeriod),
        apiClient.getAdminFairshareStatus().catch(() => null),
      ]);

      setStats(statsRes);
      setClients(clientsRes.clients);
      setLowCreditClients(lowCreditRes.clients as ClientData[]);
      setJobs(jobsRes.jobs);
      if (fairshareRes) setFairshareStatus(fairshareRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [user?.is_admin, chartPeriod]);

  // Fetch API key usage (separate for different refresh interval)
  const fetchApiKeyUsage = useCallback(async () => {
    if (!user?.is_admin) return;

    try {
      const res = await apiClient.getAdminApiKeyUsage();
      setApiKeyUsage(res.mailtester_keys);
      if (res.omniverifier && "balance" in res.omniverifier) {
        setOmniCredits(res.omniverifier as { balance: number; last_credits_deducted: number | null; updated_at: string | null });
      }
      
      // Fetch Vayne stats
      try {
        const vayneRes = await apiClient.getAdminVayneStats();
        setVayneStats(vayneRes);
      } catch (vayneErr) {
        console.error("Failed to fetch Vayne stats:", vayneErr);
        // Don't set error state, just log it
      }
    } catch (err) {
      console.error("Failed to fetch API key usage:", err);
    }
  }, [user?.is_admin]);

  // Fetch errors
  const fetchErrors = useCallback(async () => {
    if (!user?.is_admin) return;

    try {
      const res = await apiClient.getAdminErrors(undefined, 100);
      setErrors(res.errors);
      setErrorSummary(res.summary);
    } catch (err) {
      console.error("Failed to fetch errors:", err);
    }
  }, [user?.is_admin]);

  // Initial fetch
  useEffect(() => {
    fetchData();
    fetchApiKeyUsage();
    fetchErrors();
  }, [fetchData, fetchApiKeyUsage, fetchErrors]);

  // Auto-refresh: API keys every 1 minute
  useEffect(() => {
    const interval = setInterval(fetchApiKeyUsage, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchApiKeyUsage]);

  // Auto-refresh: Jobs and errors every 1 minute
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
      fetchErrors();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, fetchErrors]);

  // Handle credit assignment
  const handleCreditAssignment = async () => {
    if (!selectedClientId || !creditAmount) {
      setCreditMessage({ type: "error", text: "Please select a client and enter credit amount" });
      return;
    }

    const credits = parseInt(creditAmount);
    if (isNaN(credits) || credits < 0) {
      setCreditMessage({ type: "error", text: "Please enter a valid credit amount" });
      return;
    }

    try {
      setCreditLoading(true);
      const res = await apiClient.updateAdminClientCredits(selectedClientId, credits);
      setCreditMessage({ type: "success", text: res.message });
      // Refresh clients list
      const clientsRes = await apiClient.getAdminClients(200);
      setClients(clientsRes.clients);
      // Reset form
      setSelectedClientId("");
      setCreditAmount("");
    } catch (err) {
      setCreditMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update credits" });
    } finally {
      setCreditLoading(false);
    }
  };

  // Handle max concurrent jobs update
  const handleMaxJobsUpdate = async (clientId: string) => {
    const val = parseInt(maxJobsValue);
    if (isNaN(val) || val < 1 || val > 50) return;

    try {
      setMaxJobsLoading(true);
      const res = await apiClient.updateClientMaxJobs(clientId, val);
      setClients(prev =>
        prev.map(c => c.id === clientId ? { ...c, max_concurrent_jobs: res.max_concurrent_jobs } : c)
      );
      setEditingMaxJobsClientId(null);
      setMaxJobsValue("");
      if (res.promoted_from_waiting_room > 0) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update max jobs:", err);
    } finally {
      setMaxJobsLoading(false);
    }
  };

  const handlePlanChange = async (clientId: string, newPlan: string) => {
    try {
      setPlanLoading(clientId);
      const res = await apiClient.updateClientPlan(clientId, newPlan);
      setClients(prev =>
        prev.map(c => c.id === clientId ? {
          ...c,
          plan: res.new_plan,
          custom_credit_price: res.new_plan !== "custom" ? null : c.custom_credit_price,
        } : c)
      );
    } catch (err) {
      console.error("Failed to update plan:", err);
      alert(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setPlanLoading(null);
    }
  };

  const handleCustomPriceSubmit = async (clientId: string) => {
    const val = parseFloat(customPriceValue);
    if (isNaN(val) || val <= 0) return;
    try {
      setPlanLoading(clientId);
      const res = await apiClient.updateClientCustomCreditPrice(clientId, val);
      setClients(prev =>
        prev.map(c => c.id === clientId ? { ...c, custom_credit_price: res.custom_credit_price } : c)
      );
      setEditingCustomPriceClientId(null);
      setCustomPriceValue("");
    } catch (err) {
      console.error("Failed to update custom price:", err);
    } finally {
      setPlanLoading(null);
    }
  };

  // Handle impersonation - login as client
  const handleImpersonate = async (clientId: string, clientEmail: string) => {
    try {
      const res = await apiClient.impersonateClient(clientId);
      // Save admin token so we can return later
      const currentToken = document.cookie.split(";").find(c => c.trim().startsWith("token="));
      if (currentToken) {
        const adminToken = currentToken.trim().split("=").slice(1).join("=");
        localStorage.setItem("admin_token", adminToken);
        localStorage.setItem("impersonating", clientEmail);
      }
      // Set client token
      document.cookie = `token=${res.access_token}; path=/; max-age=604800; SameSite=Lax`;
      // Redirect to client dashboard
      window.location.href = "/verify-emails";
    } catch (err) {
      console.error("Failed to impersonate:", err);
      alert(err instanceof Error ? err.message : "Failed to login as client");
    }
  };

  // Handle job deletion (admin can delete any job)
  const handleDeleteJob = async (jobId: string) => {
    if (deleteConfirmJobId !== jobId) {
      // First click - show confirmation
      setDeleteConfirmJobId(jobId);
      return;
    }

    // Second click - delete the job
    try {
      setDeleteLoading(true);
      await apiClient.adminDeleteJob(jobId);
      // Remove job from local state
      setJobs(prevJobs => prevJobs.filter(j => j.id !== jobId));
      setDeleteConfirmJobId(null);
    } catch (err) {
      console.error("Failed to delete job:", err);
      alert(err instanceof Error ? err.message : "Failed to delete job");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dashboard-accent"></div>
      </div>
    );
  }

  // Not admin
  if (!user?.is_admin) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-dashboard-text mb-4">Access Denied</h1>
        <p className="text-dashboard-text-muted">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dashboard-text">Admin Console</h1>
        <p className="text-dashboard-text-muted mt-2">Platform overview and management</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-dashboard-border pb-4 overflow-x-auto">
        {[
          { id: "overview", label: "Overview" },
          { id: "analytics", label: "Analytics" },
          { id: "clients", label: "Clients" },
          { id: "jobs", label: "All Jobs" },
          { id: "api-keys", label: "API Keys" },
          { id: "errors", label: "Error Logs" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-dashboard-accent text-white"
                : "text-dashboard-text-muted hover:bg-dashboard-card hover:text-dashboard-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Clients" value={stats?.clients.total || 0} subtitle={`${stats?.clients.active || 0} active`} />
            <StatCard title="Total Jobs" value={stats?.jobs.total || 0} subtitle={`${stats?.jobs.today || 0} today`} />
            <StatCard title="Valid Emails Found" value={stats?.leads.total_valid || 0} color="green" />
            <StatCard title="Leads Processed Today" value={stats?.leads.today || 0} color="blue" />
          </div>

          {/* Fair-Share Monitoring Panel */}
          {fairshareStatus && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-dashboard-text mb-4">Fair-Share Job Pool</h2>
              
              {/* Summary counters */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{fairshareStatus.active_job_count}</div>
                  <div className="text-xs text-dashboard-text-muted mt-1">Active Jobs</div>
                </div>
                <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{fairshareStatus.queued_job_count}</div>
                  <div className="text-xs text-dashboard-text-muted mt-1">Queued</div>
                </div>
                <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">{fairshareStatus.waiting_room_count}</div>
                  <div className="text-xs text-dashboard-text-muted mt-1">Waiting Room</div>
                </div>
              </div>

              {/* Active jobs detail */}
              {fairshareStatus.active_jobs.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Active Jobs</h3>
                  <div className="space-y-2">
                    {fairshareStatus.active_jobs.map((job) => (
                      <div key={job.job_id} className="flex items-center justify-between bg-dashboard-card/30 rounded-lg px-4 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-dashboard-text">{job.user_email}</span>
                          <span className="text-dashboard-text-muted text-xs">({job.job_type})</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-dashboard-text-muted text-xs">
                            {job.processed_leads}/{job.total_leads} leads
                          </span>
                          {job.keys_allocated != null && (
                            <span className="text-purple-400 text-xs font-medium" title="API keys actively assigned to this job">
                              {job.keys_allocated}/{fairshareStatus.total_keys ?? "?"} keys
                            </span>
                          )}
                          {job.throughput && (
                            <span className="text-blue-400 text-xs font-medium">
                              {job.throughput.rate_per_hour.toLocaleString()}/hr
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Queued jobs detail */}
              {fairshareStatus.queued_jobs.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Queued</h3>
                  <div className="space-y-1">
                    {fairshareStatus.queued_jobs.map((job) => (
                      <div key={job.job_id} className="flex items-center justify-between bg-dashboard-card/20 rounded px-4 py-1.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                          <span className="text-dashboard-text-muted">{job.user_email}</span>
                          <span className="text-dashboard-text-muted text-xs">({job.job_type})</span>
                        </div>
                        <span className="text-dashboard-text-muted text-xs">{job.total_leads} leads</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waiting room detail */}
              {fairshareStatus.waiting_room_jobs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Waiting Room</h3>
                  <div className="space-y-1">
                    {fairshareStatus.waiting_room_jobs.map((job) => (
                      <div key={job.job_id} className="flex items-center justify-between bg-dashboard-card/20 rounded px-4 py-1.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 bg-orange-400 rounded-full" />
                          <span className="text-dashboard-text-muted">{job.user_email}</span>
                          <span className="text-dashboard-text-muted text-xs">({job.job_type})</span>
                        </div>
                        <span className="text-dashboard-text-muted text-xs">{job.total_leads} leads</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fairshareStatus.active_job_count === 0 && fairshareStatus.queued_job_count === 0 && fairshareStatus.waiting_room_count === 0 && (
                <p className="text-dashboard-text-muted text-sm text-center py-4">No active or queued jobs</p>
              )}
            </div>
          )}

          {/* Sales Nav Jobs Panel */}
          {(() => {
            const salesNavActive = jobs.filter(j => j.job_type === "sales_nav" && j.status === "processing");
            const salesNavQueued = jobs.filter(j => j.job_type === "sales_nav" && (j.status === "pending" || j.status === "queued"));
            return (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-dashboard-text mb-4">Sales Nav Jobs</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">{salesNavActive.length}</div>
                    <div className="text-xs text-dashboard-text-muted mt-1">Active</div>
                  </div>
                  <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-400">{salesNavQueued.length}</div>
                    <div className="text-xs text-dashboard-text-muted mt-1">Queued</div>
                  </div>
                </div>

                {salesNavActive.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Active</h3>
                    <div className="space-y-2">
                      {salesNavActive.map((job) => (
                        <div key={job.id} className="flex items-center justify-between bg-dashboard-card/30 rounded-lg px-4 py-2 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="text-dashboard-text">{job.client.email}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-dashboard-text-muted text-xs">
                              {job.processed_leads}/{job.total_leads} leads
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {salesNavQueued.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Queued</h3>
                    <div className="space-y-1">
                      {salesNavQueued.map((job) => (
                        <div key={job.id} className="flex items-center justify-between bg-dashboard-card/20 rounded px-4 py-1.5 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                            <span className="text-dashboard-text-muted">{job.client.email}</span>
                          </div>
                          <span className="text-dashboard-text-muted text-xs">{job.total_leads} leads</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {salesNavActive.length === 0 && salesNavQueued.length === 0 && (
                  <p className="text-dashboard-text-muted text-sm text-center py-4">No active or queued Sales Nav jobs</p>
                )}
              </div>
            );
          })()}

          {/* Catchall Jobs Panel */}
          {(() => {
            const catchallActive = jobs.filter(j => j.job_type === "catchall_verification" && j.status === "processing");
            const catchallQueued = jobs.filter(j => j.job_type === "catchall_verification" && (j.status === "pending" || j.status === "queued"));
            return (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-dashboard-text mb-4">Catchall Verification Jobs</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">{catchallActive.length}</div>
                    <div className="text-xs text-dashboard-text-muted mt-1">Active</div>
                  </div>
                  <div className="bg-dashboard-card/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-400">{catchallQueued.length}</div>
                    <div className="text-xs text-dashboard-text-muted mt-1">Queued</div>
                  </div>
                </div>

                {catchallActive.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Active</h3>
                    <div className="space-y-2">
                      {catchallActive.map((job) => (
                        <div key={job.id} className="flex items-center justify-between bg-dashboard-card/30 rounded-lg px-4 py-2 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="text-dashboard-text">{job.client.email}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-dashboard-text-muted text-xs">
                              {job.processed_leads}/{job.total_leads} emails
                            </span>
                            {job.valid_emails_found > 0 && (
                              <span className="text-green-400 text-xs">{job.valid_emails_found} valid</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {catchallQueued.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-dashboard-text-muted mb-2">Queued</h3>
                    <div className="space-y-1">
                      {catchallQueued.map((job) => (
                        <div key={job.id} className="flex items-center justify-between bg-dashboard-card/20 rounded px-4 py-1.5 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                            <span className="text-dashboard-text-muted">{job.client.email}</span>
                          </div>
                          <span className="text-dashboard-text-muted text-xs">{job.total_leads} emails</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {catchallActive.length === 0 && catchallQueued.length === 0 && (
                  <p className="text-dashboard-text-muted text-sm text-center py-4">No active or queued catchall jobs</p>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <AnalyticsPanel
          clients={clients.map((c) => ({
            id: c.id,
            email: c.email,
            full_name: c.full_name,
            company_name: c.company_name,
          }))}
        />
      )}

      {/* Clients Tab */}
      {activeTab === "clients" && (
        <div className="space-y-6">
          {/* Credit Assignment Section */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-dashboard-text mb-4">Update Client Credits</h2>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-dashboard-text-muted mb-2">Select Client</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="apple-input w-full"
                >
                  <option value="">-- Select a client --</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.email} ({client.credits} credits)
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-[150px]">
                <label className="block text-sm text-dashboard-text-muted mb-2">Update credit amount to:</label>
                <input
                  type="number"
                  min="0"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="Enter credits"
                  className="apple-input w-full"
                />
              </div>
              <button
                onClick={handleCreditAssignment}
                disabled={creditLoading}
                className="px-6 py-2 bg-dashboard-accent text-white rounded-lg font-medium hover:bg-dashboard-accent/90 disabled:opacity-50 transition-all"
              >
                {creditLoading ? "Updating..." : "Update Credits"}
              </button>
            </div>
            {creditMessage && (
              <div className={`mt-4 px-4 py-2 rounded-lg ${creditMessage.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {creditMessage.text}
              </div>
            )}
          </div>

          {/* Low Credit Alerts */}
          {lowCreditClients.length > 0 && (
            <div className="glass-card bg-red-500/5 border-red-500/30 p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-4">⚠️ Low Credit Clients ({lowCreditClients.length})</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {lowCreditClients.map((client) => (
                  <div key={client.id} className="glass-card-hover border-red-500/20 p-3">
                    <p className="font-medium text-dashboard-text truncate">{client.email}</p>
                    <p className="text-sm text-red-400">{client.credits} credits remaining</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }} className="border-b border-dashboard-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Company</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-dashboard-text-muted uppercase">Plan</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Credits</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-dashboard-text-muted uppercase">Max Jobs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Jobs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Valid Emails</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Created</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-dashboard-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-dashboard-card/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-dashboard-text">{client.email}</span>
                        {client.is_admin && (
                          <span className="px-2 py-0.5 text-xs bg-dashboard-accent/20 text-dashboard-accent rounded">Admin</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-dashboard-text-muted">{client.company_name || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <select
                          value={client.plan || "trial"}
                          onChange={(e) => handlePlanChange(client.id, e.target.value)}
                          disabled={planLoading === client.id}
                          className="bg-dashboard-card border border-dashboard-border text-dashboard-text text-xs rounded px-2 py-1 focus:border-dashboard-accent focus:outline-none"
                        >
                          {PLAN_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                          ))}
                        </select>
                        {client.plan === "custom" && (
                          editingCustomPriceClientId === client.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                className="bg-dashboard-bg border border-dashboard-border text-dashboard-text rounded px-1 py-0.5 text-xs w-20 text-center"
                                value={customPriceValue}
                                onChange={(e) => setCustomPriceValue(e.target.value)}
                                placeholder="0.0015"
                              />
                              <button onClick={() => handleCustomPriceSubmit(client.id)} className="text-green-400 hover:text-green-300 text-xs">Save</button>
                              <button onClick={() => setEditingCustomPriceClientId(null)} className="text-red-400 hover:text-red-300 text-xs">×</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingCustomPriceClientId(client.id);
                                setCustomPriceValue(client.custom_credit_price?.toString() ?? "");
                              }}
                              className="text-xs text-dashboard-accent hover:underline"
                            >
                              {client.custom_credit_price ? `$${client.custom_credit_price}/cr` : "Set price"}
                            </button>
                          )
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${client.credits < 10 ? "text-red-400" : "text-dashboard-text"}`}>
                      {formatCredits(client.credits)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingMaxJobsClientId === client.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={maxJobsValue}
                            onChange={(e) => setMaxJobsValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleMaxJobsUpdate(client.id);
                              if (e.key === "Escape") { setEditingMaxJobsClientId(null); setMaxJobsValue(""); }
                            }}
                            className="apple-input w-16 text-center text-sm py-1"
                            autoFocus
                          />
                          <button
                            onClick={() => handleMaxJobsUpdate(client.id)}
                            disabled={maxJobsLoading}
                            className="text-green-400 hover:text-green-300 text-xs"
                          >
                            {maxJobsLoading ? "..." : "Save"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingMaxJobsClientId(client.id); setMaxJobsValue(String(client.max_concurrent_jobs || 3)); }}
                          className="text-dashboard-text hover:text-dashboard-accent transition-colors"
                          title="Click to edit"
                        >
                          {client.max_concurrent_jobs || 3}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-dashboard-text">{client.stats.total_jobs}</td>
                    <td className="px-4 py-3 text-right text-green-400">{client.stats.total_valid_emails}</td>
                    <td className="px-4 py-3 text-dashboard-text-muted text-sm">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!client.is_admin && (
                        <button
                          onClick={() => handleImpersonate(client.id, client.email)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-dashboard-accent/20 text-dashboard-accent hover:bg-dashboard-accent/30 transition-colors"
                        >
                          Login
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === "jobs" && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }} className="border-b border-dashboard-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Leads</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Valid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Catchall</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dashboard-text-muted uppercase">Hit Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                {jobs.map((job) => {
                  const isSalesNav = job.job_type === "sales_nav";
                  const isCatchall = job.job_type === "catchall_verification";
                  const isCompleted = job.status === "completed";
                  const isEnrichment = job.job_type === "enrichment";
                  let hitRateDisplay = "--";
                  
                  if (!isSalesNav && isCompleted && job.total_leads > 0) {
                    const rawHitRate = isEnrichment
                      ? ((job.valid_emails_found + job.catchall_emails_found) / job.total_leads * 100)
                      : ((job.valid_emails_found) / job.total_leads * 100);
                    hitRateDisplay = `${Math.min(rawHitRate, 100).toFixed(1)}%`;
                  }
                  
                  const typeBadgeClass = isSalesNav
                    ? "bg-orange-500/20 text-orange-400"
                    : isCatchall
                    ? "bg-cyan-500/20 text-cyan-400"
                    : isEnrichment
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-purple-500/20 text-purple-400";

                  const typeLabel = isSalesNav
                    ? "Sales Nav"
                    : isCatchall
                    ? "Catchall"
                    : job.job_type;

                  return (
                  <tr 
                    key={job.id} 
                    className="hover:bg-dashboard-card/50 cursor-pointer"
                    onClick={() => {
                      if (!isSalesNav) router.push(`/results/${job.id}`);
                    }}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-dashboard-text font-medium truncate max-w-[200px]">{job.client.email}</p>
                        <p className="text-xs text-dashboard-text-muted">{job.client.company_name || "-"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded ${typeBadgeClass}`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative group inline-block">
                        <StatusBadge status={job.status} />
                        {job.status === "failed" && job.failure_reason && (
                          <>
                            <span className="ml-1 text-red-400 text-xs cursor-help">&#9432;</span>
                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64 p-2 rounded-lg bg-dashboard-card border border-dashboard-border shadow-xl text-xs text-dashboard-text-muted">
                              {job.failure_reason}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-dashboard-text">
                      {isSalesNav ? (job.processed_leads || job.total_leads || "--") : job.total_leads}
                    </td>
                    <td className="px-4 py-3 text-right text-green-400">
                      {isSalesNav ? "--" : job.valid_emails_found}
                    </td>
                    <td className="px-4 py-3 text-right text-yellow-400">
                      {isSalesNav ? "--" : job.catchall_emails_found}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${!isSalesNav && isCompleted ? 'text-green-400' : 'text-dashboard-text-muted'}`}>
                        {hitRateDisplay}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-dashboard-text-muted text-sm">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isSalesNav ? (
                          job.file_url ? (
                            <a
                              href={job.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-dashboard-accent hover:underline text-sm"
                            >
                              Download
                            </a>
                          ) : (
                            <span className="text-dashboard-text-muted text-sm">--</span>
                          )
                        ) : (
                          <Link
                            href={`/results/${job.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-dashboard-accent hover:underline text-sm"
                          >
                            View
                          </Link>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteJob(job.id);
                          }}
                          disabled={deleteLoading}
                          className={`text-sm px-2 py-1 rounded transition-colors ${
                            deleteConfirmJobId === job.id
                              ? "bg-red-500 text-white hover:bg-red-600"
                              : "text-red-400 hover:bg-red-500/20"
                          } disabled:opacity-50`}
                        >
                          {deleteLoading && deleteConfirmJobId === job.id
                            ? "..."
                            : deleteConfirmJobId === job.id
                            ? "Confirm"
                            : "Delete"}
                        </button>
                        {deleteConfirmJobId === job.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmJobId(null);
                            }}
                            className="text-sm text-dashboard-text-muted hover:text-dashboard-text"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === "api-keys" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-dashboard-text">MailTester API Keys</h2>
            <p className="text-sm text-dashboard-text-muted">Auto-refreshes every minute</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {apiKeyUsage.length > 0 ? (
              apiKeyUsage.map((key, index) => {
                // Check if any jobs are currently processing (key is active)
                const hasActiveJobs = jobs.some(j => j.status === "processing");
                // With multiple keys, distribute active status
                // First key is primary, second is backup (both can be active if both have capacity)
                const isKeyActive = hasActiveJobs && key.remaining > 0;
                
                // Health status based on usage percentage
                const healthStatus = key.usage_percentage > 90 ? 'critical' : 
                                     key.usage_percentage > 80 ? 'warning' : 
                                     key.usage_percentage > 50 ? 'moderate' : 'healthy';
                
                const healthColors = {
                  critical: { bg: 'bg-red-500/20', text: 'text-red-400', glow: 'shadow-red-500/50' },
                  warning: { bg: 'bg-orange-500/20', text: 'text-orange-400', glow: 'shadow-orange-500/50' },
                  moderate: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', glow: 'shadow-yellow-500/50' },
                  healthy: { bg: 'bg-green-500/20', text: 'text-green-400', glow: 'shadow-green-500/50' }
                };
                
                const colors = healthColors[healthStatus];
                
                return (
                <div 
                  key={key.key_id} 
                  className={`glass-card p-6 transition-all ${
                    isKeyActive 
                      ? `border-dashboard-accent shadow-lg ${colors.glow}` 
                      : ''
                  }`}
                >
                  <div className="flex gap-6">
                    {/* Speedometer - explicitly pass 0 or 170 */}
                    <div className="flex-shrink-0">
                      <Speedometer 
                        value={isKeyActive ? 170 : 0} 
                        max={170}
                        label={key.key_preview}
                        isActive={isKeyActive}
                      />
                    </div>
                    
                    {/* Key Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-dashboard-text">{key.key_preview}</p>
                            {/* Health indicator dot */}
                            <span className={`w-2 h-2 rounded-full ${
                              healthStatus === 'critical' ? 'bg-red-500 animate-pulse' :
                              healthStatus === 'warning' ? 'bg-orange-500' :
                              healthStatus === 'moderate' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`} title={`Status: ${healthStatus}`} />
                            {isKeyActive && (
                              <span className="text-xs bg-dashboard-accent/20 text-dashboard-accent px-2 py-0.5 rounded-full">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-dashboard-text-muted">Key {index + 1} • ID: {key.key_id}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${colors.bg} ${colors.text}`}>
                          {key.usage_percentage.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-dashboard-text-muted">Usage Today</span>
                          <span className="text-dashboard-text">{key.usage_today.toLocaleString()} / {key.limit.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-dashboard-card rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              healthStatus === 'critical' ? 'bg-red-500' :
                              healthStatus === 'warning' ? 'bg-orange-500' :
                              healthStatus === 'moderate' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(key.usage_percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-dashboard-text-muted">
                          Remaining: <span className="text-dashboard-text font-medium">{key.remaining.toLocaleString()}</span>
                        </p>
                        {key.remaining < 50000 && (
                          <span className="text-xs text-orange-400">⚠️ Low capacity</span>
                        )}
                      </div>
                      <p className="text-xs text-dashboard-text-muted mt-1">
                        Resets at midnight GMT+2
                      </p>
                    </div>
                  </div>
                </div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-8 text-dashboard-text-muted">
                No MailTester API keys configured
              </div>
            )}
          </div>
          
          {/* Multi-key info banner */}
          {apiKeyUsage.length > 1 && (
            <div className="glass-card bg-dashboard-accent/10 border-dashboard-accent/20 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-dashboard-accent mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-dashboard-text font-medium">Multi-Key Load Balancing Active</p>
                  <p className="text-xs text-dashboard-text-muted mt-1">
                    Workers automatically use the key with the most remaining capacity. If a key encounters errors, 
                    it will automatically switch to a healthy backup key. Total daily capacity: {' '}
                    <span className="text-dashboard-accent font-medium">
                      {(apiKeyUsage.reduce((sum, k) => sum + k.limit, 0)).toLocaleString()}
                    </span>
                    {' '}verifications.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* OmniVerifier Catchall Credits */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-dashboard-text mb-4">OmniVerifier Catchall Credits</h3>
            {omniCredits ? (
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold text-cyan-400">{omniCredits.balance.toLocaleString()}</p>
                  <p className="text-sm text-dashboard-text-muted mt-1">Available catchall verification credits</p>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  {omniCredits.last_credits_deducted != null && (
                    <div>
                      <span className="text-dashboard-text-muted">Last deduction: </span>
                      <span className="text-dashboard-text font-medium">{omniCredits.last_credits_deducted.toLocaleString()}</span>
                    </div>
                  )}
                  {omniCredits.updated_at && (
                    <div>
                      <span className="text-dashboard-text-muted">Last updated: </span>
                      <span className="text-dashboard-text font-medium">
                        {new Date(omniCredits.updated_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-dashboard-text-muted">
                No balance data yet — balance is recorded after the first catchall job runs.
              </p>
            )}
          </div>

          {/* Vayne Per-Key Stats */}
          {vayneStats && vayneStats.keys?.length > 0 && (
            <>
              <h3 className="text-lg font-semibold text-dashboard-text">Vayne Scraper Keys</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vayneStats.keys.map((key) => {
                  const hasError = !!key.error;
                  return (
                    <div
                      key={key.key_index}
                      className={`glass-card p-6 transition-all ${hasError ? 'border-red-500/40' : 'border-dashboard-accent/30'}`}
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <span className="font-mono text-dashboard-text">{key.key_preview}</span>
                        {hasError ? (
                          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">ERROR</span>
                        ) : (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">OK</span>
                        )}
                        <span className="text-xs text-dashboard-text-muted ml-auto">Key {key.key_index}</span>
                      </div>

                      {hasError ? (
                        <p className="text-sm text-red-400 break-words">{key.error}</p>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-dashboard-text-muted mb-1">Credits Available</p>
                            <p className="text-2xl font-bold text-dashboard-accent">{key.credit_available.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-dashboard-text-muted mb-1">Daily Lead Limit</p>
                            <p className="text-2xl font-bold text-dashboard-text">{key.daily_limit_leads.toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {vayneStats.keys.length > 1 && (
                <div className="glass-card bg-dashboard-accent/10 border-dashboard-accent/20 p-4">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-dashboard-text-muted">Totals across {vayneStats.keys.length} keys:</span>
                    <span className="text-dashboard-text font-medium">
                      {vayneStats.total_credit_available.toLocaleString()} credits
                    </span>
                    <span className="text-dashboard-text-muted">|</span>
                    <span className="text-dashboard-text font-medium">
                      {vayneStats.total_daily_limit_leads.toLocaleString()} daily leads
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === "errors" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-dashboard-text">Verification Error Logs</h2>
              <p className="text-sm text-dashboard-text-muted">
                {errorSummary?.total_errors || 0} errors today • Auto-refreshes every minute
              </p>
            </div>
          </div>

          {/* Error Summary */}
          {errorSummary && errorSummary.total_errors > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(errorSummary.by_type).map(([type, count]) => (
                <div key={type} className="glass-card bg-red-500/5 border-red-500/20 p-4">
                  <p className="text-sm text-dashboard-text-muted">{type.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold text-red-400">{count}</p>
                </div>
              ))}
            </div>
          )}

          {/* Error Table */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }} className="border-b border-dashboard-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Job ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase">Message</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                  {errors.length > 0 ? (
                    errors.map((err, i) => (
                      <tr key={i} className="hover:bg-dashboard-card/50">
                        <td className="px-4 py-3 text-sm text-dashboard-text-muted whitespace-nowrap">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-dashboard-text truncate max-w-[150px]">{err.user_email}</td>
                        <td className="px-4 py-3">
                          <Link href={`/results/${err.job_id}`} className="text-dashboard-accent hover:underline text-sm font-mono">
                            {err.job_id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded">
                            {err.error_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-dashboard-text-muted truncate max-w-[300px]">
                          {err.error_message}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-dashboard-text-muted">
                        No errors logged today 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ title, value, subtitle, color }: { title: string; value: number; subtitle?: string; color?: "green" | "blue" }) {
  const colorClasses = {
    green: "text-green-400",
    blue: "text-dashboard-accent",
  };

  return (
    <div className="glass-card p-6">
      <p className="text-sm text-dashboard-text-muted mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color ? colorClasses[color] : "text-dashboard-text"}`}>
        {value.toLocaleString()}
      </p>
      {subtitle && <p className="text-sm text-dashboard-text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusClasses: Record<string, string> = {
    completed: "bg-green-500/20 text-green-400",
    processing: "bg-blue-500/20 text-blue-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    queued: "bg-yellow-500/20 text-yellow-400",
    waiting: "bg-orange-500/20 text-orange-400",
    failed: "bg-red-500/20 text-red-400",
    cancelled: "bg-gray-500/20 text-gray-400",
  };

  const displayLabel: Record<string, string> = {
    waiting: "Waiting Room",
  };

  return (
    <span className={`px-2 py-1 text-xs rounded ${statusClasses[status] || statusClasses.pending}`}>
      {displayLabel[status] || status}
    </span>
  );
}

