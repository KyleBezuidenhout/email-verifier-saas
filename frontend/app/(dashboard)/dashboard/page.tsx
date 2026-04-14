"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api";
import { VayneCredits, VayneDailyUsage, VayneOrder, VayneOrderCreate, Lead } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";

function getDisplayStatus(order: VayneOrder): { label: string; color: string } {
  if (order.auto_enrich) {
    if (order.enrichment_status === "completed") {
      return { label: "Completed", color: "text-[#22c55e]" };
    }
    if (order.enrichment_status === "processing") {
      const pct = order.enrichment_progress_percentage || 0;
      return { label: `Enriching (${pct}%)`, color: "text-orange-400" };
    }
    if (order.enrichment_status === "pending") {
      return { label: "Enriching", color: "text-orange-400" };
    }
    if (order.enrichment_status === "failed") {
      return { label: "Failed", color: "text-red-400" };
    }
    if (order.status === "completed" && !order.enrichment_job_id) {
      return { label: "Starting Enrichment", color: "text-orange-400" };
    }
  }

  if (order.status === "completed" && !order.auto_enrich) {
    return { label: "Completed", color: "text-[#22c55e]" };
  }

  switch (order.status) {
    case "queued":
      return { label: "Queued", color: "text-blue-400" };
    case "pending":
    case "processing":
    case "initialization":
    case "scraping":
    case "segmenting":
      return { label: "Scraping", color: "text-yellow-400" };
    case "failed":
      return { label: "Failed", color: "text-red-400" };
    default:
      return { label: order.status, color: "text-dashboard-text-muted" };
  }
}

