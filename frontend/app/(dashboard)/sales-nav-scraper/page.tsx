"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { VayneAuthStatus, VayneCredits, VayneUrlCheck, VayneOrder, VayneOrderCreate } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useRouter } from "next/navigation";

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_POLLING_INTERVAL = 30000; // 30 seconds max with exponential backoff

export default function SalesNavScraperPage() {
  const router = useRouter();
  
  // Auth state
  const [authStatus, setAuthStatus] = useState<VayneAuthStatus | null>(null);
  const [liAtCookie, setLiAtCookie] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [updatingAuth, setUpdatingAuth] = useState(false);
  
  // Credits state
  const [credits, setCredits] = useState<VayneCredits | null>(null);
  
  // URL validation state
  const [salesNavUrl, setSalesNavUrl] = useState("");
  const [urlValidation, setUrlValidation] = useState<VayneUrlCheck | null>(null);
  const [validatingUrl, setValidatingUrl] = useState(false);
  const [urlDebounceTimer, setUrlDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  
  // Form state
  const [exportFormat, setExportFormat] = useState<"simple" | "advanced">("simple");
  const [onlyQualified, setOnlyQualified] = useState(false);
  
  // Order state
  const [currentOrder, setCurrentOrder] = useState<VayneOrder | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(POLLING_INTERVAL);
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  
  // Order history state
  const [orderHistory, setOrderHistory] = useState<VayneOrder[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Error state
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Load auth status and credits on mount
  useEffect(() => {
    // Wrap in try-catch to prevent unhandled errors
    try {
      loadAuthStatus();
      loadCredits();
      loadOrderHistory();
    } catch (err) {
      console.error("Error loading initial data:", err);
      setError("Failed to load page data. Please refresh the page.");
      setShowErrorModal(true);
    }
  }, [loadAuthStatus, loadCredits, loadOrderHistory]);

  // Poll current order if it exists and is processing
  useEffect(() => {
    if (currentOrder && (currentOrder.status === "pending" || currentOrder.status === "processing")) {
      const timer = setTimeout(() => {
        pollOrderStatus(currentOrder.id);
      }, pollingInterval);
      setPollingTimer(timer);
      return () => {
        clearTimeout(timer);
      };
    } else {
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        setPollingTimer(null);
      }
      setPollingInterval(POLLING_INTERVAL); // Reset to initial interval
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder, pollingInterval, pollOrderStatus]);

  // Debounced URL validation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    
    if (salesNavUrl.trim()) {
      timer = setTimeout(() => {
        validateUrl(salesNavUrl);
      }, 500);
      setUrlDebounceTimer(timer);
    } else {
      setUrlValidation(null);
    }
    
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [salesNavUrl, validateUrl]);

  const loadAuthStatus = useCallback(async () => {
    try {
      const status = await apiClient.getVayneAuthStatus();
      setAuthStatus(status);
    } catch (err) {
      console.error("Failed to load auth status:", err);
    }
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      const creditsData = await apiClient.getVayneCredits();
      setCredits(creditsData);
    } catch (err) {
      console.error("Failed to load credits:", err);
    }
  }, []);

  const validateUrl = useCallback(async (url: string) => {
    if (!url.trim()) {
      setUrlValidation(null);
      return;
    }
    
    setValidatingUrl(true);
    try {
      const check = await apiClient.checkVayneUrl(url);
      setUrlValidation(check);
    } catch (err) {
      setUrlValidation({
        is_valid: false,
        error: err instanceof Error ? err.message : "Invalid URL",
      });
    } finally {
      setValidatingUrl(false);
    }
  }, []);

  const loadOrderHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await apiClient.getVayneOrderHistory(10, (historyPage - 1) * 10, historyFilter === "all" ? undefined : historyFilter);
      setOrderHistory(response.orders);
      setHistoryTotal(response.total);
    } catch (err) {
      console.error("Failed to load order history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, historyFilter]);

  const pollOrderStatus = useCallback(async (orderId: string) => {
    try {
      const order = await apiClient.getVayneOrder(orderId);
      setCurrentOrder(order);
      
      // Exponential backoff: increase interval if still processing
      if (order.status === "processing" || order.status === "pending") {
        setPollingInterval((prev) => Math.min(prev * 1.5, MAX_POLLING_INTERVAL));
      } else {
        // Order completed or failed, stop polling
        setPollingInterval(POLLING_INTERVAL);
        if (order.status === "completed") {
          await loadCredits();
          await loadOrderHistory();
        }
      }
    } catch (err) {
      console.error("Failed to poll order status:", err);
      // Continue polling even on error (might be temporary)
    }
  }, [loadCredits, loadOrderHistory]);

  const handleUpdateAuth = async () => {
    if (!liAtCookie.trim()) {
      setError("Please enter your LinkedIn session cookie");
      setShowErrorModal(true);
      return;
    }
    
    setUpdatingAuth(true);
    try {
      await apiClient.updateVayneAuth(liAtCookie);
      setShowAuthModal(false);
      setLiAtCookie("");
      await loadAuthStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update authentication");
      setShowErrorModal(true);
    } finally {
      setUpdatingAuth(false);
    }
  };

  const handleStartScraping = async () => {
    if (!salesNavUrl.trim() || !urlValidation?.is_valid) {
      setError("Please enter a valid Sales Navigator URL");
      setShowErrorModal(true);
      return;
    }
    
    if (!authStatus?.is_connected) {
      setError("Please connect your LinkedIn account first");
      setShowErrorModal(true);
      return;
    }
    
    setCreatingOrder(true);
    try {
      const orderData: VayneOrderCreate = {
        sales_nav_url: salesNavUrl,
        export_format: exportFormat,
        only_qualified: onlyQualified,
      };
      
      const response = await apiClient.createVayneOrder(orderData);
      const order = await apiClient.getVayneOrder(response.order_id);
      setCurrentOrder(order);
      setPollingInterval(POLLING_INTERVAL); // Reset polling interval
      await loadCredits(); // Refresh credits after order creation
      await loadOrderHistory(); // Refresh history
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("insufficient") || errorMessage.includes("credits")) {
        setError("Insufficient credits. Please top up your account.");
      } else if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
        setError("LinkedIn authentication failed. Please update your session cookie.");
        await loadAuthStatus();
      } else {
        setError(errorMessage || "Failed to create order");
      }
      setShowErrorModal(true);
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleDownloadCSV = async (orderId: string) => {
    try {
      const blob = await apiClient.exportVayneOrder(orderId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-nav-leads-${orderId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download CSV");
      setShowErrorModal(true);
    }
  };

  const handleEnrichLeads = async (orderId: string) => {
    try {
      // Download CSV first
      const blob = await apiClient.exportVayneOrder(orderId);
      const text = await blob.text();
      const filename = `sales-nav-${orderId}.csv`;
      
      // Navigate to enrichment page with CSV data
      router.push(`/find-valid-emails?source=Sales Nav&csvData=${encodeURIComponent(text)}&filename=${encodeURIComponent(filename)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare leads for enrichment");
      setShowErrorModal(true);
    }
  };

  useEffect(() => {
    loadOrderHistory();
  }, [loadOrderHistory]);

  const handleClearForm = () => {
    setSalesNavUrl("");
    setUrlValidation(null);
    setExportFormat("simple");
    setOnlyQualified(false);
    setCurrentOrder(null);
  };

  const usagePercentage = credits && credits.daily_limit > 0 
    ? (credits.leads_scraped_today / credits.daily_limit) * 100 
    : 0;
  const progressColor = usagePercentage < 50 ? "bg-green-500" : usagePercentage < 80 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text">Sales Nav Scraper</h1>
        <p className="mt-2 text-apple-text-muted">
          Import and enrich leads from Sales Navigator
        </p>
      </div>

      <ErrorModal
        isOpen={showErrorModal}
        message={error}
        onClose={() => setShowErrorModal(false)}
      />

      {/* Authentication Status Card */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {authStatus?.is_connected ? (
              <>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <div>
                  <p className="text-sm font-medium text-apple-text">LinkedIn Account Connected</p>
                  {authStatus.linkedin_email && (
                    <p className="text-xs text-apple-text-muted">{authStatus.linkedin_email}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div>
                  <p className="text-sm font-medium text-apple-text">LinkedIn Account Not Connected</p>
                  <p className="text-xs text-apple-text-muted">Connect your LinkedIn account to start scraping</p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-4 py-2 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors text-sm font-medium"
          >
            {authStatus?.is_connected ? "Update Session" : "Connect LinkedIn Account"}
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAuthModal(false)} />
          <div className="relative bg-apple-surface border border-apple-border rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-apple-text mb-4">LinkedIn Authentication</h3>
            <p className="text-sm text-apple-text-muted mb-4">
              Enter your LinkedIn session cookie (<code className="bg-apple-bg px-1 py-0.5 rounded">li_at</code>) to authenticate.
            </p>
            <p className="text-xs text-apple-text-muted mb-4">
              <strong>Why should I fetch a new cookie?</strong> LinkedIn cookies expire after a period of inactivity. 
              If scraping fails with authentication errors, you may need to fetch a fresh cookie from your browser.
            </p>
            <input
              type="text"
              value={liAtCookie}
              onChange={(e) => setLiAtCookie(e.target.value)}
              placeholder="Paste your li_at cookie here"
              className="w-full px-4 py-2 bg-apple-bg border border-apple-border rounded-lg text-apple-text mb-4 focus:outline-none focus:ring-2 focus:ring-apple-accent"
            />
            <div className="flex gap-3">
              <button
                onClick={handleUpdateAuth}
                disabled={updatingAuth}
                className="flex-1 px-4 py-2 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors disabled:opacity-50"
              >
                {updatingAuth ? "Updating..." : "Update Session"}
              </button>
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  setLiAtCookie("");
                }}
                className="px-4 py-2 bg-apple-surface border border-apple-border rounded-lg hover:bg-apple-card transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credits & Limits Display */}
      {credits && (
        <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-apple-text">Credits & Limits</h3>
            {credits.subscription_plan && (
              <span className="text-xs text-apple-text-muted">
                Plan: {credits.subscription_plan}
                {credits.subscription_expires_at && (
                  <span className="ml-2">Expires: {new Date(credits.subscription_expires_at).toLocaleDateString()}</span>
                )}
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-apple-text-muted">Available Credits</span>
                <span className="font-medium text-apple-text">{credits.available_credits.toLocaleString()}</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-apple-text-muted">Leads Scraped Today</span>
                <span className="font-medium text-apple-text">
                  {credits.leads_scraped_today.toLocaleString()} / {credits.daily_limit.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-apple-bg rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${progressColor}`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                ></div>
              </div>
            </div>
            {credits.subscription_plan && (
              <button className="w-full mt-3 px-4 py-2 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors text-sm font-medium">
                Upgrade Plan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sales Navigator URL Input */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-apple-text mb-2">
          Sales Navigator URL
        </label>
        <input
          type="text"
          value={salesNavUrl}
          onChange={(e) => setSalesNavUrl(e.target.value)}
          placeholder="https://www.linkedin.com/sales/search/..."
          className="w-full px-4 py-3 bg-apple-bg border border-apple-border rounded-lg text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent"
        />
        <p className="mt-2 text-xs text-apple-text-muted">
          Paste the URL from your Sales Navigator search results page
        </p>
        {validatingUrl && (
          <div className="mt-2 flex items-center gap-2 text-sm text-apple-text-muted">
            <LoadingSpinner size="sm" />
            <span>Validating URL...</span>
          </div>
        )}
        {urlValidation && (
          <div className="mt-2 flex items-center gap-2">
            {urlValidation.is_valid ? (
              <>
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-500">
                  Valid URL • Estimated {urlValidation.estimated_results?.toLocaleString() || "N/A"} leads
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-red-500">{urlValidation.error || "Invalid URL"}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Export Format Selection */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-apple-text mb-4">
          Export Format
        </label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="exportFormat"
              value="simple"
              checked={exportFormat === "simple"}
              onChange={(e) => setExportFormat(e.target.value as "simple" | "advanced")}
              className="w-4 h-4 text-apple-accent"
            />
            <div>
              <span className="text-sm font-medium text-apple-text">Simple</span>
              <p className="text-xs text-apple-text-muted">Basic information (name, email, company)</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="exportFormat"
              value="advanced"
              checked={exportFormat === "advanced"}
              onChange={(e) => setExportFormat(e.target.value as "simple" | "advanced")}
              className="w-4 h-4 text-apple-accent"
            />
            <div>
              <span className="text-sm font-medium text-apple-text">Advanced</span>
              <p className="text-xs text-apple-text-muted">Complete profile data (all available fields)</p>
            </div>
          </label>
        </div>
      </div>

      {/* Data Filtering Options */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyQualified}
            onChange={(e) => setOnlyQualified(e.target.checked)}
            className="w-4 h-4 text-apple-accent rounded"
          />
          <div>
            <span className="text-sm font-medium text-apple-text">Only Export Qualified Leads</span>
            <p className="text-xs text-apple-text-muted">Filter out leads that don't meet qualification criteria</p>
          </div>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStartScraping}
          disabled={!urlValidation?.is_valid || !authStatus?.is_connected || creatingOrder}
          className="flex-1 px-6 py-3 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {creatingOrder ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Starting...
            </span>
          ) : (
            "Start Scraping"
          )}
        </button>
        <button
          onClick={handleClearForm}
          className="px-6 py-3 bg-apple-surface border border-apple-border rounded-lg hover:bg-apple-card transition-colors"
        >
          Clear Form
        </button>
      </div>

      {/* Order Status & Results */}
      {currentOrder && (
        <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-apple-text mb-4">Current Order</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-apple-text-muted">Order ID</span>
              <span className="text-sm font-mono text-apple-text">{currentOrder.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-apple-text-muted">Status</span>
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  currentOrder.status === "completed"
                    ? "bg-green-500/20 text-green-400"
                    : currentOrder.status === "failed"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                {currentOrder.status}
              </span>
            </div>
            {(currentOrder.status === "processing" || currentOrder.status === "pending") && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-apple-text-muted">Progress</span>
                  <span className="text-sm text-apple-text">
                    {currentOrder.progress_percentage?.toFixed(1) || 0}%
                  </span>
                </div>
                <div className="w-full bg-apple-bg rounded-full h-2">
                  <div
                    className="h-2 bg-apple-accent rounded-full transition-all"
                    style={{ width: `${currentOrder.progress_percentage || 0}%` }}
                  ></div>
                </div>
                {currentOrder.estimated_completion && (
                  <p className="text-xs text-apple-text-muted">
                    Estimated completion: {currentOrder.estimated_completion}
                  </p>
                )}
              </>
            )}
            {currentOrder.leads_found !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-apple-text-muted">Leads Found</span>
                <span className="text-sm font-medium text-apple-text">
                  {currentOrder.leads_found.toLocaleString()}
                </span>
              </div>
            )}
            {currentOrder.only_qualified && currentOrder.leads_qualified !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-apple-text-muted">Leads Qualified</span>
                <span className="text-sm font-medium text-apple-text">
                  {currentOrder.leads_qualified.toLocaleString()}
                </span>
              </div>
            )}
            {currentOrder.status === "completed" && (
              <div className="flex gap-3 pt-4 border-t border-apple-border">
                <button
                  onClick={() => handleDownloadCSV(currentOrder.id)}
                  className="flex-1 px-4 py-2 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors text-sm font-medium"
                >
                  Download CSV
                </button>
                <button
                  onClick={() => handleEnrichLeads(currentOrder.id)}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                >
                  Enrich Leads
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job History */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-apple-text">Order History</h3>
          <select
            value={historyFilter}
            onChange={(e) => {
              setHistoryFilter(e.target.value);
              setHistoryPage(1);
            }}
            className="px-3 py-1 bg-apple-bg border border-apple-border rounded-lg text-sm text-apple-text"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
          </select>
        </div>
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : orderHistory.length === 0 ? (
          <p className="text-center text-apple-text-muted py-8">No orders found</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-apple-border">
                <thead className="bg-apple-bg">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Order ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Leads</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Format</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-border">
                  {orderHistory.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 text-sm font-mono text-apple-text">{order.id.slice(0, 8)}...</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            order.status === "completed"
                              ? "bg-green-500/20 text-green-400"
                              : order.status === "failed"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-apple-text-muted">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-apple-text">
                        {order.leads_found?.toLocaleString() || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm text-apple-text-muted capitalize">{order.export_format}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {order.status === "completed" && (
                            <>
                              <button
                                onClick={() => handleDownloadCSV(order.id)}
                                className="text-xs px-2 py-1 bg-apple-accent text-white rounded hover:bg-apple-accent/90"
                              >
                                Download
                              </button>
                              <button
                                onClick={() => handleEnrichLeads(order.id)}
                                className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                              >
                                Enrich
                              </button>
                            </>
                          )}
                          {order.status === "failed" && (
                            <button className="text-xs px-2 py-1 bg-apple-surface border border-apple-border rounded hover:bg-apple-card">
                              Retry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyTotal > 10 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-apple-border">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  className="px-4 py-2 bg-apple-surface border border-apple-border rounded-lg hover:bg-apple-card disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-apple-text-muted">
                  Page {historyPage} of {Math.ceil(historyTotal / 10)}
                </span>
                <button
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={historyPage >= Math.ceil(historyTotal / 10)}
                  className="px-4 py-2 bg-apple-surface border border-apple-border rounded-lg hover:bg-apple-card disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAQ Section */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-apple-text mb-4">Frequently Asked Questions</h3>
        <div className="space-y-2">
          {[
            {
              q: "How do I get my LinkedIn session cookie?",
              a: "Open your browser's developer tools (F12), go to the Application/Storage tab, find Cookies under your LinkedIn domain, and copy the 'li_at' cookie value.",
            },
            {
              q: "What is a qualified lead?",
              a: "A qualified lead meets specific criteria such as having a valid email, matching your target company size, or other filters you've configured.",
            },
            {
              q: "How long does scraping take?",
              a: "Scraping time depends on the number of leads. Small searches (under 100 leads) typically complete in a few minutes, while larger searches may take 30 minutes or more.",
            },
            {
              q: "What's the difference between Simple and Advanced export?",
              a: "Simple export includes basic fields (name, email, company). Advanced export includes all available profile data such as job title, location, company details, and more.",
            },
            {
              q: "Can I scrape multiple URLs?",
              a: "Yes, you can create multiple orders. Each order processes one Sales Navigator URL. You can have multiple orders running concurrently.",
            },
          ].map((faq, idx) => (
            <div key={idx} className="border-b border-apple-border last:border-0">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between py-3 text-left"
              >
                <span className="text-sm font-medium text-apple-text">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-apple-text-muted transition-transform ${
                    openFaq === idx ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === idx && (
                <p className="pb-3 text-sm text-apple-text-muted">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
