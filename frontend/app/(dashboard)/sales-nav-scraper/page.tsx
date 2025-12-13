"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api";
import { VayneCredits, VayneUrlCheck, VayneOrder, VayneOrderCreate } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL = 5000; // 5 seconds - poll Vayne API directly for real-time progress

export default function SalesNavScraperPage() {
  const router = useRouter();
  
  // Auth state (cookie required for each order)
  const [linkedinCookie, setLinkedinCookie] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Credits state
  const [credits, setCredits] = useState<VayneCredits | null>(null);
  
  // URL validation state
  const [salesNavUrl, setSalesNavUrl] = useState("");
  const [urlValidation, setUrlValidation] = useState<VayneUrlCheck | null>(null);
  const [validatingUrl, setValidatingUrl] = useState(false);
  const [urlDebounceTimer, setUrlDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  
  // Form state
  const [jobName, setJobName] = useState("");
  const [exportFormat, setExportFormat] = useState<"simple" | "advanced">("simple");
  const [onlyQualified, setOnlyQualified] = useState(false);
  
  // Order state
  const [currentOrder, setCurrentOrder] = useState<VayneOrder | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Error state
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  // Delete confirmation state
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Loading state
  const [initialLoading, setInitialLoading] = useState(true);
  
  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Scrape history state
  const [scrapeHistoryOrders, setScrapeHistoryOrders] = useState<VayneOrder[]>([]);
  const [loadingScrapeHistory, setLoadingScrapeHistory] = useState(false);
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);

  // Define all callback functions BEFORE useEffect hooks to prevent initialization errors
  const loadCredits = useCallback(async () => {
    try {
      const creditsData = await apiClient.getVayneCredits();
      setCredits(creditsData);
    } catch (err) {
      console.error("Failed to load credits:", err);
    }
  }, []);


  const refreshOrderStatus = useCallback(async (orderId: string, retryCount: number = 0) => {
    try {
      // Poll status endpoint for real-time updates (matches specification)
      const statusData = await apiClient.getVayneOrderStatus(orderId);
      
      // Update current order with status data
      const order = await apiClient.getVayneOrder(orderId);
      setCurrentOrder(order);
      
      // Log polling status for debugging
      console.log(`🔄 Polling order ${orderId}: scraping_status=${statusData.scraping_status}, progress=${statusData.progress_percentage}%`);
      
      // Parse scraping_status from status endpoint
      const scrapingStatus = statusData.scraping_status;
      
      // If scraping is finished, refresh order to get file_url (webhook should have stored it)
      if (scrapingStatus === "finished" && !order.file_url) {
        console.log(`✅ Scraping finished, refreshing order to get file_url...`);
        try {
          const updatedOrder = await apiClient.getVayneOrder(orderId);
          setCurrentOrder(updatedOrder);
          if (updatedOrder.file_url) {
            console.log(`✅ CSV file_url available: ${updatedOrder.file_url.substring(0, 50)}...`);
          }
        } catch (refreshErr) {
          console.error("❌ Failed to refresh order:", refreshErr);
        }
      }
      
      // If order completed or failed, refresh credits and history
      if (statusData.status === "completed" || statusData.status === "failed" || scrapingStatus === "finished") {
        await loadCredits();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // Handle 404 errors gracefully - order might not be ready yet (timing issue)
      if (errorMessage.includes("404") || errorMessage.includes("Not Found") || errorMessage.includes("not found")) {
        // Retry once after a delay if this is the first attempt
        if (retryCount === 0) {
          console.log(`⏳ Order ${orderId} not found yet, retrying after 1 second...`);
          setTimeout(() => {
            refreshOrderStatus(orderId, 1);
          }, 1000);
          return;
        } else {
          // Already retried once, log but continue (order might be created by worker later)
          console.warn(`⚠️ Order ${orderId} still not found after retry. This may be normal if the order is being processed.`);
          return;
        }
      }
      
      // For other errors, log but continue polling (might be temporary network issues)
      console.error("❌ Failed to refresh order status:", err);
    }
  }, [loadCredits]);

  const validateUrl = useCallback(async (url: string) => {
    if (!url.trim()) {
      setUrlValidation(null);
      return;
    }
    
    setValidatingUrl(true);
    try {
      const check = await apiClient.checkVayneUrl(url);
      // If the check returns invalid, sanitize the error message to hide Vayne API details
      if (!check.is_valid) {
        setUrlValidation({
          ...check,
          error: "Invalid URL - Please make sure the URL you submitted is valid",
        });
      } else {
        setUrlValidation(check);
      }
    } catch (err) {
      setUrlValidation({
        is_valid: false,
        error: "Invalid URL - Please make sure the URL you submitted is valid",
      });
    } finally {
      setValidatingUrl(false);
    }
  }, []);

  // Load auth status and credits on mount
  useEffect(() => {
    // Wrap in try-catch to prevent unhandled errors
    const loadInitialData = async () => {
      try {
        setInitialLoading(true);
        loadCredits();
      } catch (err) {
        console.error("Error loading initial data:", err);
        setError("Failed to load page data. Please refresh the page.");
        setShowErrorModal(true);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [loadCredits]);

  // Poll Vayne API every 5 seconds until scraping is finished
  // Add initial delay before first poll to avoid race conditions with order creation
  useEffect(() => {
    if (currentOrder) {
      const scrapingStatus = currentOrder.scraping_status;
      const hasVayneOrderId = !!currentOrder.vayne_order_id;
      
      // Stop polling when scraping is finished or failed
      if (scrapingStatus === "finished" || scrapingStatus === "failed" || currentOrder.status === "failed") {
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        if (refreshTimer) {
          clearInterval(refreshTimer);
          setRefreshTimer(null);
        }
        return;
      }
      
      // Add initial delay before first poll to ensure order is committed to database
      // This prevents 404 errors immediately after order creation
      const initialDelay = setTimeout(() => {
        // First poll after delay
        refreshOrderStatus(currentOrder.id);
        
        // Then poll every 5 seconds
        const timer = setInterval(() => {
          refreshOrderStatus(currentOrder.id);
        }, REFRESH_INTERVAL);
        refreshTimerRef.current = timer;
        setRefreshTimer(timer);
      }, 1000); // 1 second delay before first poll
      
      return () => {
        clearTimeout(initialDelay);
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
      };
    } else {
      // Clear timer when no current order
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (refreshTimer) {
        clearInterval(refreshTimer);
        setRefreshTimer(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder, refreshOrderStatus]);

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





  const handleStartScraping = async () => {
    if (!salesNavUrl.trim() || !urlValidation?.is_valid) {
      setError("Please enter a valid Sales Navigator URL");
      setShowErrorModal(true);
      return;
    }
    
    // Require cookie for each scrape
    if (!linkedinCookie.trim()) {
      setError("Please enter your LinkedIn session cookie to start scraping");
      setShowErrorModal(true);
      return;
    }
    
    // Require job name
    if (!jobName.trim()) {
      setError("Please enter a name for your scraping job");
      setShowErrorModal(true);
      return;
    }
    
    setCreatingOrder(true);
    try {
      const orderData: VayneOrderCreate = {
        sales_nav_url: salesNavUrl,
        linkedin_cookie: linkedinCookie,  // Send cookie with order request
        targeting: jobName.trim(),
      };
      
      const response = await apiClient.createVayneOrder(orderData);
      
      // Add a small delay before fetching order to ensure it's committed to database
      // This prevents race conditions where the order might not be immediately available
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const order = await apiClient.getVayneOrder(response.order_id);
      setCurrentOrder(order);
      setLinkedinCookie(""); // Clear cookie after use (require fresh one for next scrape)
      // Order status will be refreshed automatically via polling (with delay)
      await loadCredits(); // Refresh credits after order creation
      
      // No redirect - user stays on page to monitor scraping progress
      // When complete, they can download CSV and upload manually to enrichment
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("insufficient") || errorMessage.includes("credits")) {
        setError("Insufficient credits. Please top up your account.");
      } else if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
        setError("LinkedIn authentication failed. Please check your session cookie and try again.");
      } else {
        setError(errorMessage || "Failed to create order");
      }
      setShowErrorModal(true);
    } finally {
      setCreatingOrder(false);
    }
  };



  const handleDeleteClick = (orderId: string) => {
    setOrderToDelete(orderId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    
    try {
      await apiClient.deleteVayneOrder(orderToDelete);
      
      // If deleted order was the current order, clear it
      if (currentOrder && currentOrder.id === orderToDelete) {
        setCurrentOrder(null);
      }
      
      // Reload scrape history if it's loaded
      if (scrapeHistoryOrders.length > 0) {
        await loadScrapeHistory();
      }
      
      setShowDeleteModal(false);
      setOrderToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete order");
      setShowErrorModal(true);
      setShowDeleteModal(false);
      setOrderToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setOrderToDelete(null);
  };



  // Prevent body scroll when delete modal is open
  useEffect(() => {
    if (showDeleteModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showDeleteModal]);

  const handleClearForm = () => {
    setJobName("");
    setSalesNavUrl("");
    setUrlValidation(null);
    setExportFormat("simple");
    setOnlyQualified(false);
    setCurrentOrder(null);
    setLinkedinCookie(""); // Clear cookie
  };

  const handleDownloadCSV = async (orderId: string) => {
    try {
      const blob = await apiClient.downloadVayneOrderCSV(orderId);
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

  const loadScrapeHistory = useCallback(async () => {
    setLoadingScrapeHistory(true);
    try {
      // Load all orders (with pagination if needed)
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

      setScrapeHistoryOrders(allOrders.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      console.error("Failed to load scrape history:", err);
    } finally {
      setLoadingScrapeHistory(false);
    }
  }, []);

  const handleDeleteOrder = async (orderId: string) => {
    if (deleteConfirmOrderId === orderId) {
      // Confirm delete
      try {
        await apiClient.deleteVayneOrder(orderId);
        await loadScrapeHistory();
        setDeleteConfirmOrderId(null);
        
        // If deleted order was the current order, clear it
        if (currentOrder && currentOrder.id === orderId) {
          setCurrentOrder(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete order");
        setShowErrorModal(true);
        setDeleteConfirmOrderId(null);
      }
    } else {
      // First click - show confirm
      setDeleteConfirmOrderId(orderId);
    }
  };

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

  // Load scrape history on mount
  useEffect(() => {
    loadScrapeHistory();
  }, [loadScrapeHistory]);

  // Show loading state while initial data is being fetched
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
        <h1 className="text-3xl font-bold text-apple-text">Sales Nav Scraper</h1>
        <p className="mt-2 text-apple-text-muted">
          Import and enrich leads from Sales Navigator
        </p>
      </div>

      {/* Notice about charges */}
      <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-yellow-400">
            <strong>Important:</strong> Once scraping has started, you will still be charged for all leads scraped even if you cancel or delete the order from your order history.
          </p>
        </div>
      </div>

      <ErrorModal
        isOpen={showErrorModal}
        message={error}
        onClose={() => setShowErrorModal(false)}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleCancelDelete}
        >
          <div 
            className="bg-apple-surface border border-apple-border rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-apple-text mb-4">Delete Order</h3>
            <p className="text-sm text-apple-text-muted mb-6">
              Are you sure you want to delete this order from your order history? 
              <strong className="text-apple-text block mt-2">
                You will still be charged for all leads scraped, even if you delete the order.
              </strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelDelete();
                }}
                className="flex-1 px-4 py-2 bg-apple-bg border border-apple-border text-apple-text rounded-lg hover:bg-apple-card transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirmDelete();
                }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
              >
                Delete Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Name Input */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-apple-text mb-2">
          Job Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          placeholder="Enter a name for this scraping job (e.g., 'Q4 Sales Outreach')"
          required
          className="w-full px-4 py-3 bg-apple-bg border border-apple-border rounded-lg text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent"
        />
        <p className="mt-2 text-xs text-apple-text-muted">
          Give your scraping job a descriptive name to easily identify it in your order history
        </p>
      </div>

      {/* LinkedIn Cookie Input Card */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {linkedinCookie.trim() ? (
              <>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <div>
                  <p className="text-sm font-medium text-apple-text">LinkedIn Cookie Ready</p>
                  <p className="text-xs text-apple-text-muted">Cookie entered - ready to scrape</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div>
                  <p className="text-sm font-medium text-apple-text">LinkedIn Cookie Required</p>
                  <p className="text-xs text-apple-text-muted">Enter your session cookie to start scraping</p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-4 py-2 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors text-sm font-medium"
          >
            {linkedinCookie.trim() ? "Update Cookie" : "Connect LinkedIn Account"}
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
              <strong className="block mt-2">A fresh cookie is required for each scraping order.</strong>
            </p>
            <p className="text-xs text-apple-text-muted mb-4">
              <strong>How to get your cookie:</strong> Open browser developer tools (F12), go to Application/Storage → Cookies → linkedin.com, copy the "li_at" value.
            </p>
            <input
              type="text"
              value={linkedinCookie}
              onChange={(e) => setLinkedinCookie(e.target.value)}
              placeholder="Paste your li_at cookie here"
              className="w-full px-4 py-2 bg-apple-bg border border-apple-border rounded-lg text-apple-text mb-4 focus:outline-none focus:ring-2 focus:ring-apple-accent"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (linkedinCookie.trim()) {
                    setShowAuthModal(false);
                  } else {
                    setError("Please enter your LinkedIn session cookie");
                    setShowErrorModal(true);
                  }
                }}
                className="flex-1 px-4 py-2 bg-apple-accent text-white rounded-lg hover:bg-apple-accent/90 transition-colors"
              >
                Save Cookie
              </button>
              <button
                onClick={() => {
                  setShowAuthModal(false);
                }}
                className="px-4 py-2 bg-apple-surface border border-apple-border rounded-lg hover:bg-apple-card transition-colors"
              >
                Cancel
              </button>
            </div>
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
          disabled={!urlValidation?.is_valid || !linkedinCookie.trim() || creatingOrder}
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
              <span className="text-sm font-mono text-apple-text">{currentOrder?.id || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-apple-text-muted">Status</span>
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  currentOrder.scraping_status === "finished"
                    ? "bg-green-500/20 text-green-400"
                    : currentOrder.scraping_status === "failed" || currentOrder.status === "failed"
                    ? "bg-red-500/20 text-red-400"
                    : currentOrder.status === "queued"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                {currentOrder.scraping_status === "initialization" 
                  ? "Initializing"
                  : currentOrder.scraping_status === "scraping"
                  ? "Scraping"
                  : currentOrder.scraping_status === "finished"
                  ? "Finished"
                  : currentOrder.scraping_status === "failed"
                  ? "Failed"
                  : currentOrder.status}
              </span>
            </div>
            {currentOrder && currentOrder.vayne_order_id && currentOrder.scraping_status && 
             currentOrder.scraping_status !== "finished" && currentOrder.scraping_status !== "failed" && (
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
            {currentOrder?.leads_found !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-apple-text-muted">Leads Found</span>
                <span className="text-sm font-medium text-apple-text">
                  {currentOrder.leads_found.toLocaleString()}
                </span>
              </div>
            )}
            {currentOrder?.only_qualified && currentOrder.leads_qualified !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-apple-text-muted">Leads Qualified</span>
                <span className="text-sm font-medium text-apple-text">
                  {currentOrder.leads_qualified.toLocaleString()}
                </span>
              </div>
            )}

            {/* Download CSV button when order is completed */}
            {currentOrder && currentOrder.status === "completed" && currentOrder.file_url && (
              <div className="mt-4 pt-4 border-t border-apple-border">
                <button
                  onClick={() => handleDownloadCSV(currentOrder.id)}
                  className="w-full bg-apple-accent hover:bg-apple-accent/90 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download CSV
                </button>
                <p className="text-xs text-apple-text-muted mt-2 text-center">
                  Download the CSV file and upload it to the enrichment page to find valid emails
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Scrape History Section */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-apple-text mb-4">Scrape History</h3>
        {loadingScrapeHistory ? (
          <div className="flex justify-center items-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ) : scrapeHistoryOrders.length === 0 ? (
          <p className="text-apple-text-muted text-center py-8">No scrape history yet. Start a new scrape above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-apple-border">
              <thead className="bg-apple-surface-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Created At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Leads Found
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-apple-surface divide-y divide-apple-border">
                {scrapeHistoryOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-apple-text">
                      {order.vayne_order_id || order.id.slice(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          order.status === "completed" ? "badge-success" :
                          order.status === "processing" ? "badge-warning" :
                          order.status === "failed" ? "badge-error" :
                          "badge-info"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                      {order.leads_found?.toLocaleString() || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                      <div className="w-full bg-apple-surface-hover rounded-full h-2">
                        <div
                          className="bg-apple-accent h-2 rounded-full transition-all"
                          style={{ width: `${order.progress_percentage || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-apple-text-muted mt-1 block">
                        {order.progress_percentage?.toFixed(1) || 0}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {order.status === "completed" && order.file_url && (
                        <button
                          onClick={() => handleDownloadCSV(order.id)}
                          className="text-apple-accent hover:text-apple-accent-hover transition-colors"
                        >
                          Download
                        </button>
                      )}
                      {deleteConfirmOrderId === order.id ? (
                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          className="text-apple-error hover:text-apple-error/80 transition-colors"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          className="text-apple-error hover:text-apple-error/80 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
