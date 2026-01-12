"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { LocalScraperOrder, LocalScraperConfig, LocalScraperHealthStatus } from "@/types";
import { ErrorModal } from "@/components/common/ErrorModal";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

// Default configuration for Google Maps scraper
const DEFAULT_CONFIG: LocalScraperConfig = {
  business_types: [],
  search_method: "city",
  cities: [],
  search_links: [],
  extraction_method: "detailed",
  max_results: null,
  enable_reviews_extraction: false,
  max_reviews: 20,
  enable_photos_extraction: false,
  max_photos: 100,
  lang: null,
  randomize_cities: true,
  include_places_outside_city: true,
  geo_shape: "polygons",
  point_coordinates: "",
  polygons: null,
  geo_zoom_level: "16",
  exclude_outside_shape: true,
  reviews_sort: "newest",
  reviews_query: "",
  api_key: "",
};

export default function LocalLeadScraperPage() {
  // Health check state
  const [healthStatus, setHealthStatus] = useState<LocalScraperHealthStatus | null>(null);
  
  // Form state
  const [jobName, setJobName] = useState("");
  const [config, setConfig] = useState<LocalScraperConfig>(DEFAULT_CONFIG);
  
  // Input fields for adding items
  const [businessTypeInput, setBusinessTypeInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [searchLinkInput, setSearchLinkInput] = useState("");
  
  // Order state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orders, setOrders] = useState<LocalScraperOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  
  // UI state
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Check Botasaurus API health
  const checkHealth = useCallback(async () => {
    try {
      const status = await apiClient.getLocalScraperHealth();
      setHealthStatus(status);
    } catch (err) {
      setHealthStatus({ botasaurus_api: "disconnected", message: "Could not check API status" });
    }
  }, []);

  // Load orders
  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const response = await apiClient.getLocalScraperOrders(100, 0);
      // Filter out deleted orders and sort by date
      const visibleOrders = response.orders
        .filter((order) => order.status !== "deleted")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrders(visibleOrders);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setInitialLoading(true);
        await Promise.all([checkHealth(), loadOrders()]);
      } catch (err) {
        console.error("Error loading initial data:", err);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [checkHealth, loadOrders]);

  // Poll for order status updates
  useEffect(() => {
    const POLL_INTERVAL = 30000; // 30 seconds

    const pollOrderStatuses = async () => {
      const activeOrders = orders.filter(
        (order) => order.status === "pending" || order.status === "processing"
      );

      if (activeOrders.length === 0) return;

      const updates = await Promise.allSettled(
        activeOrders.map(async (order) => {
          const result = await apiClient.pollLocalScraperOrderStatus(order.id);
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
              status: result.status as LocalScraperOrder["status"],
              progress_percentage: result.progress_percentage,
              results_count: result.results_count,
            };
          }
          return order;
        })
      );
    };

    const intervalId = setInterval(pollOrderStatuses, POLL_INTERVAL);
    // Initial poll after 5 seconds
    const timeoutId = setTimeout(pollOrderStatuses, 5000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [orders]);

  // Add business type
  const handleAddBusinessType = () => {
    if (businessTypeInput.trim() && !config.business_types.includes(businessTypeInput.trim())) {
      setConfig((prev) => ({
        ...prev,
        business_types: [...prev.business_types, businessTypeInput.trim()],
      }));
      setBusinessTypeInput("");
    }
  };

  // Add city
  const handleAddCity = () => {
    if (cityInput.trim() && !config.cities.includes(cityInput.trim())) {
      setConfig((prev) => ({
        ...prev,
        cities: [...prev.cities, cityInput.trim()],
      }));
      setCityInput("");
    }
  };

  // Add search link
  const handleAddSearchLink = () => {
    if (searchLinkInput.trim() && !config.search_links.includes(searchLinkInput.trim())) {
      setConfig((prev) => ({
        ...prev,
        search_links: [...prev.search_links, searchLinkInput.trim()],
      }));
      setSearchLinkInput("");
    }
  };

  // Remove item from array
  const handleRemoveItem = (field: "business_types" | "cities" | "search_links", index: number) => {
    setConfig((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  // Start scraping
  const handleStartScraping = async () => {
    // Validation
    if (!jobName.trim()) {
      setError("Please enter a job name");
      setShowErrorModal(true);
      return;
    }

    if (config.business_types.length === 0) {
      setError("Please add at least one business type");
      setShowErrorModal(true);
      return;
    }

    if (config.search_method === "city" && config.cities.length === 0) {
      setError("Please add at least one city");
      setShowErrorModal(true);
      return;
    }

    if (config.search_method === "search_link" && config.search_links.length === 0) {
      setError("Please add at least one search link");
      setShowErrorModal(true);
      return;
    }

    setCreatingOrder(true);
    try {
      const newOrder = await apiClient.createLocalScraperOrder({
        job_name: jobName.trim(),
        config,
      });

      // Add to orders list
      setOrders((prev) => [newOrder, ...prev]);

      // Clear form
      setJobName("");
      setConfig(DEFAULT_CONFIG);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "Failed to start scraping");
      setShowErrorModal(true);
    } finally {
      setCreatingOrder(false);
    }
  };

  // Clear form
  const handleClearForm = () => {
    setJobName("");
    setConfig(DEFAULT_CONFIG);
    setBusinessTypeInput("");
    setCityInput("");
    setSearchLinkInput("");
  };

  // Delete order
  const handleDeleteOrder = async (orderId: string) => {
    if (deleteConfirmOrderId === orderId) {
      try {
        await apiClient.deleteLocalScraperOrder(orderId);
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
      await apiClient.downloadLocalScraperOrderResults(orderId, "csv");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download results");
      setShowErrorModal(true);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  // Format date
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

  // Loading state
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
        <h1 className="text-3xl font-bold text-dashboard-text">Local Lead Scraper</h1>
        <p className="mt-2 text-dashboard-text-muted">
          Extract business data from Google Maps using Botasaurus
        </p>
      </div>

      {/* API Health Status */}
      <div className={`mb-6 glass-card p-4 ${
        healthStatus?.botasaurus_api === "connected" 
          ? "bg-green-500/10 border-green-500/30" 
          : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            healthStatus?.botasaurus_api === "connected" ? "bg-green-500" : "bg-red-500"
          }`}></div>
          <div>
            <p className={`text-sm font-medium ${
              healthStatus?.botasaurus_api === "connected" ? "text-green-400" : "text-red-400"
            }`}>
              {healthStatus?.botasaurus_api === "connected" 
                ? "Botasaurus API Connected" 
                : "Botasaurus API Disconnected"}
            </p>
            <p className="text-xs text-dashboard-text-muted">{healthStatus?.message}</p>
          </div>
          <button
            onClick={checkHealth}
            className="ml-auto px-3 py-1 text-xs bg-dashboard-card hover:bg-dashboard-border rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <ErrorModal
        isOpen={showErrorModal}
        message={error}
        onClose={() => setShowErrorModal(false)}
      />

      {/* Job Name Input */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">
          Job Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          placeholder="Enter a name for this scraping job (e.g., 'NYC Restaurants Q1')"
          className="apple-input w-full py-3"
        />
        <p className="mt-2 text-xs text-dashboard-text-muted">
          Give your scraping job a descriptive name to easily identify it later
        </p>
      </div>

      {/* Business Types */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-2">
          Business Types <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={businessTypeInput}
            onChange={(e) => setBusinessTypeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddBusinessType())}
            placeholder="e.g., Restaurant, Coffee Shop, Dentist, Gym"
            className="apple-input flex-1 py-3"
          />
          <button
            onClick={handleAddBusinessType}
            className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.business_types.map((type, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-3 py-1 bg-dashboard-accent/20 text-dashboard-accent rounded-full text-sm"
            >
              {type}
              <button
                onClick={() => handleRemoveItem("business_types", idx)}
                className="hover:text-red-400 ml-1"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-dashboard-text-muted">
          Enter business types to search for (press Enter or click Add)
        </p>
      </div>

      {/* Search Method */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-4">
          Search Method
        </label>
        <div className="flex flex-wrap gap-4">
          {[
            { value: "city", label: "By City", description: "Search for businesses in specific cities" },
            { value: "search_link", label: "By Search Link", description: "Use Google Maps search URLs" },
          ].map((method) => (
            <label
              key={method.value}
              className={`flex-1 min-w-[200px] p-4 rounded-lg border-2 cursor-pointer transition-all ${
                config.search_method === method.value
                  ? "border-dashboard-accent bg-dashboard-accent/10"
                  : "border-dashboard-border hover:border-dashboard-accent/50"
              }`}
            >
              <input
                type="radio"
                name="search_method"
                value={method.value}
                checked={config.search_method === method.value}
                onChange={(e) => setConfig((prev) => ({ ...prev, search_method: e.target.value as "city" | "search_link" | "geo_shape" }))}
                className="sr-only"
              />
              <span className="font-medium text-dashboard-text">{method.label}</span>
              <p className="text-xs text-dashboard-text-muted mt-1">{method.description}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Cities (if city method selected) */}
      {config.search_method === "city" && (
        <div className="glass-card p-6 mb-6">
          <label className="block text-sm font-medium text-dashboard-text mb-2">
            Cities <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCity())}
              placeholder="e.g., New York, Los Angeles, Chicago"
              className="apple-input flex-1 py-3"
            />
            <button
              onClick={handleAddCity}
              className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.cities.map((city, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm"
              >
                {city}
                <button
                  onClick={() => handleRemoveItem("cities", idx)}
                  className="hover:text-red-400 ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-dashboard-text-muted">
            Enter city names to search in (press Enter or click Add)
          </p>
        </div>
      )}

      {/* Search Links (if search_link method selected) */}
      {config.search_method === "search_link" && (
        <div className="glass-card p-6 mb-6">
          <label className="block text-sm font-medium text-dashboard-text mb-2">
            Google Maps Search Links <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchLinkInput}
              onChange={(e) => setSearchLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSearchLink())}
              placeholder="https://www.google.com/maps/search/restaurants+in+new+york"
              className="apple-input flex-1 py-3"
            />
            <button
              onClick={handleAddSearchLink}
              className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors"
            >
              Add
            </button>
          </div>
          <div className="space-y-2">
            {config.search_links.map((link, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg"
              >
                <span className="flex-1 text-sm text-blue-400 truncate">{link}</span>
                <button
                  onClick={() => handleRemoveItem("search_links", idx)}
                  className="text-dashboard-text-muted hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-dashboard-text-muted">
            Paste Google Maps search URLs (press Enter or click Add)
          </p>
        </div>
      )}

      {/* Extraction Options */}
      <div className="glass-card p-6 mb-6">
        <label className="block text-sm font-medium text-dashboard-text mb-4">
          Extraction Options
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-dashboard-text-muted mb-1">Extraction Method</label>
            <select
              value={config.extraction_method}
              onChange={(e) => setConfig((prev) => ({ ...prev, extraction_method: e.target.value as "detailed" | "fast" }))}
              className="apple-input w-full py-2"
            >
              <option value="detailed">Detailed (slower, more data)</option>
              <option value="fast">Fast (quicker, basic data)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-dashboard-text-muted mb-1">Max Results (optional)</label>
            <input
              type="number"
              value={config.max_results || ""}
              onChange={(e) => setConfig((prev) => ({ 
                ...prev, 
                max_results: e.target.value ? parseInt(e.target.value) : null 
              }))}
              placeholder="No limit"
              className="apple-input w-full py-2"
            />
          </div>
        </div>
        
        {/* Reviews & Photos Options */}
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_reviews_extraction}
              onChange={(e) => setConfig((prev) => ({ ...prev, enable_reviews_extraction: e.target.checked }))}
              className="w-4 h-4 rounded text-dashboard-accent bg-dashboard-card border-dashboard-border"
            />
            <span className="text-sm text-dashboard-text">Extract Reviews</span>
            {config.enable_reviews_extraction && (
              <input
                type="number"
                value={config.max_reviews}
                onChange={(e) => setConfig((prev) => ({ ...prev, max_reviews: parseInt(e.target.value) || 20 }))}
                className="apple-input w-20 py-1 text-sm"
                placeholder="Max"
              />
            )}
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_photos_extraction}
              onChange={(e) => setConfig((prev) => ({ ...prev, enable_photos_extraction: e.target.checked }))}
              className="w-4 h-4 rounded text-dashboard-accent bg-dashboard-card border-dashboard-border"
            />
            <span className="text-sm text-dashboard-text">Extract Photos</span>
            {config.enable_photos_extraction && (
              <input
                type="number"
                value={config.max_photos}
                onChange={(e) => setConfig((prev) => ({ ...prev, max_photos: parseInt(e.target.value) || 100 }))}
                className="apple-input w-20 py-1 text-sm"
                placeholder="Max"
              />
            )}
          </label>
        </div>
      </div>

      {/* Advanced Options (Collapsible) */}
      <div className="glass-card p-6 mb-6">
        <button
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-sm font-medium text-dashboard-text">Advanced Options</span>
          <svg
            className={`w-5 h-5 text-dashboard-text-muted transition-transform ${showAdvancedOptions ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showAdvancedOptions && (
          <div className="mt-4 pt-4 border-t border-dashboard-border space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.randomize_cities}
                  onChange={(e) => setConfig((prev) => ({ ...prev, randomize_cities: e.target.checked }))}
                  className="w-4 h-4 rounded text-dashboard-accent"
                />
                <span className="text-sm text-dashboard-text">Randomize Cities</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.include_places_outside_city}
                  onChange={(e) => setConfig((prev) => ({ ...prev, include_places_outside_city: e.target.checked }))}
                  className="w-4 h-4 rounded text-dashboard-accent"
                />
                <span className="text-sm text-dashboard-text">Include Places Outside City</span>
              </label>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-dashboard-text-muted mb-1">Reviews Sort</label>
                <select
                  value={config.reviews_sort}
                  onChange={(e) => setConfig((prev) => ({ ...prev, reviews_sort: e.target.value }))}
                  className="apple-input w-full py-2"
                >
                  <option value="newest">Newest First</option>
                  <option value="most_relevant">Most Relevant</option>
                  <option value="highest_rating">Highest Rating</option>
                  <option value="lowest_rating">Lowest Rating</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs text-dashboard-text-muted mb-1">Language (optional)</label>
                <input
                  type="text"
                  value={config.lang || ""}
                  onChange={(e) => setConfig((prev) => ({ ...prev, lang: e.target.value || null }))}
                  placeholder="e.g., en, es, fr"
                  className="apple-input w-full py-2"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStartScraping}
          disabled={
            creatingOrder ||
            config.business_types.length === 0 ||
            !jobName.trim()
          }
          className="flex-1 px-6 py-3 bg-dashboard-accent text-white rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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

      {/* Orders History */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-lg font-semibold text-dashboard-text mb-4">Scraping Orders</h3>
        {loadingOrders && orders.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-dashboard-text-muted text-center py-8">
            No scraping orders yet. Start a new scrape above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: "rgba(13, 15, 18, 0.5)" }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Job Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Business Types
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Created At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody style={{ background: "rgba(13, 15, 18, 0.3)" }} className="divide-y divide-dashboard-border">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dashboard-text">
                      {order.job_name || order.id.slice(0, 8)}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-muted max-w-[200px] truncate">
                      {order.business_types || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          order.status === "completed"
                            ? "bg-green-500/20 text-green-400"
                            : order.status === "processing"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : order.status === "pending"
                            ? "bg-blue-500/20 text-blue-400"
                            : order.status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text">
                      {order.status === "completed" ? (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-green-400">{order.results_count} results</span>
                        </div>
                      ) : order.status === "failed" ? (
                        <span className="text-red-400">Failed</span>
                      ) : (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 bg-dashboard-card rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-dashboard-accent h-2 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${order.progress_percentage || 5}%` }}
                            />
                          </div>
                          <span className="text-xs text-dashboard-text-muted w-8">
                            {order.progress_percentage || 0}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {order.status === "completed" && (
                          <button
                            onClick={() => handleDownloadResults(order.id)}
                            disabled={downloadingOrderId === order.id}
                            className="px-3 py-1.5 bg-dashboard-accent text-white text-xs rounded-lg hover:bg-dashboard-accent/90 transition-colors disabled:opacity-50"
                          >
                            {downloadingOrderId === order.id ? "Downloading..." : "Download CSV"}
                          </button>
                        )}
                        {deleteConfirmOrderId === order.id ? (
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="text-red-400 hover:text-red-300 transition-colors text-xs"
                          >
                            Confirm Delete
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="text-dashboard-text-muted hover:text-red-400 transition-colors text-xs"
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
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-dashboard-text mb-4">Frequently Asked Questions</h3>
        <div className="space-y-2">
          {[
            {
              q: "What is the Local Lead Scraper?",
              a: "The Local Lead Scraper uses Botasaurus to extract business data from Google Maps. You can search for businesses by type and location to build targeted lead lists.",
            },
            {
              q: "How do I connect to Botasaurus?",
              a: "You need to have Botasaurus Desktop running on your local machine or a server. The API status indicator above will show if it's connected.",
            },
            {
              q: "What data is extracted?",
              a: "Depending on your settings, you can extract: business name, address, phone, website, ratings, reviews, photos, opening hours, and more.",
            },
            {
              q: "How long does scraping take?",
              a: "Scraping time depends on the number of results and extraction method. Detailed extraction takes longer but provides more data. Fast extraction is quicker but has less detail.",
            },
            {
              q: "Can I search multiple cities at once?",
              a: "Yes! You can add multiple cities to search. The scraper will search for your business types in all specified cities.",
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
              {openFaq === idx && <p className="pb-3 text-sm text-dashboard-text-muted">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