function getHitRate(order: VayneOrder): string | null {
  const isComplete = order.auto_enrich
    ? order.enrichment_status === "completed"
    : order.status === "completed";
  if (!isComplete) return null;

  const valid = order.enrichment_valid_emails_found || 0;
  const catchall = order.enrichment_catchall_emails_found || 0;
  const total = order.enrichment_total_leads || order.leads_found || 0;
  if (total === 0) return "0%";
  return `${Math.round(((valid + catchall) / total) * 100)}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [linkedinCookie, setLinkedinCookie] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [credits, setCredits] = useState<VayneCredits | null>(null);
  const [dailyUsage, setDailyUsage] = useState<VayneDailyUsage | null>(null);
  const [salesNavUrl, setSalesNavUrl] = useState("");
  const [jobName, setJobName] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const [resettingDailyLimit, setResettingDailyLimit] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [orders, setOrders] = useState<VayneOrder[]>([]);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);

  // Results modal state
  const [resultsModalOrder, setResultsModalOrder] = useState<VayneOrder | null>(null);
  const [resultsLeads, setResultsLeads] = useState<Lead[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsFilter, setResultsFilter] = useState<string>("all");
  const [mxFilter, setMxFilter] = useState<string>("all");

  const loadCredits = useCallback(async () => {
    try {
      const creditsData = await apiClient.getVayneCredits();
      setCredits(creditsData);
    } catch (err) {
      console.error("Failed to load credits:", err);
    }
  }, []);

  const loadDailyUsage = useCallback(async () => {
    try {
      const usage = await apiClient.getVayneDailyUsage();
      setDailyUsage(usage);
    } catch (err) {
      console.error("Failed to load daily usage:", err);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      let allOrders: VayneOrder[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      while (hasMore) {
        const response = await apiClient.getVayneOrderHistory(limit, offset);
        allOrders = [...allOrders, ...response.orders];
        offset += limit;
        hasMore = response.orders.length === limit;
      }
      const visibleOrders = allOrders
        .filter((order) => order.status !== "deleted" as string)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrders(visibleOrders);
    } catch (err) {
      console.error("Failed to load orders:", err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      await Promise.all([loadCredits(), loadOrders(), loadDailyUsage()]);
      setInitialLoading(false);
    };
    init();
  }, [loadCredits, loadOrders, loadDailyUsage]);

  // Poll for status updates
  useEffect(() => {
    const POLL_INTERVAL = 30000;
    const poll = async () => {
      const activeOrders = orders.filter(
        (o) => o.status !== "completed" && o.status !== "failed" || (o.auto_enrich && o.enrichment_status && o.enrichment_status !== "completed" && o.enrichment_status !== "failed")
      );
      if (activeOrders.length === 0) return;
      await loadOrders();
    };
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [orders, loadOrders]);

  const SALES_NAV_URL_REGEX = /^https?:\/\/(www\.)?linkedin\.com\/sales\/(search|lists|lead)/i;
  const hasLinkedinCookie = Boolean(linkedinCookie.trim());
  const isUrlFormatValid = salesNavUrl.trim() ? SALES_NAV_URL_REGEX.test(salesNavUrl.trim()) : false;
  const isStartDisabled = !hasLinkedinCookie || !isUrlFormatValid || creatingOrder;

  const handleStartScraping = async () => {
    if (!hasLinkedinCookie) {
      setError("Please add your LinkedIn cookie before starting.");
      setShowErrorModal(true);
      return;
    }
    if (!isUrlFormatValid) {
      setError("Please enter a valid Sales Navigator URL (e.g. linkedin.com/sales/search/...)");
      setShowErrorModal(true);
      return;
    }
    if (dailyUsage && dailyUsage.remaining <= 0) {
      setShowDailyLimitModal(true);
      return;
    }

    setCreatingOrder(true);
    try {
      const orderData: VayneOrderCreate = {
        sales_nav_url: salesNavUrl,
        linkedin_cookie: linkedinCookie.trim() || "",
        targeting: jobName.trim() || undefined,
      };
      const response = await apiClient.createVayneOrder(orderData);
      const newOrder: VayneOrder = {
        id: response.order_id,
        status: "queued",
        targeting: jobName.trim() || response.order_id,
        created_at: new Date().toISOString(),
        leads_found: 0,
        progress_percentage: 0,
        auto_enrich: true,
      };
      setOrders((prev) => [newOrder, ...prev]);
      setLinkedinCookie("");
      setJobName("");
      setSalesNavUrl("");
      await Promise.all([loadCredits(), loadDailyUsage()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("insufficient") || msg.includes("credits") || msg.includes("402")) {
        setError("Insufficient credits. Please top up your account.");
      } else if (msg.includes("401") || msg.includes("Session expired")) {
        setError("Session expired. Please refresh the page.");
      } else {
        setError(msg || "Failed to create order");
      }
      setShowErrorModal(true);
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleResetDailyLimit = async () => {
    setResettingDailyLimit(true);
    try {
      await apiClient.resetVayneDailyUsage();
      await loadDailyUsage();
      setShowResetModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset daily limit");
      setShowErrorModal(true);
      setShowResetModal(false);
    } finally {
      setResettingDailyLimit(false);
    }
  };

  const handleContinueScraping = async () => {
    setResettingDailyLimit(true);
    try {
      await apiClient.resetVayneDailyUsage();
      await loadDailyUsage();
      setShowDailyLimitModal(false);
      setResettingDailyLimit(false);
      handleStartScraping();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset daily limit");
      setShowErrorModal(true);
      setShowDailyLimitModal(false);
      setResettingDailyLimit(false);
    }
  };

  const handleDownloadCSV = async (order: VayneOrder) => {
    if (order.enrichment_job_id && order.enrichment_status === "completed") {
      const url = apiClient.getDownloadUrl(order.enrichment_job_id, {
        filename: order.targeting || undefined,
      });
      window.open(url, "_blank");
      return;
    }
    setDownloadingOrderId(order.id);
    try {
      await apiClient.downloadVayneOrderCSVFile(order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download CSV");
      setShowErrorModal(true);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const handleViewResults = async (order: VayneOrder) => {
    if (!order.enrichment_job_id) return;
    setResultsModalOrder(order);
    setLoadingResults(true);
    setResultsFilter("all");
    setMxFilter("all");
    try {
      const leads = await apiClient.getResults(order.enrichment_job_id);
      setResultsLeads(leads);
    } catch (err) {
      console.error("Failed to load results:", err);
      setResultsLeads([]);
    } finally {
      setLoadingResults(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const filteredResults = resultsLeads.filter((lead) => {
    if (resultsFilter !== "all" && lead.verification_status !== resultsFilter) return false;
    if (mxFilter !== "all" && (lead.mx_provider || "unknown") !== mxFilter) return false;
    return true;
  });

  const mxProviders = Array.from(new Set(resultsLeads.map((l) => l.mx_provider || "unknown"))).sort();

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
        <h1 className="text-3xl font-bold text-dashboard-text">Dashboard</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Scrape, enrich, and verify leads from Sales Navigator
        </p>
      </div>

      {/* Daily Scraping Limit */}
      {dailyUsage && (
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-dashboard-text">Daily Scraping Limit</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-dashboard-text-muted">
                {dailyUsage.used.toLocaleString()} / {dailyUsage.limit.toLocaleString()} profiles
              </span>
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="text-xs font-medium text-dashboard-accent hover:text-dashboard-accent/80 transition-colors px-2 py-1 rounded border border-dashboard-accent/30 hover:border-dashboard-accent/60"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="w-full bg-dashboard-card rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                dailyUsage.used / dailyUsage.limit > 0.9 ? "bg-red-500" :
                dailyUsage.used / dailyUsage.limit > 0.7 ? "bg-yellow-500" :
                "bg-dashboard-accent"
              }`}
              style={{ width: `${Math.min(100, (dailyUsage.used / dailyUsage.limit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <ErrorModal isOpen={showErrorModal} message={error} onClose={() => setShowErrorModal(false)} />

      {/* Reset / Daily Limit Modals */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowResetModal(false)}>
          <div className="glass-card p-6 max-w-md w-full mx-4" style={{ background: 'rgba(13, 15, 18, 0.95)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-500 mb-4">Warning</h3>
            <p className="text-sm mb-3" style={{ color: '#C8D2DC' }}>
              Scraping more than 15,000 profiles per day using a single Sales Navigator account puts your LinkedIn account at risk of suspension or permanent ban.
            </p>
            <p className="text-sm mb-6" style={{ color: '#C8D2DC' }}>
              Only reset your daily limit if you plan to use a different Sales Navigator account.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetModal(false)} className="flex-1 px-4 py-2 glass-card text-dashboard-text hover:bg-dashboard-card transition-colors text-sm font-medium">Close</button>
              <button onClick={handleResetDailyLimit} disabled={resettingDailyLimit} className="flex-1 px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors text-sm font-medium disabled:opacity-50">
                {resettingDailyLimit ? "Resetting..." : "Reset daily limit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDailyLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDailyLimitModal(false)}>
          <div className="glass-card p-6 max-w-md w-full mx-4" style={{ background: 'rgba(13, 15, 18, 0.95)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-500 mb-4">Daily Limit Reached</h3>
            <p className="text-sm text-dashboard-text-muted mb-6">
              You&apos;ve hit your daily scraping limit. Only continue if you plan to use a different Sales Navigator account.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDailyLimitModal(false)} className="flex-1 px-4 py-2 glass-card text-dashboard-text hover:bg-dashboard-card transition-colors text-sm font-medium">Close</button>
              <button onClick={handleContinueScraping} disabled={resettingDailyLimit} className="flex-1 px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors text-sm font-medium disabled:opacity-50">
                {resettingDailyLimit ? "Resetting..." : "Continue Scraping"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Name Input */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">Job Name</label>
        <input
          type="text"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          placeholder="Enter a name for this job (e.g., 'Q4 Sales Outreach')"
          className="apple-input w-full py-3"
        />
      </div>

      {/* LinkedIn Cookie */}
      <div className="glass-card px-6 py-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <p className="text-sm font-medium text-dashboard-text">
              {linkedinCookie.trim() ? "LinkedIn Cookie Set" : "LinkedIn Cookie"} <span className="text-red-500">*</span>
            </p>
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-4 py-2 border border-dashboard-accent text-dashboard-accent bg-transparent rounded-lg hover:bg-dashboard-accent/10 transition-colors text-sm font-medium"
          >
            {linkedinCookie.trim() ? "Update Cookie" : "Add cookie"}
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAuthModal(false)} />
          <div className="relative glass-card p-6 shadow-2xl max-w-md w-full mx-4" style={{ background: 'rgba(13, 15, 18, 0.9)' }}>
            <h3 className="text-xl font-semibold text-dashboard-text mb-4">LinkedIn Authentication</h3>
            <p className="text-sm text-dashboard-text-muted mb-4">
              Enter your LinkedIn session cookie (<code className="bg-dashboard-card px-1 py-0.5 rounded">li_at</code>) for authentication.
            </p>
            <p className="text-xs text-dashboard-text-muted mb-4">
              <strong>How to get your cookie:</strong><br /><br />
              Open browser developer tools (F12), go to Application/Storage &rarr; Cookies &rarr; linkedin.com, copy the &quot;li_at&quot; cookie value.
            </p>
            <input
              type="text"
              value={linkedinCookie}
              onChange={(e) => setLinkedinCookie(e.target.value)}
              placeholder="Paste your li_at cookie here"
              className="apple-input w-full mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowAuthModal(false)} className="flex-1 px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors">
                Save Cookie
              </button>
              <button onClick={() => setShowAuthModal(false)} className="px-4 py-2 glass-card hover:bg-dashboard-card transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Navigator URL */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">
          Sales Navigator URL <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={salesNavUrl}
          onChange={(e) => setSalesNavUrl(e.target.value)}
          placeholder="https://www.linkedin.com/sales/search/..."
          className="apple-input w-full py-3"
        />
        {salesNavUrl.trim() && (
          <div className="mt-2 flex items-center gap-2">
            {isUrlFormatValid ? (
              <>
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-500">Valid Sales Navigator URL</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-red-500">Please enter a valid Sales Navigator URL</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStartScraping}
          disabled={isStartDisabled}
          className="flex-1 px-6 py-3 border border-dashboard-accent text-dashboard-accent bg-transparent rounded-lg hover:bg-dashboard-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {creatingOrder ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Starting...
            </span>
          ) : (
            "Start Job"
          )}
        </button>
        <button
          onClick={() => { setJobName(""); setSalesNavUrl(""); setLinkedinCookie(""); }}
          className="px-6 py-3 glass-card hover:bg-dashboard-card transition-colors"
        >
          Clear Form
        </button>
      </div>

      {/* Unified Job Table */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-lg font-semibold text-dashboard-text mb-4">Jobs</h3>
        {orders.length === 0 ? (
          <p className="text-dashboard-text-muted text-center py-8">No jobs yet. Start a new job above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Job Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Leads</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Hit Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                {orders.map((order) => {
                  const displayStatus = getDisplayStatus(order);
                  const hitRate = getHitRate(order);
                  const isEnrichmentComplete = order.auto_enrich && order.enrichment_status === "completed";
                  const isScrapingComplete = !order.auto_enrich && order.status === "completed";
                  const canViewResults = isEnrichmentComplete && order.enrichment_job_id;
                  const canDownload = isEnrichmentComplete || isScrapingComplete;

                  return (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text">
                        {order.targeting && order.targeting !== "Untitled Order" ? order.targeting : order.id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                        {(order.leads_found || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-xs font-medium ${displayStatus.color}`}>
                          {displayStatus.label}
                        </span>
                        {order.failure_reason && order.status === "failed" && (
                          <p className="text-xs text-red-400/70 mt-1 max-w-[200px] truncate" title={order.failure_reason}>
                            {order.failure_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                        {hitRate ? (
                          <span className="text-[#22c55e] font-medium">{hitRate}</span>
                        ) : (
                          <span className="text-dashboard-text-muted/50">&mdash;</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {canViewResults && (
                            <button
                              onClick={() => handleViewResults(order)}
                              className="px-3 py-1.5 border border-dashboard-accent text-dashboard-accent bg-transparent text-xs rounded-lg hover:bg-dashboard-accent/10 transition-colors"
                            >
                              View Results
                            </button>
                          )}
                          {canDownload && (
                            <button
                              onClick={() => handleDownloadCSV(order)}
                              disabled={downloadingOrderId === order.id}
                              className="px-3 py-1.5 border border-dashboard-border text-dashboard-text-muted bg-transparent text-xs rounded-lg hover:bg-dashboard-card transition-colors disabled:opacity-50"
                            >
                              {downloadingOrderId === order.id ? "..." : "Download"}
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
        )}
      </div>

      {/* Results Modal */}
      {resultsModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setResultsModalOrder(null)}>
          <div
            className="glass-card shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col mx-4"
            style={{ background: 'rgba(13, 15, 18, 0.95)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-dashboard-border">
              <div>
                <h2 className="text-xl font-semibold text-dashboard-text">
                  {resultsModalOrder.targeting || resultsModalOrder.id.slice(0, 8)}
                </h2>
                <p className="text-sm text-dashboard-text-muted mt-1">
                  {resultsModalOrder.leads_found?.toLocaleString() || 0} leads scraped &middot; Completed {resultsModalOrder.completed_at ? formatDate(resultsModalOrder.completed_at) : ""}
                </p>
              </div>
              <button onClick={() => setResultsModalOrder(null)} className="text-dashboard-text-muted hover:text-dashboard-text transition-colors p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingResults ? (
              <div className="flex justify-center items-center py-16">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <>
                {/* Stat Cards */}
                <div className="grid grid-cols-4 gap-3 p-6 pb-0">
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-dashboard-accent">{resultsLeads.length}</p>
                    <p className="text-xs text-dashboard-text-muted">Total</p>
                  </div>
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-[#22c55e]">{resultsLeads.filter(l => l.verification_status === "valid").length}</p>
                    <p className="text-xs text-dashboard-text-muted">Valid</p>
                  </div>
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-400">{resultsLeads.filter(l => l.verification_status === "catchall").length}</p>
                    <p className="text-xs text-dashboard-text-muted">Catchall</p>
                  </div>
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{resultsLeads.filter(l => l.verification_status === "invalid" || l.verification_status === "not_found").length}</p>
                    <p className="text-xs text-dashboard-text-muted">Invalid</p>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 px-6 pt-4 pb-2">
                  <select
                    value={resultsFilter}
                    onChange={(e) => setResultsFilter(e.target.value)}
                    className="apple-input text-sm py-1.5 px-3"
                  >
                    <option value="all">All Statuses</option>
                    <option value="valid">Valid</option>
                    <option value="catchall">Catchall</option>
                    <option value="invalid">Invalid</option>
                    <option value="not_found">Not Found</option>
                  </select>
                  <select
                    value={mxFilter}
                    onChange={(e) => setMxFilter(e.target.value)}
                    className="apple-input text-sm py-1.5 px-3"
                  >
                    <option value="all">All MX Providers</option>
                    {mxProviders.map((mx) => (
                      <option key={mx} value={mx}>{mx}</option>
                    ))}
                  </select>
                  <span className="text-xs text-dashboard-text-muted ml-auto">
                    Showing {filteredResults.length} of {resultsLeads.length}
                  </span>
                </div>

                {/* Results Table */}
                <div className="overflow-y-auto flex-1 px-6 pb-6">
                  <table className="min-w-full divide-y divide-dashboard-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-dashboard-text-muted uppercase">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-dashboard-text-muted uppercase">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-dashboard-text-muted uppercase">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-dashboard-text-muted uppercase">MX Provider</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashboard-border">
                      {filteredResults.slice(0, 100).map((lead) => (
                        <tr key={lead.id}>
                          <td className="px-4 py-2 text-sm text-dashboard-text">
                            {lead.first_name} {lead.last_name}
                          </td>
                          <td className="px-4 py-2 text-sm text-dashboard-text-muted font-mono">
                            {lead.email || "—"}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs font-medium ${
                              lead.verification_status === "valid" ? "text-[#22c55e]" :
                              lead.verification_status === "catchall" ? "text-yellow-400" :
                              "text-red-400"
                            }`}>
                              {lead.verification_status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-dashboard-text-muted">
                            {lead.mx_provider || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredResults.length > 100 && (
                    <p className="text-xs text-dashboard-text-muted text-center mt-3">
                      Showing first 100 of {filteredResults.length} results. Download CSV for full data.
                    </p>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-dashboard-border">
                  <button
                    onClick={() => handleDownloadCSV(resultsModalOrder)}
                    className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors text-sm font-medium"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={() => setResultsModalOrder(null)}
                    className="px-4 py-2 glass-card hover:bg-dashboard-card transition-colors text-sm"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
