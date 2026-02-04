"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "@/lib/api";
import { GoogleMapsScraperOrder, GoogleMapsScraperHealthStatus, GoogleMapsScraperPreviewResponse } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";

type ScrapeMode = "single_city" | "full_state";

// Searchable Select Component with Portal for proper z-index
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  loading,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const dropdownContent = isOpen && !disabled && typeof document !== 'undefined' ? createPortal(
    <div 
      ref={dropdownRef}
      className="fixed bg-dashboard-surface border border-dashboard-border rounded-lg shadow-2xl overflow-hidden"
      style={{ 
        zIndex: 99999,
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
    >
      <div className="p-2 border-b border-dashboard-border bg-dashboard-surface">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-3 py-2 bg-dashboard-card border border-dashboard-border rounded-lg text-sm text-dashboard-text placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="overflow-y-auto max-h-48 bg-dashboard-surface">
        {filteredOptions.length === 0 ? (
          <div className="px-4 py-3 text-sm text-dashboard-text-muted">No results found</div>
        ) : (
          filteredOptions.map((option) => (
            <div
              key={option}
              className={`px-4 py-2 cursor-pointer text-sm transition-colors ${
                option === value 
                  ? 'bg-dashboard-accent/20 text-dashboard-accent' 
                  : 'text-dashboard-text hover:bg-dashboard-card'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(option);
                setIsOpen(false);
                setSearch("");
              }}
            >
              {option}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        className={`apple-input w-full py-3 cursor-pointer flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={value ? "text-dashboard-text" : "text-dashboard-text-muted"}>
          {value || placeholder}
        </span>
        {loading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <svg className={`w-5 h-5 text-dashboard-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {dropdownContent}
    </div>
  );
}

// Multi-Select Searchable Component with Portal (for admin multi-state selection)
function MultiSelectSearchable({
  options,
  values,
  onChange,
  placeholder,
  disabled,
  loading,
}: {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (values.includes(option)) {
      onChange(values.filter(v => v !== option));
    } else {
      onChange([...values, option]);
    }
  };

  const dropdownContent = isOpen && !disabled && typeof document !== 'undefined' ? createPortal(
    <div 
      ref={dropdownRef}
      className="fixed bg-dashboard-surface border border-dashboard-border rounded-lg shadow-2xl overflow-hidden"
      style={{ 
        zIndex: 99999,
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
    >
      <div className="p-2 border-b border-dashboard-border bg-dashboard-surface">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search states..."
          className="w-full px-3 py-2 bg-dashboard-card border border-dashboard-border rounded-lg text-sm text-dashboard-text placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="overflow-y-auto max-h-48 bg-dashboard-surface">
        {filteredOptions.length === 0 ? (
          <div className="px-4 py-3 text-sm text-dashboard-text-muted">No results found</div>
        ) : (
          filteredOptions.map((option) => (
            <div
              key={option}
              className={`px-4 py-2 cursor-pointer text-sm transition-colors flex items-center gap-2 ${
                values.includes(option)
                  ? 'bg-dashboard-accent/20 text-dashboard-accent' 
                  : 'text-dashboard-text hover:bg-dashboard-card'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                toggleOption(option);
              }}
            >
              <input 
                type="checkbox" 
                checked={values.includes(option)}
                onChange={() => {}}
                className="w-4 h-4 rounded border-dashboard-border text-dashboard-accent"
              />
              {option}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        className={`apple-input w-full py-3 cursor-pointer flex items-center justify-between min-h-[48px] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {values.length === 0 ? (
            <span className="text-dashboard-text-muted">{placeholder}</span>
          ) : (
            values.map(v => (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-dashboard-accent/20 text-dashboard-accent rounded text-xs">
                {v}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(values.filter(val => val !== v));
                  }}
                  className="hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        {loading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <svg className={`w-5 h-5 text-dashboard-text-muted transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {dropdownContent}
    </div>
  );
}

export default function GoogleMapsScraperPage() {
  const { user } = useAuth();
  
  // Health check state
  const [healthStatus, setHealthStatus] = useState<GoogleMapsScraperHealthStatus | null>(null);
  
  // Mode state
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>("single_city");
  
  // Form state
  const [jobName, setJobName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("");  // For single city mode
  const [selectedStates, setSelectedStates] = useState<string[]>([]);  // For full state mode (admin)
  const [selectedCity, setSelectedCity] = useState("");
  
  // Dropdown data
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  
  // Cost estimate
  const [costEstimate, setCostEstimate] = useState<{ num_cities: number; estimated_cost: number } | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  
  // Order state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orders, setOrders] = useState<GoogleMapsScraperOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  
  // UI state
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  
  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<GoogleMapsScraperPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);

  const isAdmin = user?.is_admin || false;

  // Check Apify API health
  const checkHealth = useCallback(async () => {
    try {
      const status = await apiClient.getGoogleMapsScraperHealth();
      setHealthStatus(status);
    } catch (err) {
      setHealthStatus({ apify_api: "disconnected", message: "Could not check API status" });
    }
  }, []);

  // Load states
  const loadStates = useCallback(async () => {
    setLoadingStates(true);
    try {
      const response = await apiClient.getGoogleMapsScraperStates();
      setStates(response.states);
    } catch (err) {
      console.error("Failed to load states:", err);
    } finally {
      setLoadingStates(false);
    }
  }, []);

  // Load cities for selected state
  const loadCities = useCallback(async (state: string) => {
    if (!state) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    try {
      const response = await apiClient.getGoogleMapsScraperCities(state);
      setCities(response.cities);
    } catch (err) {
      console.error("Failed to load cities:", err);
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  }, []);

  // Load orders
  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const response = await apiClient.getGoogleMapsScraperOrders(100, 0);
      const visibleOrders = response.orders
        .filter((order) => order.status !== "cancelled")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrders(visibleOrders);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Estimate cost
  const estimateCost = useCallback(async () => {
    const statesToEstimate = scrapeMode === "single_city" ? [selectedState] : selectedStates;
    
    if (statesToEstimate.length === 0 || (scrapeMode === "single_city" && !selectedState)) {
      setCostEstimate(null);
      return;
    }
    
    setLoadingEstimate(true);
    try {
      const estimate = await apiClient.estimateGoogleMapsScraperCost(
        scrapeMode,
        statesToEstimate,
        scrapeMode === "single_city" ? selectedCity : undefined
      );
      setCostEstimate(estimate);
    } catch (err) {
      console.error("Failed to estimate cost:", err);
      setCostEstimate(null);
    } finally {
      setLoadingEstimate(false);
    }
  }, [scrapeMode, selectedState, selectedStates, selectedCity]);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setInitialLoading(true);
        await Promise.all([checkHealth(), loadStates(), loadOrders()]);
      } catch (err) {
        console.error("Error loading initial data:", err);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [checkHealth, loadStates, loadOrders]);

  // Load cities when state changes (single city mode)
  useEffect(() => {
    if (scrapeMode === "single_city" && selectedState) {
      loadCities(selectedState);
    } else {
      setCities([]);
      setSelectedCity("");
    }
  }, [selectedState, scrapeMode, loadCities]);

  // Estimate cost when relevant values change
  useEffect(() => {
    if (scrapeMode === "single_city") {
      if (selectedState && selectedCity) {
        estimateCost();
      } else {
        setCostEstimate(null);
      }
    } else {
      if (selectedStates.length > 0) {
        estimateCost();
      } else {
        setCostEstimate(null);
      }
    }
  }, [scrapeMode, selectedState, selectedStates, selectedCity, estimateCost]);

  // Reset form when mode changes
  useEffect(() => {
    setSelectedState("");
    setSelectedStates([]);
    setSelectedCity("");
    setCostEstimate(null);
  }, [scrapeMode]);

  // Poll for order status updates
  useEffect(() => {
    const POLL_INTERVAL = 30000;

    const pollOrderStatuses = async () => {
      const activeOrders = orders.filter(
        (order) => order.status === "pending" || order.status === "processing"
      );

      if (activeOrders.length === 0) return;

      const updates = await Promise.allSettled(
        activeOrders.map(async (order) => {
          const result = await apiClient.pollGoogleMapsScraperOrderStatus(order.id);
          return { orderId: order.id, result };
        })
      );

      setOrders((currentOrders) =>
        currentOrders.map((order) => {
          const update = updates.find(
            (u) => u.status === "fulfilled" && u.value.orderId === order.id
          );
          if (update && update.status === "fulfilled") {
            const { result } = update.value;
            return {
              ...order,
              status: result.status as GoogleMapsScraperOrder["status"],
              completed_cities: result.completed_cities,
              progress_percentage: result.progress_percentage,
              results_count: result.results_count,
              error_message: result.error_message || null,
            };
          }
          return order;
        })
      );
    };

    const intervalId = setInterval(pollOrderStatuses, POLL_INTERVAL);
    const timeoutId = setTimeout(pollOrderStatuses, 5000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [orders]);

  // Start scraping
  const handleStartScraping = async () => {
    if (!jobName.trim()) {
      setError("Please enter a job name");
      setShowErrorModal(true);
      return;
    }

    if (!searchTerm.trim()) {
      setError("Please enter a search term (e.g., 'Restaurants', 'Dentists')");
      setShowErrorModal(true);
      return;
    }

    if (scrapeMode === "single_city") {
      if (!selectedState) {
        setError("Please select a state");
        setShowErrorModal(true);
        return;
      }
      if (!selectedCity) {
        setError("Please select a city");
        setShowErrorModal(true);
        return;
      }
    } else {
      if (selectedStates.length === 0) {
        setError("Please select at least one state");
        setShowErrorModal(true);
        return;
      }
    }

    setCreatingOrder(true);
    try {
      const newOrder = await apiClient.createGoogleMapsScraperOrder({
        job_name: jobName.trim(),
        scrape_mode: scrapeMode,
        states: scrapeMode === "single_city" ? [selectedState] : selectedStates,
        city: scrapeMode === "single_city" ? selectedCity : null,
        search_term: searchTerm.trim(),
      });

      setOrders((prev) => [newOrder, ...prev]);
      setJobName("");
      setSearchTerm("");
      setSelectedState("");
      setSelectedStates([]);
      setSelectedCity("");
      setCostEstimate(null);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "Failed to start scraping");
      setShowErrorModal(true);
    } finally {
      setCreatingOrder(false);
    }
  };

  // Delete order
  const handleDeleteOrder = async (orderId: string) => {
    if (deleteConfirmOrderId === orderId) {
      try {
        await apiClient.deleteGoogleMapsScraperOrder(orderId);
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setDeleteConfirmOrderId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete order");
        setShowErrorModal(true);
        setDeleteConfirmOrderId(null);
      }
    } else {
      setDeleteConfirmOrderId(orderId);
    }
  };

  // Download results
  const handleDownloadResults = async (orderId: string) => {
    setDownloadingOrderId(orderId);
    try {
      await apiClient.downloadGoogleMapsScraperResults(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download results");
      setShowErrorModal(true);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  // Preview results
  const handlePreviewResults = async (orderId: string) => {
    setPreviewOrderId(orderId);
    setPreviewLoading(true);
    setShowPreviewModal(true);
    try {
      const data = await apiClient.getGoogleMapsScraperPreview(orderId);
      setPreviewData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
      setShowErrorModal(true);
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRowClick = (order: GoogleMapsScraperOrder, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (order.status === "completed") {
      handlePreviewResults(order.id);
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

  const formatCost = (cost: number) => `$${cost.toFixed(2)}`;

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
        <h1 className="text-3xl font-bold text-dashboard-text">Google Maps Scraper</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Extract business data from Google Maps using Apify
        </p>
      </div>

      {/* API Health Status */}
      <div className={`mb-6 glass-card p-4 ${
        healthStatus?.apify_api === "connected" 
          ? "bg-green-500/10 border-green-500/30" 
          : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            healthStatus?.apify_api === "connected" ? "bg-green-500" : "bg-red-500"
          }`}></div>
          <div>
            <p className={`text-sm font-medium ${
              healthStatus?.apify_api === "connected" ? "text-green-400" : "text-red-400"
            }`}>
              {healthStatus?.apify_api === "connected" ? "Apify API Connected" : "Apify API Disconnected"}
            </p>
            <p className="text-xs text-dashboard-text-muted">{healthStatus?.message}</p>
          </div>
          <button onClick={checkHealth} className="ml-auto px-3 py-1 text-xs bg-dashboard-card hover:bg-dashboard-border rounded-lg transition-colors">
            Refresh
          </button>
        </div>
      </div>

      <ErrorModal isOpen={showErrorModal} message={error} onClose={() => setShowErrorModal(false)} />

      {/* Results Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowPreviewModal(false); setPreviewData(null); setPreviewOrderId(null); }} />
          <div className="relative bg-dashboard-surface border border-dashboard-border rounded-2xl p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-dashboard-text">Results Preview</h2>
                {previewData && <p className="text-sm text-dashboard-text-muted mt-1">Showing {previewData.preview_count} of {previewData.total_rows.toLocaleString()} results</p>}
              </div>
              <button onClick={() => { setShowPreviewModal(false); setPreviewData(null); setPreviewOrderId(null); }} className="p-2 hover:bg-dashboard-card rounded-lg transition-colors">
                <svg className="w-5 h-5 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {previewLoading ? (
              <div className="flex items-center justify-center py-12"><LoadingSpinner size="lg" /></div>
            ) : previewData && previewData.rows.length > 0 ? (
              <div className="flex-1 overflow-auto">
                <table className="min-w-full divide-y divide-dashboard-border">
                  <thead style={{ background: "rgba(13, 15, 18, 0.5)" }} className="sticky top-0">
                    <tr>
                      {previewData.columns.map((col) => (
                        <th key={col} className="px-4 py-2 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider whitespace-nowrap">{col.replace(/([A-Z])/g, ' $1').trim()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: "rgba(13, 15, 18, 0.3)" }} className="divide-y divide-dashboard-border">
                    {previewData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-dashboard-card/30">
                        {previewData.columns.map((col) => (
                          <td key={col} className={`px-4 py-2 text-sm whitespace-nowrap max-w-[200px] truncate ${col === 'website' ? row[col] ? 'text-blue-400' : 'text-dashboard-text-muted' : col === 'phone' ? row[col] ? 'text-green-400' : 'text-dashboard-text-muted' : 'text-dashboard-text'}`} title={row[col] || '-'}>{row[col] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12"><p className="text-dashboard-text-muted">No results available</p></div>
            )}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-dashboard-border">
              <button onClick={() => { setShowPreviewModal(false); setPreviewData(null); setPreviewOrderId(null); }} className="px-4 py-2 bg-dashboard-card text-dashboard-text rounded-lg hover:bg-dashboard-border transition-colors">Close</button>
              {previewOrderId && <button onClick={() => handleDownloadResults(previewOrderId)} disabled={downloadingOrderId === previewOrderId} className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50">{downloadingOrderId === previewOrderId ? "Downloading..." : "Download Full CSV"}</button>}
            </div>
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-4">Scrape Mode</label>
        <div className="flex rounded-lg overflow-hidden border border-dashboard-border">
          <button
            onClick={() => setScrapeMode("single_city")}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-all ${scrapeMode === "single_city" ? "bg-dashboard-accent text-white" : "bg-dashboard-card text-dashboard-text-muted hover:bg-dashboard-border"}`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Single City
            </div>
            <p className="text-xs mt-1 opacity-75">~$0.80 per city</p>
          </button>
          {isAdmin ? (
            <button
              onClick={() => setScrapeMode("full_state")}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-all ${scrapeMode === "full_state" ? "bg-dashboard-accent text-white" : "bg-dashboard-card text-dashboard-text-muted hover:bg-dashboard-border"}`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Full State(s)
              </div>
              <p className="text-xs mt-1 opacity-75">All cities in selected states</p>
            </button>
          ) : (
            <div className="flex-1 px-6 py-3 text-sm font-medium bg-dashboard-card text-dashboard-text-muted/50 cursor-not-allowed relative">
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Full State(s)
              </div>
              <p className="text-xs mt-1 opacity-75">Admin only</p>
            </div>
          )}
        </div>
      </div>

      {/* Job Name */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">Job Name <span className="text-red-500">*</span></label>
        <input type="text" value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="e.g., 'California Restaurants Q1 2024'" className="apple-input w-full py-3" />
      </div>

      {/* Search Term */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">Business Type / Search Term <span className="text-red-500">*</span></label>
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="e.g., 'Restaurants', 'Dentists', 'Gyms', 'Coffee Shops'" className="apple-input w-full py-3" />
        <p className="mt-2 text-xs text-dashboard-text-muted">Enter the type of business you want to find (uses Google Maps search)</p>
      </div>

      {/* Single City Mode: State + City Selection */}
      {scrapeMode === "single_city" && (
        <>
          <div className="glass-card p-6 mb-6">
            <label className="block text-sm font-medium text-dashboard-text mb-2">State <span className="text-red-500">*</span></label>
            <SearchableSelect
              options={states}
              value={selectedState}
              onChange={(v) => { setSelectedState(v); setSelectedCity(""); }}
              placeholder="Search and select a state..."
              loading={loadingStates}
            />
          </div>

          {selectedState && (
            <div className="glass-card p-6 mb-6">
              <label className="block text-sm font-medium text-dashboard-text mb-2">City <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={cities}
                value={selectedCity}
                onChange={setSelectedCity}
                placeholder="Search and select a city..."
                disabled={!selectedState || cities.length === 0}
                loading={loadingCities}
              />
              {!loadingCities && cities.length === 0 && selectedState && (
                <p className="mt-2 text-xs text-yellow-400">No cities found for this state. Please seed the database.</p>
              )}
              {cities.length > 0 && <p className="mt-2 text-xs text-dashboard-text-muted">{cities.length} cities available</p>}
            </div>
          )}
        </>
      )}

      {/* Full State Mode: Multi-State Selection (Admin Only) */}
      {scrapeMode === "full_state" && isAdmin && (
        <div className="glass-card p-6 mb-6">
          <label className="block text-sm font-medium text-dashboard-text mb-2">Select States <span className="text-red-500">*</span></label>
          <MultiSelectSearchable
            options={states}
            values={selectedStates}
            onChange={setSelectedStates}
            placeholder="Search and select states..."
            loading={loadingStates}
          />
          {selectedStates.length > 0 && (
            <p className="mt-2 text-xs text-dashboard-text-muted">{selectedStates.length} state{selectedStates.length > 1 ? 's' : ''} selected</p>
          )}
        </div>
      )}

      {/* Cost Estimate */}
      {costEstimate && (
        <div className="glass-card p-6 mb-6 bg-yellow-500/10 border-yellow-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-400">Estimated Cost: {formatCost(costEstimate.estimated_cost)}</p>
                <p className="text-xs text-dashboard-text-muted mt-1">{costEstimate.num_cities} {costEstimate.num_cities === 1 ? 'city' : 'cities'} @ $0.80/city</p>
              </div>
            </div>
            {loadingEstimate && <LoadingSpinner size="sm" />}
          </div>
        </div>
      )}

      {/* Start Button */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStartScraping}
          disabled={
            creatingOrder ||
            !jobName.trim() ||
            !searchTerm.trim() ||
            (scrapeMode === "single_city" && (!selectedState || !selectedCity)) ||
            (scrapeMode === "full_state" && selectedStates.length === 0) ||
            healthStatus?.apify_api !== "connected"
          }
          className="flex-1 px-6 py-3 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {creatingOrder ? (
            <span className="flex items-center justify-center gap-2"><LoadingSpinner size="sm" />Starting...</span>
          ) : (
            `Start Scraping${costEstimate ? ` (${formatCost(costEstimate.estimated_cost)})` : ''}`
          )}
        </button>
      </div>

      {/* Orders History */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-dashboard-text">Scraping Orders</h3>
          <button onClick={loadOrders} disabled={loadingOrders} className="px-3 py-1 text-xs bg-dashboard-card hover:bg-dashboard-border rounded-lg transition-colors">{loadingOrders ? "Loading..." : "Refresh"}</button>
        </div>
        
        {loadingOrders && orders.length === 0 ? (
          <div className="flex justify-center items-center py-8"><LoadingSpinner size="sm" /></div>
        ) : orders.length === 0 ? (
          <p className="text-dashboard-text-muted text-center py-8">No scraping orders yet. Start a new scrape above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: "rgba(13, 15, 18, 0.5)" }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Job Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Mode / Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Search Term</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: "rgba(13, 15, 18, 0.3)" }} className="divide-y divide-dashboard-border">
                {orders.map((order) => (
                  <tr key={order.id} onClick={(e) => handleRowClick(order, e)} className={`transition-colors ${order.status === "completed" ? "hover:bg-dashboard-card/50 cursor-pointer" : ""}`} title={order.status === "completed" ? "Click to preview results" : undefined}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text">{order.job_name || order.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${order.scrape_mode === "full_state" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}`}>
                          {order.scrape_mode === "full_state" ? "Full State" : "Single City"}
                        </span>
                        <p className="mt-1 text-xs">{order.states?.join(", ") || "-"}{order.city ? `, ${order.city}` : ''}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text max-w-[150px] truncate">{order.search_term}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${order.status === "completed" ? "bg-green-500/20 text-green-400" : order.status === "processing" ? "bg-yellow-500/20 text-yellow-400" : order.status === "pending" ? "bg-blue-500/20 text-blue-400" : order.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text">
                      {order.status === "completed" ? (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          <span className="text-green-400">{order.results_count.toLocaleString()} results</span>
                        </div>
                      ) : order.status === "failed" ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-red-400">Failed</span>
                          {order.error_message && <span className="text-xs text-red-400/70 max-w-[200px] truncate" title={order.error_message}>{order.error_message}</span>}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 bg-dashboard-card rounded-full h-2 overflow-hidden"><div className="bg-dashboard-accent h-2 rounded-full transition-all duration-500 ease-out" style={{ width: `${order.progress_percentage || 5}%` }} /></div>
                            <span className="text-xs text-dashboard-text-muted w-8">{order.progress_percentage || 0}%</span>
                          </div>
                          <span className="text-xs text-dashboard-text-muted">{order.completed_cities}/{order.total_cities} cities</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {order.status === "completed" && <button onClick={() => handleDownloadResults(order.id)} disabled={downloadingOrderId === order.id} className="px-3 py-1.5 bg-dashboard-accent text-white text-xs rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50">{downloadingOrderId === order.id ? "Downloading..." : "Download CSV"}</button>}
                        {deleteConfirmOrderId === order.id ? (
                          <button onClick={() => handleDeleteOrder(order.id)} className="text-red-400 hover:text-red-300 transition-colors text-xs">Confirm Delete</button>
                        ) : (
                          <button onClick={() => handleDeleteOrder(order.id)} className="text-dashboard-text-muted hover:text-red-400 transition-colors text-xs">Delete</button>
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
            { q: "What is the Google Maps Scraper?", a: "The Google Maps Scraper uses Apify to extract business data from Google Maps. You can search for businesses by type and location to build targeted lead lists with websites, phone numbers, and more." },
            { q: "What's the difference between Single City and Full State?", a: "Single City mode scrapes one city (~$0.80). Full State mode (admin only) scrapes ALL cities in selected states concurrently, which is faster but more expensive." },
            { q: "What data is extracted?", a: "Each result includes: business name, website URL, phone number, full address, city, state, postal code, rating, review count, and category." },
            { q: "Why only businesses with websites?", a: "We filter for businesses WITH websites because that's the most valuable data for outreach. This also reduces costs since we're not paying for businesses we can't contact." },
            { q: "How long does scraping take?", a: "Single city: typically 2-5 minutes. Full state: depends on the number of cities, but we run up to 100 cities concurrently for maximum speed." },
          ].map((faq, idx) => (
            <div key={idx} className="border-b border-dashboard-border last:border-0">
              <button onClick={() => setOpenFaq(openFaq === idx ? null : idx)} className="w-full flex items-center justify-between py-3 text-left">
                <span className="text-sm font-medium text-dashboard-text">{faq.q}</span>
                <svg className={`w-5 h-5 text-dashboard-text-muted transition-transform ${openFaq === idx ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {openFaq === idx && <p className="pb-3 text-sm text-dashboard-text-muted">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
