"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "@/lib/api";
import { GoogleMapsScraperOrder, GoogleMapsScraperHealthStatus, GoogleMapsScraperPreviewResponse } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  // Calculate dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 250; // Approximate height of dropdown
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      
      setDropdownPosition({
        top: openUpward ? rect.top + window.scrollY - dropdownHeight : rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        openUpward,
      });
    }
  }, []);

  // Handle opening dropdown
  const handleOpen = () => {
    if (!disabled && !loading) {
      updateDropdownPosition();
      setIsOpen(true);
      setSearch("");
    }
  };

  // Handle option selection
  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch("");
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearch("");
    } else if (e.key === "Enter" && filteredOptions.length === 1) {
      handleSelect(filteredOptions[0]);
    }
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updateDropdownPosition, true);
      window.removeEventListener("resize", updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={handleOpen}
        className={`w-full rounded-lg border border-dashboard-border bg-dashboard-card text-dashboard-text px-4 py-3 cursor-pointer flex items-center justify-between ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span className={value ? "text-dashboard-text" : "text-dashboard-text-muted"}>
          {loading ? "Loading..." : value || placeholder}
        </span>
        <svg className="w-5 h-5 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-dashboard-card border border-dashboard-border rounded-lg shadow-2xl z-[9999]"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            maxHeight: "250px",
            display: "flex",
            flexDirection: "column",
          }}
          onKeyDown={handleKeyDown}
        >
          <div className="p-2 border-b border-dashboard-border">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 bg-dashboard-bg border border-dashboard-border rounded text-sm text-dashboard-text placeholder-dashboard-text-muted focus:outline-none focus:border-dashboard-accent"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-dashboard-text-muted">No matches found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`px-4 py-2 cursor-pointer text-sm hover:bg-dashboard-border ${option === value ? "bg-dashboard-accent/20 text-dashboard-accent" : "text-dashboard-text"}`}
                >
                  {option}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function LocalLeadScraperPage() {
  const [mounted, setMounted] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<GoogleMapsScraperHealthStatus | null>(null);
  const [orders, setOrders] = useState<GoogleMapsScraperOrder[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  
  // Form state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>("single_city");
  const [maxCities, setMaxCities] = useState(5);
  const [maxLeadsPerCity, setMaxLeadsPerCity] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  
  // Cities data
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  
  // UI state
  const [error, setError] = useState<string | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<GoogleMapsScraperPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setInitialLoading(true);
      const [health, ordersData, states] = await Promise.all([
        apiClient.getGoogleMapsScraperHealth(),
        apiClient.getGoogleMapsScraperOrders(),
        apiClient.getUsCities().then(citiesData => {
          const statesList = Object.keys(citiesData).sort();
          setAvailableStates(statesList);
          return statesList;
        }),
      ]);
      
      setHealthStatus(health);
      setOrders(ordersData.orders);
      setTotalCost(ordersData.total_cost);
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
      setErrorModalOpen(true);
    } finally {
      setInitialLoading(false);
    }
  };

  // Load cities when state changes
  useEffect(() => {
    if (selectedState) {
      setCitiesLoading(true);
      apiClient.getUsCities()
        .then(citiesData => {
          const cities = citiesData[selectedState] || [];
          setAvailableCities(cities.sort());
          setSelectedCity(""); // Reset city when state changes
        })
        .catch(err => {
          console.error("Failed to load cities:", err);
          setAvailableCities([]);
        })
        .finally(() => {
          setCitiesLoading(false);
        });
    } else {
      setAvailableCities([]);
      setSelectedCity("");
    }
  }, [selectedState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchTerm.trim()) {
      setError("Please enter a search term");
      setErrorModalOpen(true);
      return;
    }

    if (scrapeMode === "single_city" && (!selectedState || !selectedCity)) {
      setError("Please select both a state and city");
      setErrorModalOpen(true);
      return;
    }

    if (scrapeMode === "full_state" && !selectedState) {
      setError("Please select a state");
      setErrorModalOpen(true);
      return;
    }

    try {
      setSubmitting(true);
      
      const request = {
        search_term: searchTerm.trim(),
        state: selectedState,
        city: scrapeMode === "single_city" ? selectedCity : null,
        mode: scrapeMode,
        max_cities: scrapeMode === "full_state" ? maxCities : null,
        max_leads_per_city: maxLeadsPerCity,
      };

      await apiClient.createGoogleMapsScraperOrder(request);
      
      // Reset form
      setSearchTerm("");
      setSelectedState("");
      setSelectedCity("");
      setScrapeMode("single_city");
      setMaxCities(5);
      setMaxLeadsPerCity(100);
      
      // Switch to history tab and refresh
      setActiveTab("history");
      await loadData();
    } catch (err) {
      console.error("Failed to submit order:", err);
      setError(err instanceof Error ? err.message : "Failed to create scraping order");
      setErrorModalOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadResults = async (orderId: string) => {
    try {
      setDownloadingOrderId(orderId);
      await apiClient.downloadGoogleMapsScraperResults(orderId);
    } catch (err) {
      console.error("Failed to download results:", err);
      setError(err instanceof Error ? err.message : "Failed to download results");
      setErrorModalOpen(true);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const handlePreviewResults = async (orderId: string) => {
    try {
      setPreviewLoading(true);
      setPreviewOrderId(orderId);
      setShowPreviewModal(true);
      const data = await apiClient.previewGoogleMapsScraperResults(orderId);
      setPreviewData(data);
    } catch (err) {
      console.error("Failed to preview results:", err);
      setError(err instanceof Error ? err.message : "Failed to preview results");
      setErrorModalOpen(true);
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
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
              healthStatus?.apify_api === "connected" ? "text-[#22c55e]" : "text-red-400"
            }`}>
              {healthStatus?.apify_api === "connected" ? "API Connected" : "API Disconnected"}
            </p>
            <p className="text-xs text-dashboard-text-muted">
              {healthStatus?.apify_api === "connected" 
                ? `Apify API is operational. Credits remaining: ${healthStatus?.credits_remaining || 'Unknown'}`
                : healthStatus?.error || "Unable to connect to Apify API"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Total Cost Summary */}
      <div className="mb-6 glass-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-dashboard-text-muted">Total Spent</p>
            <p className="text-2xl font-bold text-dashboard-text">{formatCost(totalCost)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-dashboard-text-muted">Active Orders</p>
            <p className="text-2xl font-bold text-dashboard-accent">
              {orders.filter(o => o.status === "running" || o.status === "pending").length}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-dashboard-border">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("submit")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "submit"
                ? "text-dashboard-accent border-b-2 border-dashboard-accent"
                : "text-dashboard-text-muted hover:text-dashboard-text"
            }`}
          >
            Submit New Scrape
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "text-dashboard-accent border-b-2 border-dashboard-accent"
                : "text-dashboard-text-muted hover:text-dashboard-text"
            }`}
          >
            History ({orders.length})
          </button>
        </div>
      </div>

      {/* Submit Form */}
      {activeTab === "submit" && (
        <div className="glass-card p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Search Term */}
            <div>
              <label className="block text-sm font-medium text-dashboard-text mb-2">
                Search Term *
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="e.g., Plumbers, Restaurants, Law Firms"
                className="input-field w-full"
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-dashboard-text-muted">
                What type of businesses are you looking for?
              </p>
            </div>

            {/* Scrape Mode */}
            <div>
              <label className="block text-sm font-medium text-dashboard-text mb-2">
                Scrape Mode
              </label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setScrapeMode("single_city")}
                  className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                    scrapeMode === "single_city"
                      ? "border-dashboard-accent bg-dashboard-accent/10 text-dashboard-accent"
                      : "border-dashboard-border text-dashboard-text-muted hover:border-dashboard-text"
                  }`}
                >
                  Single City
                </button>
                <button
                  type="button"
                  onClick={() => setScrapeMode("full_state")}
                  className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                    scrapeMode === "full_state"
                      ? "border-dashboard-accent bg-dashboard-accent/10 text-dashboard-accent"
                      : "border-dashboard-border text-dashboard-text-muted hover:border-dashboard-text"
                  }`}
                >
                  Full State (Multiple Cities)
                </button>
              </div>
            </div>

            {/* State Selection */}
            <div>
              <label className="block text-sm font-medium text-dashboard-text mb-2">
                State *
              </label>
              <div className="relative">
                {mounted ? (
                  <SearchableSelect
                    options={availableStates}
                    value={selectedState}
                    onChange={setSelectedState}
                    placeholder="Select a state"
                    disabled={submitting}
                    loading={availableStates.length === 0}
                  />
                ) : (
                  <div className="w-full rounded-lg border border-dashboard-border bg-dashboard-card text-dashboard-text px-4 py-3">
                    Loading states...
                  </div>
                )}
              </div>
            </div>

            {/* City Selection (only for single city mode) */}
            {scrapeMode === "single_city" && (
              <div>
                <label className="block text-sm font-medium text-dashboard-text mb-2">
                  City *
                </label>
                <div className="relative">
                  {mounted ? (
                    <SearchableSelect
                      options={availableCities}
                      value={selectedCity}
                      onChange={setSelectedCity}
                      placeholder={selectedState ? "Select a city" : "Select a state first"}
                      disabled={submitting || !selectedState || citiesLoading}
                      loading={citiesLoading}
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-dashboard-border bg-dashboard-card text-dashboard-text px-4 py-3">
                      Loading cities...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Max Cities (only for full state mode) */}
            {scrapeMode === "full_state" && (
              <div>
                <label className="block text-sm font-medium text-dashboard-text mb-2">
                  Maximum Cities to Scrape
                </label>
                <input
                  type="number"
                  value={maxCities}
                  onChange={(e) => setMaxCities(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={50}
                  className="input-field w-full"
                  disabled={submitting}
                />
                <p className="mt-1 text-xs text-dashboard-text-muted">
                  Limit to top N cities by population (1-50)
                </p>
              </div>
            )}

            {/* Max Leads Per City */}
            <div>
              <label className="block text-sm font-medium text-dashboard-text mb-2">
                Maximum Leads Per City
              </label>
              <input
                type="number"
                value={maxLeadsPerCity}
                onChange={(e) => setMaxLeadsPerCity(Math.max(10, Math.min(1000, parseInt(e.target.value) || 100)))}
                min={10}
                max={1000}
                step={10}
                className="input-field w-full"
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-dashboard-text-muted">
                Maximum businesses to extract per city (10-1000)
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={submitting || healthStatus?.apify_api !== "connected"}
                className="btn-primary flex-1"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  "Start Scraping"
                )}
              </button>
            </div>

            {healthStatus?.apify_api !== "connected" && (
              <p className="text-sm text-red-400 text-center">
                Cannot submit orders while API is disconnected
              </p>
            )}
          </form>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-dashboard-text-muted">No scraping orders yet</p>
              <button
                onClick={() => setActiveTab("submit")}
                className="mt-4 text-dashboard-accent hover:underline"
              >
                Submit your first scrape
              </button>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="glass-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-dashboard-text">
                        {order.search_term}
                      </h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        order.status === "completed" ? "bg-green-500/20 text-[#22c55e]" :
                        order.status === "running" ? "bg-blue-500/20 text-blue-400" :
                        order.status === "failed" ? "bg-red-500/20 text-red-400" :
                        "bg-yellow-500/20 text-yellow-400"
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm text-dashboard-text-muted mb-1">
                      {order.city ? `${order.city}, ${order.state}` : order.state} • {order.total_leads?.toLocaleString() || 0} leads
                    </p>
                    <p className="text-xs text-dashboard-text-muted">
                      Created: {formatDate(order.created_at)} • Cost: {formatCost(order.estimated_cost)}
                    </p>
                    {order.error_message && (
                      <p className="text-xs text-red-400 mt-2">
                        Error: {order.error_message}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    {order.status === "completed" && (
                      <>
                        <button
                          onClick={() => handlePreviewResults(order.id)}
                          disabled={previewLoading && previewOrderId === order.id}
                          className="px-3 py-1.5 text-sm bg-dashboard-card border border-dashboard-border rounded hover:bg-dashboard-border transition-colors text-dashboard-text"
                        >
                          {previewLoading && previewOrderId === order.id ? "Loading..." : "Preview"}
                        </button>
                        <button
                          onClick={() => handleDownloadResults(order.id)}
                          disabled={downloadingOrderId === order.id}
                          className="px-3 py-1.5 text-sm bg-dashboard-accent text-white rounded hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50"
                        >
                          {downloadingOrderId === order.id ? "Downloading..." : "Download CSV"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-card w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-dashboard-border">
              <h3 className="text-lg font-semibold text-dashboard-text">Results Preview</h3>
              <button
                onClick={() => { setShowPreviewModal(false); setPreviewData(null); setPreviewOrderId(null); }}
                className="text-dashboard-text-muted hover:text-dashboard-text"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="lg" />
                </div>
              ) : previewData ? (
                <div className="overflow-x-auto">
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
                          {previewData.columns.map((col) => {
                            const cellValue = row[col] || '-';
                            let textClass = 'text-dashboard-text';
                            if (col === 'website') {
                              textClass = cellValue !== '-' ? 'text-blue-400' : 'text-dashboard-text-muted';
                            } else if (col === 'phone') {
                              textClass = cellValue !== '-' ? 'text-[#22c55e]' : 'text-dashboard-text-muted';
                            }
                            return (
                              <td key={col} className={`px-4 py-2 text-sm whitespace-nowrap max-w-[200px] truncate ${textClass}`} title={cellValue}>
                                {cellValue}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12"><p className="text-dashboard-text-muted">No results available</p></div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-dashboard-border">
              <button onClick={() => { setShowPreviewModal(false); setPreviewData(null); setPreviewOrderId(null); }} className="px-4 py-2 bg-dashboard-card text-dashboard-text rounded-lg hover:bg-dashboard-border transition-colors">Close</button>
              {previewOrderId && <button onClick={() => handleDownloadResults(previewOrderId)} disabled={downloadingOrderId === previewOrderId} className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50">{downloadingOrderId === previewOrderId ? "Downloading..." : "Download Full CSV"}</button>}
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        title="Error"
        message={error || "An error occurred"}
      />
    </div>
  );
}
