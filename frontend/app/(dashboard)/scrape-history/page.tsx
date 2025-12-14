"use client";

import { useEffect, useState, useMemo } from "react";
import { VayneOrder } from "@/types";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

type DateRange = "7d" | "30d" | "90d" | "all" | "custom";

export default function ScrapeHistoryPage() {
  const [orders, setOrders] = useState<VayneOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
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

      setOrders(allOrders.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scrape history");
    } finally {
      setLoading(false);
    }
  };

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    if (dateRange === "all") return orders;
    
    const now = new Date();
    let startDate: Date;
    
    if (dateRange === "custom") {
      if (!customStartDate || !customEndDate) return orders;
      startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      return orders.filter(order => {
        const orderDate = new Date(order.created_at);
        return orderDate >= startDate && orderDate <= endDate;
      });
    } else {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    
    return orders.filter(order => new Date(order.created_at) >= startDate);
  }, [orders, dateRange, customStartDate, customEndDate]);


  const handleDeleteOrder = async (orderId: string) => {
    if (deleteConfirmOrderId === orderId) {
      // Confirm delete
      try {
        await apiClient.deleteVayneOrder(orderId);
        await loadOrders();
        setDeleteConfirmOrderId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete order");
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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 text-green-400 border border-green-500/30";
      case "processing":
        return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
      case "failed":
        return "bg-red-500/20 text-red-400 border border-red-500/30";
      case "pending":
        return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text">Scrape History</h1>
        <p className="mt-2 text-apple-text-muted">
          View and download all your Sales Navigator scraping results
        </p>
      </div>

      {/* Date Filter */}
      <div className="mb-6 dashbrd-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-apple-text-muted">Filter by date:</label>
          <div className="flex gap-2">
            {(["7d", "30d", "90d", "all"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  dateRange === range
                    ? "bg-apple-accent text-white font-medium"
                    : "bg-dashbrd-card border border-apple-border text-apple-text-muted hover:bg-dashbrd-card-hover hover:text-apple-text"
                }`}
              >
                {range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : "All time"}
              </button>
            ))}
            <button
              onClick={() => setDateRange("custom")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === "custom"
                  ? "bg-apple-accent text-white font-medium"
                  : "bg-dashbrd-card border border-apple-border text-apple-text-muted hover:bg-dashbrd-card-hover hover:text-apple-text"
              }`}
            >
              Custom
            </button>
          </div>
          {dateRange === "custom" && (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="apple-input text-sm"
              />
              <span className="text-apple-text-muted">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="apple-input text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 badge-error px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Orders Table */}
      <div className="dashbrd-card overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-apple-text-muted">No scrape history found for the selected date range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-apple-border">
              <thead className="bg-apple-surface">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Job Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Leads Found
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-apple-bg divide-y divide-apple-border">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-apple-surface-hover">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                      {order.targeting || "Untitled Scrape"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                      {order.leads_found?.toLocaleString() || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                      {order.completed_at ? formatDate(order.completed_at) : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
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

      {/* Summary */}
      {filteredOrders.length > 0 && (
        <div className="mt-6 dashbrd-card p-4">
          <p className="text-sm text-apple-text-muted">
            Showing <strong className="text-apple-text">{filteredOrders.length}</strong> of{" "}
            <strong className="text-apple-text">{orders.length}</strong> total scrapes
          </p>
        </div>
      )}
    </div>
  );
}

