"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { VayneCredits, VayneDailyUsage, VayneOrder, VayneOrderCreate } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";

export default function SalesNavScraperPage() {
  const router = useRouter();
  const { user } = useAuth();
  useEffect(() => {
    if (user && !user.is_admin) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // Auth state (cookie required for each order)
  const [linkedinCookie, setLinkedinCookie] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  // Live cookie-validation state. "valid" means the backend confirmed the
  // cookie against Vayne's /api/linkedin_authentication within this session.
  // Start Scraping is gated on cookieStatus === "valid" so a user cannot
  // submit a job with an unverified (or edited-since-verification) cookie.
  type CookieStatus = "idle" | "validating" | "valid" | "rejected" | "unavailable";
  const [cookieStatus, setCookieStatus] = useState<CookieStatus>("idle");
  // Kill switch fetched from backend. When false, validation UI is hidden
  // and Start Scraping no longer requires a "valid" verdict.
  const [validationEnabled, setValidationEnabled] = useState(true);
  
  // Credits state
  const [credits, setCredits] = useState<VayneCredits | null>(null);
  
  // Daily usage state
  const [dailyUsage, setDailyUsage] = useState<VayneDailyUsage | null>(null);
  
  // URL state (regex-only validation, no API call)
  const [salesNavUrl, setSalesNavUrl] = useState("");
  
  // Form state
  const [jobName, setJobName] = useState("");
  
  // Order state - simplified, no polling
  const [creatingOrder, setCreatingOrder] = useState(false);
  
  // Error state
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  // Daily limit reset modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const [resettingDailyLimit, setResettingDailyLimit] = useState(false);

  
  // Loading state
  const [initialLoading, setInitialLoading] = useState(true);

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Scrape history state - all orders from DB
  const [scrapeHistoryOrders, setScrapeHistoryOrders] = useState<VayneOrder[]>([]);
  const [loadingScrapeHistory, setLoadingScrapeHistory] = useState(false);
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

  // Load daily usage
  const loadDailyUsage = useCallback(async () => {
    try {
      const usage = await apiClient.getVayneDailyUsage();
      setDailyUsage(usage);
    } catch (err) {
      console.error("Failed to load daily usage:", err);
    }
  }, []);

  // Self-catching: a transient config fetch error must never brick the page.
  // Default to "disabled" on failure so the kill-switch period can't strand
  // users on a loading spinner.
  const loadValidationFlag = useCallback(async () => {
    try {
      const cfg = await apiClient.getVayneConfig();
      setValidationEnabled(cfg.cookie_validation_enabled);
    } catch (err) {
      console.error("Failed to fetch vayne config; defaulting to disabled:", err);
      setValidationEnabled(false);
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

      // Filter out deleted orders and sort by date, newest first
      const visibleOrders = allOrders
        .filter((order) => order.status !== "deleted")
        .sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      setScrapeHistoryOrders(visibleOrders);
    } catch (err) {
      console.error("Failed to load scrape history:", err);
    } finally {
      setLoadingScrapeHistory(false);
    }
  }, []);

  // Regex-only URL validation (no API call needed)
  const SALES_NAV_URL_REGEX = /^https?:\/\/(www\.)?linkedin\.com\/sales\/(search|lists|lead)/i;
  const hasLinkedinCookie = Boolean(linkedinCookie.trim());
  const isUrlFormatValid = salesNavUrl.trim() ? SALES_NAV_URL_REGEX.test(salesNavUrl.trim()) : false;
  // Start Scraping requires: cookie text present, URL passes the regex format
  // check, and we're not already creating an order. When the kill switch is
  // on (validationEnabled === true), also require a "valid" backend verdict.
  const isStartScrapingDisabled =
    !hasLinkedinCookie ||
    (validationEnabled && cookieStatus !== "valid") ||
    !isUrlFormatValid ||
    creatingOrder;
  const normalizedJobName = jobName.trim();

  // Load credits and history on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setInitialLoading(true);
        await Promise.all([loadCredits(), loadScrapeHistory(), loadDailyUsage(), loadValidationFlag()]);
      } catch (err) {
        console.error("Error loading initial data:", err);
        setError("Failed to load page data. Please refresh the page.");
        setShowErrorModal(true);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [loadCredits, loadScrapeHistory, loadDailyUsage, loadValidationFlag]);

  // Poll Vayne API for live status updates every 60 seconds (UI-only, does not update database)
  useEffect(() => {
    const POLL_INTERVAL = 60 * 1000; // 60 seconds in milliseconds

    const pollOrderStatuses = async () => {
      // Use functional update to access latest state without causing re-renders
      setScrapeHistoryOrders((prevOrders) => {
        // Get all orders that are not completed or failed
        const ordersToPolls = prevOrders.filter(
          (order) => order.status !== "completed" && order.status !== "failed"
        );

        if (ordersToPolls.length === 0) {
          return prevOrders; // Return unchanged
        }

        console.log(`[Polling] Checking status for ${ordersToPolls.length} active orders`);

        // Poll each order asynchronously (fire and forget inside this sync callback)
        Promise.allSettled(
          ordersToPolls.map(async (order) => {
            try {
              const pollResult = await apiClient.pollVayneOrderStatus(order.id);
              return { orderId: order.id, pollResult };
            } catch (err) {
              console.error(`[Polling] Failed to poll order ${order.id}:`, err);
              return null;
            }
          })
        ).then((statusUpdates) => {
          // Update UI state with poll results (does NOT update database)
          setScrapeHistoryOrders((currentOrders) => {
            return currentOrders.map((order) => {
              const updateResult = statusUpdates.find(
                (result) =>
                  result.status === "fulfilled" &&
                  result.value?.orderId === order.id
              );

              if (updateResult && updateResult.status === "fulfilled" && updateResult.value?.pollResult) {
                const { pollResult } = updateResult.value;
                console.log(`[Polling] Order ${order.id} status: ${pollResult.status}, scraping_status: ${pollResult.scraping_status}`);
                
                // Only update UI fields - this does NOT affect the database
                return {
                  ...order,
                  status: pollResult.status as 'queued' | 'pending' | 'processing' | 'completed' | 'failed',
                  scraping_status: pollResult.scraping_status as 'initialization' | 'scraping' | 'finished' | 'failed' | undefined,
                  leads_found: pollResult.leads_found,
                  leads_qualified: pollResult.leads_qualified,
                  progress_percentage: pollResult.progress_percentage,
                };
              }
              return order;
            });
          });
        });

        return prevOrders; // Return unchanged for now, async update will follow
      });
    };

    // Initial poll after a short delay (let the page load first)
    const initialTimeout = setTimeout(() => {
      pollOrderStatuses();
    }, 5000); // 5 seconds after mount

    // Set up interval for subsequent polls
    const intervalId = setInterval(pollOrderStatuses, POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(intervalId);
    };
  }, []); // Empty dependency array - only run once on mount

  // URL format validation is handled by the SALES_NAV_URL_REGEX memo above (no API calls)





  const handleStartScraping = async () => {
    if (!hasLinkedinCookie) {
      setError("Please add your LinkedIn cookie before starting a scrape.");
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
        targeting: normalizedJobName || undefined,
      };
      
      const response = await apiClient.createVayneOrder(orderData);
      
      // Immediately add a "queued" order to the UI (order will be processed by queue worker)
      const newOrder: VayneOrder = {
        id: response.order_id,
        status: "queued", // Orders start as queued until processed by queue worker
        targeting: normalizedJobName || response.order_id,
        created_at: new Date().toISOString(),
        leads_found: 0,
        progress_percentage: 0,
        // Required fields with defaults
        sales_nav_url: salesNavUrl,
        export_format: "simple",
        only_qualified: false,
        vayne_order_id: "", // Will be set by queue worker when processing
      };
      
      // Add to top of history list
      setScrapeHistoryOrders((prev: VayneOrder[]) => [newOrder, ...prev]);
      
      // Clear form
      setLinkedinCookie("");
      setJobName("");
      setSalesNavUrl("");
      
      // Refresh credits and daily usage after order creation
      await Promise.all([loadCredits(), loadDailyUsage()]);
      
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

  const handleClearForm = () => {
    setJobName("");
    setSalesNavUrl("");
    setLinkedinCookie("");
  };


  const handleDownloadCSV = async (orderId: string) => {
    setDownloadingOrderId(orderId);
    try {
      await apiClient.downloadVayneOrderCSVFile(orderId);
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
        <h1 className="text-3xl font-bold text-dashboard-text">Sales Nav Scraper</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Scrape Leads From Sales Navigator
        </p>
      </div>

      {/* Daily Scraping Limit */}
      {dailyUsage && (
        <div className="glass-card p-4 mb-6 relative z-30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-dashboard-text">Daily Scraping Limit</span>
              <div className="relative inline-flex group">
                <button
                  type="button"
                  className="text-dashboard-text-muted hover:text-dashboard-text transition-colors cursor-help"
                  aria-label="Daily scraping limit information"
                  aria-describedby="daily-scrape-limit-tooltip"
                  tabIndex={0}
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <div
                  id="daily-scrape-limit-tooltip"
                  role="tooltip"
                  className="absolute left-0 top-full z-[100] w-72 pt-2 opacity-0 invisible translate-y-0.5 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-[opacity,transform] duration-150 ease-out pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
                >
                  <div className="rounded-lg border border-zinc-600 bg-zinc-950 text-zinc-100 text-xs py-2.5 px-3 shadow-2xl">
                    <div className="absolute left-3 -top-1.5 w-2.5 h-2.5 rotate-45 border-l border-t border-zinc-600 bg-zinc-950" aria-hidden />
                    <p className="relative">
                      Scraping is limited to 15,000 profiles per day to reduce the risk of LinkedIn restricting, banning, or suspending your account.
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
          <div className="w-full bg-dashboard-card rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                dailyUsage.used / dailyUsage.limit > 0.9 ? "bg-red-500" :
                dailyUsage.used / dailyUsage.limit > 0.7 ? "bg-yellow-500" :
                "bg-dashboard-accent"
              }`}
              style={{ width: `${Math.min(100, (dailyUsage.used / dailyUsage.limit) * 100)}%` }}
            />
          </div>
          {dailyUsage.used / dailyUsage.limit > 0.9 && (
            <p className="text-xs text-red-400 mt-1.5">
              You are approaching your daily limit.
              {dailyUsage.resets_at && ` Resets ${new Date(dailyUsage.resets_at).toLocaleTimeString()}.`}
            </p>
          )}
        </div>
      )}

      <ErrorModal
        isOpen={showErrorModal}
        message={error}
        onClose={() => setShowErrorModal(false)}
      />

      {/* Reset Daily Limit Modal (from Reset button) */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="glass-card p-6 max-w-md w-full mx-4"
            style={{ background: 'rgba(13, 15, 18, 0.95)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold text-red-500">Warning</h3>
            </div>
            <p className="text-sm mb-3" style={{ color: '#C8D2DC' }}>
              Scraping more than 15,000 profiles per day using a single Sales Navigator account puts your LinkedIn account at risk of suspension or permanent ban.
            </p>
            <p className="text-sm mb-6" style={{ color: '#C8D2DC' }}>
              Only reset your daily limit if you plan to use a Sales Navigator cookie and URL from a different Sales Navigator account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 px-4 py-2 glass-card text-dashboard-text hover:bg-dashboard-card transition-colors text-sm font-medium"
              >
                Close
              </button>
              <button
                onClick={handleResetDailyLimit}
                disabled={resettingDailyLimit}
                className="flex-1 px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {resettingDailyLimit ? "Resetting..." : "Reset daily limit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Limit Reached Modal (auto-triggered when trying to scrape at limit) */}
      {showDailyLimitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowDailyLimitModal(false)}
        >
          <div
            className="glass-card p-6 max-w-md w-full mx-4"
            style={{ background: 'rgba(13, 15, 18, 0.95)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-red-500">Warning</h3>
            </div>
            <p className="text-sm text-dashboard-text-muted mb-3">
              You&apos;ve hit your daily scraping limit. Scraping more than 15,000 profiles per day using a single Sales Navigator account puts your LinkedIn account at risk of suspension or permanent ban.
            </p>
            <p className="text-sm text-dashboard-text-muted mb-6">
              Only continue if you plan to use a Sales Navigator cookie and URL from a different Sales Navigator account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDailyLimitModal(false)}
                className="flex-1 px-4 py-2 glass-card text-dashboard-text hover:bg-dashboard-card transition-colors text-sm font-medium"
              >
                Close
              </button>
              <button
                onClick={handleContinueScraping}
                disabled={resettingDailyLimit}
                className="flex-1 px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {resettingDailyLimit ? "Resetting..." : "Continue Scraping"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Name Input */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">
          Job Name
        </label>
        <input
          type="text"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          placeholder="Enter a name for this scraping job (e.g., 'Q4 Sales Outreach')"
          className="apple-input w-full py-3"
        />
        <p className="mt-2 text-xs text-dashboard-text-muted">
          Give your scraping job a descriptive name to easily identify it in your order history
        </p>
      </div>

      {/* LinkedIn Cookie Input Card */}
      <div className="glass-card px-6 py-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <div className="flex items-center gap-2">
              {linkedinCookie.trim() ? (
                <p className="text-sm font-medium text-dashboard-text">LinkedIn Cookie Set <span className="text-red-500">*</span></p>
              ) : (
                <p className="text-sm font-medium text-dashboard-text">LinkedIn Cookie <span className="text-red-500">*</span></p>
              )}
              {validationEnabled && cookieStatus === "validating" && (
                <span className="flex items-center gap-1.5 text-xs text-dashboard-text-muted">
                  <LoadingSpinner size="sm" />
                  Validating…
                </span>
              )}
              {validationEnabled && cookieStatus === "valid" && (
                <span className="text-dashboard-accent text-xs font-medium">Connected</span>
              )}
              {validationEnabled && cookieStatus === "rejected" && (
                <span
                  className="text-red-500 text-xs cursor-help underline decoration-dotted"
                  title="Your LinkedIn session cookie was rejected. Please provide a valid LinkedIn cookie and try again."
                >
                  Rejected
                </span>
              )}
              {validationEnabled && cookieStatus === "unavailable" && (
                <span
                  className="text-amber-500 text-xs cursor-help underline decoration-dotted"
                  title="We couldn't validate your cookie. Please try again. If this issue persists, contact support."
                >
                  Error
                </span>
              )}
            </div>
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
              <strong>How to get your cookie:</strong>
              <br /><br />
              Open browser developer tools (F12), go to Application/Storage → Cookies → linkedin.com, copy the "li_at" cookie value.
            </p>
            <input
              type="text"
              value={linkedinCookie}
              onChange={(e) => {
                setLinkedinCookie(e.target.value);
                // Any edit invalidates the previous verdict — user must
                // Save Cookie again to re-enable Start Scraping.
                if (cookieStatus !== "idle") setCookieStatus("idle");
              }}
              placeholder="Paste your li_at cookie here"
              className="apple-input w-full mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const trimmed = linkedinCookie.trim();
                  if (!trimmed) return;
                  // Kill switch: when the backend flag is off, Save Cookie
                  // just stashes the value and closes the modal silently —
                  // no API call, no spinner, no badge. Start Scraping is
                  // gated only on cookie text present + URL regex.
                  if (!validationEnabled) {
                    setShowAuthModal(false);
                    return;
                  }
                  setCookieStatus("validating");
                  try {
                    const res = await apiClient.validateLinkedInCookie(trimmed);
                    if (res.valid) {
                      setCookieStatus("valid");
                      setShowAuthModal(false);
                    } else if (res.reason === "unavailable") {
                      setCookieStatus("unavailable");
                    } else {
                      setCookieStatus("rejected");
                    }
                  } catch (err) {
                    console.error("validateLinkedInCookie failed:", err);
                    // Network/HTTP error — validator couldn't give a verdict;
                    // treat as "unavailable" so the UX points the user at
                    // retrying rather than suggesting the cookie is bad.
                    setCookieStatus("unavailable");
                  }
                }}
                disabled={cookieStatus === "validating" || !linkedinCookie.trim()}
                className="flex-1 px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {validationEnabled && cookieStatus === "validating" ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Validating…
                  </>
                ) : (
                  "Save Cookie"
                )}
              </button>
              <button
                onClick={() => {
                  setShowAuthModal(false);
                }}
                className="px-4 py-2 glass-card hover:bg-dashboard-card transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Sales Navigator URL Input */}
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
        <p className="mt-2 text-xs text-dashboard-text-muted">
          Paste the URL from your Sales Navigator search results page
        </p>
        {salesNavUrl.trim() && (
          <div className="mt-2 flex items-center gap-2">
            {isUrlFormatValid ? (
              <>
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-500">
                  Valid Sales Navigator URL
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-red-500">Please enter a valid Sales Navigator URL (linkedin.com/sales/search/...)</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStartScraping}
          disabled={isStartScrapingDisabled}
          className="flex-1 px-6 py-3 border border-dashboard-accent text-dashboard-accent bg-transparent rounded-lg hover:bg-dashboard-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
          className="px-6 py-3 glass-card hover:bg-dashboard-card transition-colors"
        >
          Clear Form
        </button>
      </div>

      {/* Scrape History Section - Shows all orders */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-lg font-semibold text-dashboard-text mb-4">Scraping Orders</h3>
        {loadingScrapeHistory && scrapeHistoryOrders.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ) : scrapeHistoryOrders.length === 0 ? (
          <p className="text-dashboard-text-muted text-center py-8">No scraping orders yet. Start a new scrape above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Job Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Created At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                {scrapeHistoryOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text">
                      {order.targeting && order.targeting !== "Untitled Order"
                        ? order.targeting
                        : order.vayne_order_id || order.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          order.status === "completed" ? "text-[#22c55e]" :
                          order.status === "queued" ? "text-blue-400" :
                          order.status === "processing" || order.status === "initialization" || order.status === "scraping" || order.status === "segmenting" ? "text-yellow-400" :
                          order.status === "failed" ? "text-red-400" :
                          order.status === "pending" ? "text-purple-400" :
                          "text-dashboard-text-muted"
                        }`}
                      >
                        {order.status === "processing" || order.status === "initialization" || order.status === "scraping" || order.status === "segmenting" ? "Processing" : 
                         order.status === "queued" ? "Queued" :
                         order.status === "pending" ? "Pending" :
                         order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {order.status === "completed" && (
                          <button
                            onClick={() => handleDownloadCSV(order.id)}
                            disabled={downloadingOrderId === order.id}
                            className="px-3 py-1.5 border border-dashboard-accent text-dashboard-accent bg-transparent text-xs rounded-lg hover:bg-dashboard-accent/10 transition-colors disabled:opacity-50"
                          >
                            {downloadingOrderId === order.id ? "Downloading..." : "Download CSV"}
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
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-dashboard-text mb-4">Frequently Asked Questions</h3>
        <div className="space-y-2">
          {[
            {
              q: "How do I get my LinkedIn session cookie?",
              a: (
                <>
                  <strong>For Mac:</strong>
                  <br />
                  Press Cmd+Option+J (Chrome) or Cmd+Option+C (Safari) to open developer tools, go to the Application/Storage tab, find Cookies under linkedin.com, and copy the &#39;li_at&#39; cookie value.
                  <br /><br />
                  <strong>For Windows:</strong>
                  <br />
                  Press F12 or Ctrl+Shift+J (Chrome), go to the Application/Storage tab, find Cookies under linkedin.com, and copy the &#39;li_at&#39; cookie value.
                </>
              ),
            },
            {
              q: "Can I scrape multiple URLs?",
              a: "Yes, you can create multiple orders. Each order processes one Sales Navigator URL.",
            },
          ].map((faq, idx) => (
            <div key={idx} className="border-b border-dashboard-border last:border-0">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between py-3 text-left"
              >
                <span className="text-sm font-medium text-dashboard-text">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-dashboard-text-muted transition-transform ${
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
                <p className="pb-3 text-sm text-dashboard-text-muted">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
