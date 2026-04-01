"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Job, VayneOrder } from "@/types";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";

type DateRange = "7d" | "30d" | "90d" | "all" | "custom";

const POLLING_INTERVAL = 60000; // 60 seconds

export default function DashboardPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [vayneOrders, setVayneOrders] = useState<VayneOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [jobList, vayneResponse] = await Promise.all([
        apiClient.getJobs(),
        apiClient.getVayneOrderHistory(100, 0).catch(() => ({ orders: [] as VayneOrder[], total: 0 })),
      ]);
      setJobs(jobList.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      setVayneOrders(vayneResponse.orders.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // Date range filter helper
  const filterByDateRange = useCallback(<T extends { created_at: string }>(items: T[]): T[] => {
    if (dateRange === "all") return items;
    const now = new Date();
    if (dateRange === "custom") {
      if (!customStartDate || !customEndDate) return items;
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      return items.filter(item => {
        const d = new Date(item.created_at);
        return d >= start && d <= end;
      });
    }
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return items.filter(item => new Date(item.created_at) >= start);
  }, [dateRange, customStartDate, customEndDate]);

  const filteredJobs = useMemo(() => filterByDateRange(jobs), [jobs, filterByDateRange]);
  const filteredVayneOrders = useMemo(() => filterByDateRange(vayneOrders), [vayneOrders, filterByDateRange]);

  // Unified activity timeline
  type ActivityItem = {
    id: string;
    type: "job" | "scrape";
    name: string;
    status: string;
    detail: string;
    created_at: string;
  };

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const jobItems: ActivityItem[] = filteredJobs.map(job => ({
      id: job.id,
      type: "job",
      name: `Job ${job.id.slice(0, 8)}...`,
      status: job.status,
      detail: `${(job.valid_emails_found || 0) + (job.catchall_emails_found || 0)} emails verified`,
      created_at: job.created_at,
    }));
    const vayneItems: ActivityItem[] = filteredVayneOrders.map(order => ({
      id: order.id,
      type: "scrape",
      name: order.targeting || `Scrape ${order.id.slice(0, 8)}...`,
      status: order.status,
      detail: order.leads_found ? `${order.leads_found.toLocaleString()} leads scraped` : "In progress",
      created_at: order.created_at,
    }));
    return [...jobItems, ...vayneItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);
  }, [filteredJobs, filteredVayneOrders]);

  // Calculate stats including Vayne orders
  const stats = useMemo(() => {
    const totalVerified = filteredJobs.reduce(
      (sum, job) => sum + (job.valid_emails_found || 0) + (job.catchall_emails_found || 0),
      0
    );

    const totalLeadsScraped = filteredVayneOrders.reduce(
      (sum, order) => sum + (order.leads_found || 0),
      0
    );

    const jobCreditsUsed = filteredJobs.reduce((sum, job) => sum + (job.cost_in_credits || 0), 0);
    const scrapeCreditsUsed = filteredVayneOrders.reduce((sum, order) => sum + (order.credits_charged || 0), 0);
    const creditsUsed = jobCreditsUsed + scrapeCreditsUsed;

    const totalCost = creditsUsed * 0.1;
    const competitorCost = (totalVerified * 0.50) + (totalLeadsScraped * 0.15);
    const moneySaved = competitorCost - totalCost;

    return {
      totalVerified,
      totalLeadsScraped,
      totalCost,
      moneySaved,
      creditsUsed,
      creditsLeft: user?.credits || 0,
      jobCount: filteredJobs.length,
      scrapeCount: filteredVayneOrders.length,
    };
  }, [filteredJobs, filteredVayneOrders, user?.credits]);

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
      {/* Date Filter */}
      <div className="mb-6 glass-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-dashboard-text-muted">Filter by date:</label>
          <div className="flex gap-2">
            {(["7d", "30d", "90d", "all"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  dateRange === range
                    ? "bg-dashboard-accent text-white font-medium"
                    : "glass-card text-dashboard-text-muted hover:bg-dashboard-surface/60 hover:text-dashboard-text"
                }`}
              >
                {range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : "All time"}
              </button>
            ))}
            <button
              onClick={() => setDateRange("custom")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === "custom"
                  ? "bg-dashboard-accent text-white font-medium"
                  : "glass-card text-dashboard-text-muted hover:bg-dashboard-surface/60 hover:text-dashboard-text"
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
              <span className="text-dashboard-text-muted">to</span>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-card hover:bg-dashboard-surface/40 p-6 transition-all">
          <p className="text-sm text-dashboard-text-muted mb-2">Money Saved vs Competitors</p>
          <p className="text-3xl font-bold text-dashboard-accent">
            ${stats.moneySaved.toFixed(2)}
          </p>
          <p className="text-xs text-dashboard-text-muted mt-1">
            Based on competitor pricing
          </p>
        </div>

        <div className="glass-card hover:bg-dashboard-surface/40 p-6 transition-all">
          <p className="text-sm text-dashboard-text-muted mb-2">Emails Verified</p>
          <p className="text-3xl font-bold text-dashboard-accent">
            {stats.totalVerified.toLocaleString()}
          </p>
          <p className="text-xs text-dashboard-text-muted mt-1">
            {stats.jobCount} verification job{stats.jobCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="glass-card hover:bg-dashboard-surface/40 p-6 transition-all">
          <p className="text-sm text-dashboard-text-muted mb-2">Leads Scraped</p>
          <p className="text-3xl font-bold text-dashboard-accent">
            {stats.totalLeadsScraped.toLocaleString()}
          </p>
          <p className="text-xs text-dashboard-text-muted mt-1">
            {stats.scrapeCount} scraping job{stats.scrapeCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="glass-card hover:bg-dashboard-surface/40 p-6 transition-all">
          <p className="text-sm text-dashboard-text-muted mb-2">Credit Usage</p>
          <p className="text-3xl font-bold text-dashboard-accent">
            {stats.creditsUsed.toLocaleString()}
          </p>
          <p className="text-xs text-dashboard-text-muted mt-1">
            {stats.creditsLeft.toLocaleString()} credits remaining
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Activity Chart Placeholder */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-dashboard-text mb-4">Activity Over Time</h3>
          <div className="h-64 flex items-center justify-center text-dashboard-text-muted">
            <p>Chart visualization coming soon</p>
          </div>
        </div>

        {/* Verification Status Chart Placeholder */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-dashboard-text mb-4">Verification Status</h3>
          <div className="h-64 flex items-center justify-center text-dashboard-text-muted">
            <p>Chart visualization coming soon</p>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-medium text-dashboard-text mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex items-center justify-between py-2 border-b border-dashboard-border last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  item.type === "scrape" ? "bg-purple-400" : "bg-blue-400"
                }`} />
                <div>
                  <p className="text-sm text-dashboard-text">
                    {item.name} — {item.detail}
                  </p>
                  <p className="text-xs text-dashboard-text-muted mt-1">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium ${
                  item.type === "scrape" ? "text-purple-400" : "text-blue-400"
                }`}>
                  {item.type === "scrape" ? "Scrape" : "Verify"}
                </span>
                <span className={`text-xs font-medium ${
                  item.status === "completed" ? "text-[#22c55e]" :
                  item.status === "processing" || item.status === "initialization" || item.status === "scraping" || item.status === "segmenting" ? "text-yellow-400" :
                  item.status === "failed" ? "text-red-400" :
                  "text-dashboard-text-muted"
                }`}>
                  {item.status === "initialization" || item.status === "scraping" || item.status === "segmenting" ? "processing" : item.status === "waiting" ? "queued" : item.status}
                </span>
              </div>
            </div>
          ))}
          {recentActivity.length === 0 && (
            <p className="text-dashboard-text-muted text-center py-8">No activity in selected date range</p>
          )}
        </div>
      </div>
    </div>
  );
}
