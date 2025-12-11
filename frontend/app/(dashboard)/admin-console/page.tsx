"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { Speedometer } from "@/components/dashboard/Speedometer";

// Types for admin data
interface ClientData {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  credits: number;
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

interface ChartData {
  date: string;
  leads_enriched: number;
  valid_found: number;
  catchall_found: number;
  jobs_count: number;
}

export default function AdminConsolePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // State
  const [activeTab, setActiveTab] = useState<"overview" | "clients" | "jobs" | "api-keys" | "errors">("overview");
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
  const [omniCredits, setOmniCredits] = useState<{ available: number } | null>(null);
  const [vayneStats, setVayneStats] = useState<{
    available_credits: number;
    leads_scraped_today: number;
    daily_limit: number;
    daily_limit_accounts?: number;
    enrichment_credits?: number;
    subscription_plan?: string | null;
    subscription_expires_at?: string | null;
    calls_today: number;
    date: string;
    error?: string;
  } | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [errorSummary, setErrorSummary] = useState<{ total_errors: number; by_type: Record<string, number> } | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartPeriod, setChartPeriod] = useState<"day" | "week" | "month">("week");

  // Credit assignment state
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMessage, setCreditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Check if user is admin
  useEffect(() => {
    if (!authLoading && user && !user.is_admin) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!user?.is_admin) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [statsRes, clientsRes, lowCreditRes, jobsRes, enrichmentRes] = await Promise.all([
        apiClient.getAdminStats(),
        apiClient.getAdminClients(200),
        apiClient.getAdminLowCreditClients(10),
        apiClient.getAdminJobs(100),
        apiClient.getAdminEnrichmentStats(chartPeriod),
      ]);

      setStats(statsRes);
      setClients(clientsRes.clients);
      setLowCreditClients(lowCreditRes.clients as ClientData[]);
      setJobs(jobsRes.jobs);
      setChartData(enrichmentRes.chart_data);
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
      if (res.omniverifier && "available" in res.omniverifier) {
        setOmniCredits(res.omniverifier);
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

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-apple-accent"></div>
      </div>
    );
  }

  // Not admin
  if (!user?.is_admin) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-apple-text mb-4">Access Denied</h1>
        <p className="text-apple-text-muted">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text">Admin Console</h1>
        <p className="text-apple-text-muted mt-2">Platform overview and management</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-apple-border pb-4 overflow-x-auto">
        {[
          { id: "overview", label: "Overview" },
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
                ? "bg-apple-accent text-white"
                : "text-apple-text-muted hover:bg-apple-surface hover:text-apple-text"
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

          {/* Credit Assignment Section */}
          <div className="bg-apple-surface border border-apple-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-apple-text mb-4">Update Client Credits</h2>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-apple-text-muted mb-2">Select Client</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-4 py-2 bg-apple-bg border border-apple-border rounded-lg text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent"
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
                <label className="block text-sm text-apple-text-muted mb-2">Update credit amount to:</label>
                <input
                  type="number"
                  min="0"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="Enter credits"
                  className="w-full px-4 py-2 bg-apple-bg border border-apple-border rounded-lg text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent"
                />
              </div>
              <button
                onClick={handleCreditAssignment}
                disabled={creditLoading}
                className="px-6 py-2 bg-apple-accent text-white rounded-lg font-medium hover:bg-apple-accent/90 disabled:opacity-50 transition-all"
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

          {/* Chart Section */}
          <div className="bg-apple-surface border border-apple-border rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-apple-text">Enrichment Activity</h2>
              <div className="flex gap-2">
                {["day", "week", "month"].map((period) => (
                  <button
                    key={period}
                    onClick={() => setChartPeriod(period as typeof chartPeriod)}
                    className={`px-3 py-1 rounded text-sm ${
                      chartPeriod === period
                        ? "bg-apple-accent text-white"
                        : "bg-apple-bg text-apple-text-muted hover:text-apple-text"
                    }`}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {/* Simple bar chart */}
            <div className="h-[200px] flex items-end gap-1">
              {chartData.length > 0 ? (
                chartData.map((d, i) => {
                  const maxVal = Math.max(...chartData.map((c) => c.leads_enriched), 1);
                  const height = (d.leads_enriched / maxVal) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-apple-accent/70 rounded-t hover:bg-apple-accent transition-all"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${d.date}: ${d.leads_enriched} leads`}
                      />
                      <span className="text-[10px] text-apple-text-muted truncate max-w-full">
                        {d.date.slice(5)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex-1 flex items-center justify-center text-apple-text-muted">
                  No data for this period
                </div>
              )}
            </div>
          </div>

          {/* Low Credit Alerts */}
          {lowCreditClients.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-4">⚠️ Low Credit Clients ({lowCreditClients.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowCreditClients.map((client) => (
                  <div key={client.id} className="bg-apple-bg border border-red-500/20 rounded-lg p-3">
                    <p className="font-medium text-apple-text truncate">{client.email}</p>
                    <p className="text-sm text-red-400">{client.credits} credits remaining</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clients Tab */}
      {activeTab === "clients" && (
        <div className="bg-apple-surface border border-apple-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-apple-bg border-b border-apple-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Company</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Credits</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Jobs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Valid Emails</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-border">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-apple-bg/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-apple-text">{client.email}</span>
                        {client.is_admin && (
                          <span className="px-2 py-0.5 text-xs bg-apple-accent/20 text-apple-accent rounded">Admin</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-apple-text-muted">{client.company_name || "-"}</td>
                    <td className={`px-4 py-3 text-right font-medium ${client.credits < 10 ? "text-red-400" : "text-apple-text"}`}>
                      {client.credits}
                    </td>
                    <td className="px-4 py-3 text-right text-apple-text">{client.stats.total_jobs}</td>
                    <td className="px-4 py-3 text-right text-green-400">{client.stats.total_valid_emails}</td>
                    <td className="px-4 py-3 text-apple-text-muted text-sm">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === "jobs" && (
        <div className="bg-apple-surface border border-apple-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-apple-bg border-b border-apple-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Leads</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Valid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Catchall</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-apple-text-muted uppercase">Hit Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-border">
                {jobs.map((job) => {
                  // Only calculate hit rate after job is completed
                  // Enrichment: (valid + catchall) / total unique leads | Verification: valid / total
                  const isCompleted = job.status === "completed";
                  const isEnrichment = job.job_type === "enrichment";
                  let hitRateDisplay = "--";
                  
                  if (isCompleted && job.total_leads > 0) {
                    const rawHitRate = isEnrichment
                      ? ((job.valid_emails_found + job.catchall_emails_found) / job.total_leads * 100)
                      : ((job.valid_emails_found) / job.total_leads * 100);
                    hitRateDisplay = `${Math.min(rawHitRate, 100).toFixed(1)}%`;
                  }
                  
                  return (
                  <tr 
                    key={job.id} 
                    className="hover:bg-apple-bg/50 cursor-pointer"
                    onClick={() => router.push(`/results/${job.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-apple-text font-medium truncate max-w-[200px]">{job.client.email}</p>
                        <p className="text-xs text-apple-text-muted">{job.client.company_name || "-"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded ${job.job_type === "enrichment" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                        {job.job_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-apple-text">{job.total_leads}</td>
                    <td className="px-4 py-3 text-right text-green-400">{job.valid_emails_found}</td>
                    <td className="px-4 py-3 text-right text-yellow-400">{job.catchall_emails_found}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${isCompleted ? 'text-green-400' : 'text-apple-text-muted'}`}>
                        {hitRateDisplay}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-apple-text-muted text-sm">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/results/${job.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-apple-accent hover:underline text-sm"
                      >
                        View Results
                      </Link>
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
            <h2 className="text-lg font-semibold text-apple-text">MailTester API Keys</h2>
            <p className="text-sm text-apple-text-muted">Auto-refreshes every minute</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {apiKeyUsage.length > 0 ? (
              apiKeyUsage.map((key, index) => {
                // Check if any jobs are currently processing (key is active)
                const hasActiveJobs = jobs.some(j => j.status === "processing");
                // With multiple keys, distribute active status
                // First key is primary, second is backup (both can be active if both have capacity)
                const isKeyActive = hasActiveJobs && key.remaining > 0 && (
                  index === 0 || // First key is always considered active when jobs running
                  (index === 1 && apiKeyUsage[0]?.usage_percentage > 80) // Second key active if first is high usage
                );
                
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
                  className={`bg-apple-surface border rounded-xl p-6 transition-all ${
                    isKeyActive 
                      ? `border-apple-accent shadow-lg ${colors.glow}` 
                      : 'border-apple-border'
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
                            <p className="font-mono text-apple-text">{key.key_preview}</p>
                            {/* Health indicator dot */}
                            <span className={`w-2 h-2 rounded-full ${
                              healthStatus === 'critical' ? 'bg-red-500 animate-pulse' :
                              healthStatus === 'warning' ? 'bg-orange-500' :
                              healthStatus === 'moderate' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`} title={`Status: ${healthStatus}`} />
                            {isKeyActive && (
                              <span className="text-xs bg-apple-accent/20 text-apple-accent px-2 py-0.5 rounded-full">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-apple-text-muted">Key {index + 1} • ID: {key.key_id}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${colors.bg} ${colors.text}`}>
                          {key.usage_percentage.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-apple-text-muted">Usage Today</span>
                          <span className="text-apple-text">{key.usage_today.toLocaleString()} / {key.limit.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-apple-bg rounded-full h-2">
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
                        <p className="text-sm text-apple-text-muted">
                          Remaining: <span className="text-apple-text font-medium">{key.remaining.toLocaleString()}</span>
                        </p>
                        {key.remaining < 50000 && (
                          <span className="text-xs text-orange-400">⚠️ Low capacity</span>
                        )}
                      </div>
                      <p className="text-xs text-apple-text-muted mt-1">
                        Resets at midnight GMT+2
                      </p>
                    </div>
                  </div>
                </div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-8 text-apple-text-muted">
                No MailTester API keys configured
              </div>
            )}
          </div>
          
          {/* Multi-key info banner */}
          {apiKeyUsage.length > 1 && (
            <div className="bg-apple-accent/10 border border-apple-accent/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-apple-accent mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-apple-text font-medium">Multi-Key Load Balancing Active</p>
                  <p className="text-xs text-apple-text-muted mt-1">
                    Workers automatically use the key with the most remaining capacity. If a key encounters errors, 
                    it will automatically switch to a healthy backup key. Total daily capacity: {' '}
                    <span className="text-apple-accent font-medium">
                      {(apiKeyUsage.reduce((sum, k) => sum + k.limit, 0)).toLocaleString()}
                    </span>
                    {' '}verifications.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* OmniVerifier Credits */}
          {omniCredits && (
            <div className="bg-apple-surface border border-apple-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-apple-text mb-4">OmniVerifier Credits</h3>
              <p className="text-3xl font-bold text-apple-accent">{omniCredits.available.toLocaleString()}</p>
              <p className="text-sm text-apple-text-muted">Available catchall verification credits</p>
            </div>
          )}

          {/* Vayne API Stats (Admin Only - Hidden from regular clients) */}
          {vayneStats && (
            <div className="bg-apple-surface border border-apple-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-apple-text mb-4">Vayne API Account</h3>
              {vayneStats.error ? (
                <div className="text-red-400 text-sm">
                  Error loading Vayne stats: {vayneStats.error}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-apple-text-muted">Account Balance</p>
                      <p className="text-2xl font-bold text-apple-accent">{vayneStats.available_credits.toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-apple-border">
                      <div>
                        <p className="text-sm text-apple-text-muted">API Calls Today</p>
                        <p className="text-lg font-semibold text-apple-text">{vayneStats.calls_today.toLocaleString()}</p>
                      </div>
                      {vayneStats.daily_limit > 0 && (
                        <div className="text-right">
                          <p className="text-sm text-apple-text-muted">Daily Limit</p>
                          <p className="text-lg font-semibold text-apple-text">{vayneStats.daily_limit.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {(vayneStats.daily_limit_accounts !== undefined || vayneStats.enrichment_credits !== undefined) && (
                      <div className="pt-2 border-t border-apple-border space-y-2">
                        {vayneStats.daily_limit_accounts !== undefined && vayneStats.daily_limit_accounts > 0 && (
                          <div>
                            <p className="text-sm text-apple-text-muted">Daily Limit (Accounts)</p>
                            <p className="text-lg font-semibold text-apple-text">{vayneStats.daily_limit_accounts.toLocaleString()}</p>
                          </div>
                        )}
                        {vayneStats.enrichment_credits !== undefined && vayneStats.enrichment_credits > 0 && (
                          <div>
                            <p className="text-sm text-apple-text-muted">Enrichment Credits</p>
                            <p className="text-lg font-semibold text-apple-text">{vayneStats.enrichment_credits.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {vayneStats.subscription_plan && (
                      <div className="pt-2 border-t border-apple-border">
                        <p className="text-sm text-apple-text-muted">Subscription Plan</p>
                        <p className="text-sm font-medium text-apple-text">{vayneStats.subscription_plan}</p>
                        {vayneStats.subscription_expires_at && (
                          <p className="text-xs text-apple-text-muted mt-1">
                            Expires: {new Date(vayneStats.subscription_expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === "errors" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-apple-text">Verification Error Logs</h2>
              <p className="text-sm text-apple-text-muted">
                {errorSummary?.total_errors || 0} errors today • Auto-refreshes every minute
              </p>
            </div>
          </div>

          {/* Error Summary */}
          {errorSummary && errorSummary.total_errors > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(errorSummary.by_type).map(([type, count]) => (
                <div key={type} className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <p className="text-sm text-apple-text-muted">{type.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold text-red-400">{count}</p>
                </div>
              ))}
            </div>
          )}

          {/* Error Table */}
          <div className="bg-apple-surface border border-apple-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-apple-bg border-b border-apple-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Job ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-border">
                  {errors.length > 0 ? (
                    errors.map((err, i) => (
                      <tr key={i} className="hover:bg-apple-bg/50">
                        <td className="px-4 py-3 text-sm text-apple-text-muted whitespace-nowrap">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-apple-text truncate max-w-[150px]">{err.user_email}</td>
                        <td className="px-4 py-3">
                          <Link href={`/results/${err.job_id}`} className="text-apple-accent hover:underline text-sm font-mono">
                            {err.job_id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded">
                            {err.error_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-apple-text-muted truncate max-w-[300px]">
                          {err.error_message}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-apple-text-muted">
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
    blue: "text-apple-accent",
  };

  return (
    <div className="bg-apple-surface border border-apple-border rounded-xl p-6">
      <p className="text-sm text-apple-text-muted mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color ? colorClasses[color] : "text-apple-text"}`}>
        {value.toLocaleString()}
      </p>
      {subtitle && <p className="text-sm text-apple-text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusClasses: Record<string, string> = {
    completed: "bg-green-500/20 text-green-400",
    processing: "bg-blue-500/20 text-blue-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
    cancelled: "bg-gray-500/20 text-gray-400",
  };

  return (
    <span className={`px-2 py-1 text-xs rounded ${statusClasses[status] || statusClasses.pending}`}>
      {status}
    </span>
  );
}

