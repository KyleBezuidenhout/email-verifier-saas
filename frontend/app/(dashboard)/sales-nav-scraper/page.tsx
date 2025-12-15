"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { VayneCredits, VayneUrlCheck, VayneOrder, VayneOrderCreate } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export default function SalesNavScraperPage() {
  // Auth state (cookie required for each order)
  const [linkedinCookie, setLinkedinCookie] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Credits state
  const [credits, setCredits] = useState<VayneCredits | null>(null);
  
  // URL validation state
  const [salesNavUrl, setSalesNavUrl] = useState("");
  const [urlValidation, setUrlValidation] = useState<VayneUrlCheck | null>(null);
  const [validatingUrl, setValidatingUrl] = useState(false);
  
  // Form state
  const [jobName, setJobName] = useState("");
  
  // Order state - simplified, no polling
  const [creatingOrder, setCreatingOrder] = useState(false);
  
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

  // Scrape history state - all orders from DB
  const [scrapeHistoryOrders, setScrapeHistoryOrders] = useState<VayneOrder[]>([]);
  const [loadingScrapeHistory, setLoadingScrapeHistory] = useState(false);
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);

  // Load credits
  const loadCredits = useCallback(async () => {
    try {
      const creditsData = await apiClient.getVayneCredits();
      setCredits(creditsData);
    } catch (err) {
      console.error("Failed to load credits:", err);
    }
  }, []);

  // Load all orders from database (no Vayne API polling)
  const loadScrapeHistory = useCallback(async () => {
    setLoadingScrapeHistory(true);
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

      // Sort by date, newest first - show ALL orders (not just completed)
      const sortedOrders = allOrders.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setScrapeHistoryOrders(sortedOrders);
    } catch (err) {
      console.error("Failed to load scrape history:", err);
    } finally {
      setLoadingScrapeHistory(false);
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
        valid: false,
        error: "Invalid URL - Please make sure the URL you submitted is valid",
      });
    } finally {
      setValidatingUrl(false);
    }
  }, []);

  // Load credits and history on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setInitialLoading(true);
        await Promise.all([loadCredits(), loadScrapeHistory()]);
      } catch (err) {
        console.error("Error loading initial data:", err);
        setError("Failed to load page data. Please refresh the page.");
        setShowErrorModal(true);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [loadCredits, loadScrapeHistory]);

  // Debounced URL validation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    
    if (salesNavUrl.trim()) {
      timer = setTimeout(() => {
        validateUrl(salesNavUrl);
      }, 500);
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
        linkedin_cookie: linkedinCookie,
        targeting: jobName.trim(),
      };
      
      const response = await apiClient.createVayneOrder(orderData);
      
      // Immediately add a "processing" order to the UI (no polling, no fetching)
      const newOrder: VayneOrder = {
        id: response.order_id,
        status: "processing", // Always show as processing initially
        targeting: jobName.trim(),
        created_at: new Date().toISOString(),
        leads_found: 0,
        progress_percentage: 0,
        // Required fields with defaults
        sales_nav_url: salesNavUrl,
        export_format: "simple",
        only_qualified: false,
        vayne_order_id: "", // Will be set by backend
      };
      
      // Add to top of history list
      setScrapeHistoryOrders((prev: VayneOrder[]) => [newOrder, ...prev]);
      
      // Clear form
      setLinkedinCookie("");
      setJobName("");
      setSalesNavUrl("");
      setUrlValidation(null);
      
      // Refresh credits after order creation
      await loadCredits();
      
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : (typeof err === 'object' && err !== null && 'message' in err) 
          ? String((err as { message: unknown }).message)
          : String(err);
      
      if (errorMessage.includes("insufficient") || errorMessage.includes("credits")) {
        setError("Insufficient credits. Please top up your account.");
      } else if (errorMessage.includes("401") || errorMessage.includes("authentication") || errorMessage.includes("Session expired")) {
        setError("Session expired. Please refresh the page and try again.");
      } else if (errorMessage === "[object Object]") {
        setError("An unexpected error occurred. Please try again.");
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
      
      // Remove from local state
      setScrapeHistoryOrders((prev: VayneOrder[]) => prev.filter((o: VayneOrder) => o.id !== orderToDelete));
      
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
    setLinkedinCookie("");
  };


  const handleDeleteOrder = async (orderId: string) => {
    if (deleteConfirmOrderId === orderId) {
      // Confirm delete
      try {
        await apiClient.deleteVayneOrder(orderId);
        setScrapeHistoryOrders((prev: VayneOrder[]) => prev.filter((o: VayneOrder) => o.id !== orderId));
        setDeleteConfirmOrderId(null);
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

  const handleDownloadCSV = async (orderId: string) => {
    setDownloadingOrderId(orderId);
    try {
      await apiClient.downloadVayneOrderCSV(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download CSV");
      setShowErrorModal(true);
    } finally {
      setDownloadingOrderId(null);
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

      {/* Scrape History Section - Shows all orders */}
      <div className="bg-apple-surface border border-apple-border rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-apple-text mb-4">Scraping Orders</h3>
        {loadingScrapeHistory && scrapeHistoryOrders.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ) : scrapeHistoryOrders.length === 0 ? (
          <p className="text-apple-text-muted text-center py-8">No scraping orders yet. Start a new scrape above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-apple-border">
              <thead className="bg-apple-surface-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Job Name
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-apple-surface divide-y divide-apple-border">
                {scrapeHistoryOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-apple-text">
                      {order.targeting || order.vayne_order_id || order.id.slice(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          order.status === "completed" ? "bg-green-500/20 text-green-400" :
                          order.status === "processing" ? "bg-yellow-500/20 text-yellow-400" :
                          order.status === "failed" ? "bg-red-500/20 text-red-400" :
                          "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {order.status === "processing" ? "Processing" : order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                      {order.status === "processing" ? "—" : (order.leads_found?.toLocaleString() || "N/A")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {order.status === "completed" && (
                          <button
                            onClick={() => handleDownloadCSV(order.id)}
                            disabled={downloadingOrderId === order.id}
                            className="px-3 py-1.5 bg-apple-accent text-white text-xs rounded-lg hover:bg-apple-accent/90 transition-colors disabled:opacity-50"
                          >
                            {downloadingOrderId === order.id ? "Downloading..." : "Download CSV"}
                          </button>
                        )}
                        {deleteConfirmOrderId === order.id ? (
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="text-apple-error hover:text-apple-error/80 transition-colors text-xs"
                          >
                            Confirm Delete
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="text-apple-text-muted hover:text-apple-error transition-colors text-xs"
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
