"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
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
  const [downloadDropdownId, setDownloadDropdownId] = useState<string | null>(null);

  // Results modal state
  const [resultsModalOrder, setResultsModalOrder] = useState<VayneOrder | null>(null);
  const [resultsLeads, setResultsLeads] = useState<Lead[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>(["all"]);
  const [mxFilters, setMxFilters] = useState<string[]>([]);

  useEffect(() => {
    if (!downloadDropdownId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-download-dropdown]")) setDownloadDropdownId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [downloadDropdownId]);

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

  const handleDownloadCSV = async (order: VayneOrder, statusFilter?: string[]) => {
    if (order.enrichment_job_id && order.enrichment_status === "completed") {
      const url = apiClient.getDownloadUrl(order.enrichment_job_id, {
        status: statusFilter,
        filename: order.targeting || undefined,
      });
      window.open(url, "_blank");
      setDownloadDropdownId(null);
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
    setStatusFilters(["all"]);
    setMxFilters([]);
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

  const getProviderFromMX = (mxRecord?: string, mxProvider?: string): string => {
    if (mxProvider) return mxProvider;
    if (!mxRecord || mxRecord.trim() === '') return 'other';
    const mxLower = mxRecord.toLowerCase();
    if (mxLower.includes('mail.protection.outlook.com') || mxLower.includes('outlook.com')) return 'outlook';
    if (mxLower.includes('.google.com') || mxLower.includes('.gmail.com')) return 'google';
    return 'other';
  };

  // Apply status filters (multi-select like results page)
  const statusFilteredLeads =
    statusFilters.includes("all") || statusFilters.length === 0
      ? resultsLeads
      : resultsLeads.filter((lead) => {
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
  const filteredResults = mxFilters.length === 0
    ? statusFilteredLeads
    : statusFilteredLeads.filter((lead) => {
        const provider = getProviderFromMX(lead.mx_record, lead.mx_provider);
        return mxFilters.includes(provider);
      });

  // Stat counts from order object (real totals, not limited preview)
  const totalLeadsCount = resultsModalOrder?.enrichment_total_leads || resultsLeads.length;
  const validCount = resultsModalOrder?.enrichment_valid_emails_found || resultsLeads.filter(l =>
    l.verification_status === "valid" ||
    l.verification_tag === "valid-catchall" ||
    l.verification_tag === "catchall-verified"
  ).length;
  const catchallCount = resultsModalOrder?.enrichment_catchall_emails_found || resultsLeads.filter(l =>
    l.verification_status === "catchall" &&
    l.verification_tag !== "catchall-verified" &&
    l.verification_tag !== "valid-catchall"
  ).length;
  const notFoundCount = totalLeadsCount - validCount - catchallCount;

  const PREVIEW_LIMIT = 10;

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-dashboard-text">Sales Nav Extractor</h1>
          <a
            href="/watch-tutorial"
            className="px-4 py-2 border border-dashboard-accent text-dashboard-accent bg-transparent rounded-lg hover:bg-dashboard-accent/10 transition-colors text-base font-medium mt-6"
          >
            Tutorial
          </a>
        </div>
        <p className="mt-2 text-dashboard-text-muted">Extract and enrich leads from Sales Navigator</p>
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
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-semibold text-dashboard-text">LinkedIn Authentication</h3>
              <a
                href="/watch-tutorial"
                className="text-xs text-dashboard-accent hover:text-dashboard-accent/80 transition-colors"
              >
                Tutorial
              </a>
            </div>
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
              <button onClick={() => setShowAuthModal(false)} className="flex-1 px-4 py-2 border border-dashboard-accent text-dashboard-accent bg-transparent rounded-lg hover:bg-dashboard-accent/10 transition-colors text-sm font-medium">
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
          <div className="overflow-x-auto" style={{ overflow: 'visible' }}>
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Job Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Hit Rate</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                {orders.map((order) => {
                  const displayStatus = getDisplayStatus(order);
                  const hitRate = getHitRate(order);
                  const isEnrichmentComplete = order.auto_enrich && order.enrichment_status === "completed";
                  const isScrapingComplete = !order.auto_enrich && order.status === "completed";
                  const canViewResults = isEnrichmentComplete && order.enrichment_job_id;
                  const canDownloadEnriched = isEnrichmentComplete && order.enrichment_job_id;
                  const canDownloadRaw = isScrapingComplete;
                  const jobName = order.targeting && order.targeting !== "Untitled Order" ? order.targeting : order.id.slice(0, 8);

                  return (
                    <tr key={order.id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text max-w-[250px] truncate" title={jobName}>
                        {jobName}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-dashboard-text">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-dashboard-text">
                        {(order.enrichment_total_leads || order.leads_found || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`text-xs font-medium ${displayStatus.color}`}>
                          {displayStatus.label}
                        </span>
                        {order.failure_reason && order.status === "failed" && (
                          <p className="text-xs text-red-400/70 mt-1 max-w-[200px] truncate" title={order.failure_reason}>
                            {order.failure_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                        {hitRate ? (
                          <span className="text-[#22c55e] font-medium">{hitRate}</span>
                        ) : (
                          <span className="text-dashboard-text-muted/50">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-center">
                        <div className="flex items-center justify-center gap-2">
                          {canViewResults && (
                            <button
                              onClick={() => handleViewResults(order)}
                              className="px-3 py-1.5 border border-dashboard-accent text-dashboard-accent bg-transparent text-xs rounded-lg hover:bg-dashboard-accent/10 transition-colors"
                            >
                              View Results
                            </button>
                          )}
                          {canDownloadEnriched && (
                            <div className="relative inline-block" data-download-dropdown={order.id}>
                              <button
                                onClick={() => setDownloadDropdownId(downloadDropdownId === order.id ? null : order.id)}
                                className="px-3 py-1.5 border border-dashboard-accent text-dashboard-accent bg-transparent text-xs rounded-lg hover:bg-dashboard-accent/10 transition-colors flex items-center gap-1"
                              >
                                Download
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                              {downloadDropdownId === order.id && (
                                <div className="absolute right-0 bottom-full mb-1 w-36 rounded-lg border border-dashboard-border shadow-2xl z-[999999]" style={{ background: 'rgba(13, 15, 18, 1)' }}>
                                  {[
                                    { label: "All Leads", filter: undefined },
                                    { label: "Valid", filter: ["valid"] },
                                    { label: "Catchall", filter: ["catchall"] },
                                    { label: "Not Found", filter: ["not_found", "invalid"] },
                                  ].map((opt) => (
                                    <button
                                      key={opt.label}
                                      onClick={() => handleDownloadCSV(order, opt.filter)}
                                      className="block w-full text-left px-3 py-2 text-xs text-dashboard-text-muted hover:bg-dashboard-card/50 hover:text-dashboard-text transition-colors first:rounded-t-lg last:rounded-b-lg"
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {canDownloadRaw && (
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
        <div className="fixed inset-0 md:left-[250px] z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setResultsModalOrder(null)}>
          <div
            className="glass-card shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col mx-4"
            style={{ background: 'rgba(13, 15, 18, 0.95)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Matching Results Page */}
            <div className="flex items-center justify-between p-6 border-b border-dashboard-border">
              <div>
                <Link
                  href="#"
                  onClick={(e) => { e.preventDefault(); setResultsModalOrder(null); }}
                  className="text-dashboard-accent hover:opacity-80 transition-opacity mb-2 inline-block text-sm"
                >
                  ← Back to Dashboard
                </Link>
                <h2 className="text-2xl font-bold text-dashboard-text">
                  Results
                </h2>
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
              <div className="overflow-y-auto flex-1">
                {/* Stats Blocks - Click to Filter (Multi-select) - Matching Results Page */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
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
                    <p className="text-2xl font-bold text-dashboard-text">{totalLeadsCount}</p>
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

                {/* Table Section - Matching Results Page */}
                <div className="px-6 pb-6">
                  <div className="glass-card p-6">
                    {/* Filter bar - Description + Download on left, MX Provider on right */}
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      {/* Left side - Description and Download */}
                      <div className="flex flex-col gap-2">
                        <div className="text-sm text-dashboard-text-muted">
                          Showing <span className="font-medium text-dashboard-text">{Math.min(PREVIEW_LIMIT, filteredResults.length)}</span> of <span className="font-medium text-dashboard-text">{totalLeadsCount.toLocaleString()}</span>
                          {!statusFilters.includes("all") && statusFilters.length > 0 && (
                            <span> {statusFilters.join(" + ")}</span>
                          )}
                          {statusFilters.includes("all") && " leads"}
                          {mxFilters.length > 0 && <span> • MX: {mxFilters.join(", ")}</span>}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              const statusParam = !statusFilters.includes("all") && statusFilters.length > 0
                                ? statusFilters
                                : undefined;
                              const mxParam = mxFilters.length > 0 ? mxFilters : undefined;
                              if (resultsModalOrder!.enrichment_job_id && resultsModalOrder!.enrichment_status === "completed") {
                                const url = apiClient.getDownloadUrl(resultsModalOrder!.enrichment_job_id, {
                                  status: statusParam,
                                  mx: mxParam,
                                  filename: resultsModalOrder!.targeting || `results-${resultsModalOrder!.id.slice(0, 8)}`,
                                });
                                window.open(url, "_blank");
                              } else {
                                handleDownloadCSV(resultsModalOrder!);
                              }
                            }}
                            className="px-3 py-1.5 border border-dashboard-accent text-dashboard-accent bg-transparent text-xs rounded-lg hover:bg-dashboard-accent/10 transition-colors"
                          >
                            Download CSV
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

                    {/* Results Table - Matching Results Page Style */}
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
                          </tr>
                        </thead>
                        <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                          {filteredResults.slice(0, PREVIEW_LIMIT).map((lead) => (
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
                                {lead.email || "—"}
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
                                  return mxType.charAt(0).toUpperCase() + mxType.slice(1);
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {filteredResults.length > PREVIEW_LIMIT && (
                      <div className="mt-4 p-4 glass-card-hover text-center">
                        <p className="text-dashboard-text-muted text-sm">
                          Showing {PREVIEW_LIMIT} of {totalLeadsCount.toLocaleString()} results.
                          <button
                            onClick={() => {
                              const statusParam = !statusFilters.includes("all") && statusFilters.length > 0
                                ? statusFilters
                                : undefined;
                              const mxParam = mxFilters.length > 0 ? mxFilters : undefined;
                              if (resultsModalOrder!.enrichment_job_id && resultsModalOrder!.enrichment_status === "completed") {
                                const url = apiClient.getDownloadUrl(resultsModalOrder!.enrichment_job_id, {
                                  status: statusParam,
                                  mx: mxParam,
                                  filename: resultsModalOrder!.targeting || `results-${resultsModalOrder!.id.slice(0, 8)}`,
                                });
                                window.open(url, "_blank");
                              } else {
                                handleDownloadCSV(resultsModalOrder!);
                              }
                            }}
                            className="ml-2 text-dashboard-accent hover:underline font-medium"
                          >
                            Download CSV
                          </button>
                          {" "}to view all results.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
