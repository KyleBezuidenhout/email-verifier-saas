"use client";

import { useEffect, useState, useMemo } from "react";
import { Job } from "@/types";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";

type DateRange = "7d" | "30d" | "90d" | "all" | "custom";

export default function DashboardPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const jobList = await apiClient.getJobs();
      setJobs(jobList.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs by date range
  const filteredJobs = useMemo(() => {
    if (dateRange === "all") return jobs;
    
    const now = new Date();
    let startDate: Date;
    
    if (dateRange === "custom") {
      if (!customStartDate || !customEndDate) return jobs;
      startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      return jobs.filter(job => {
        const jobDate = new Date(job.created_at);
        return jobDate >= startDate && jobDate <= endDate;
      });
    } else {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    
    return jobs.filter(job => new Date(job.created_at) >= startDate);
  }, [jobs, dateRange, customStartDate, customEndDate]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalVerified = filteredJobs.reduce(
      (sum, job) => sum + (job.valid_emails_found || 0) + (job.catchall_emails_found || 0),
      0
    );
    
    const totalCost = filteredJobs.reduce((sum, job) => sum + (job.cost_in_credits || 0) * 0.1, 0);
    const competitorCost = totalVerified * 0.50; // Competitors charge $0.50 per email
    const moneySaved = competitorCost - totalCost;
    
    const creditsUsed = filteredJobs.reduce((sum, job) => sum + (job.cost_in_credits || 0), 0);
    const creditsLeft = (user?.credits || 0) - creditsUsed;
    
    return {
      totalVerified,
      totalCost,
      moneySaved,
      creditsUsed,
      creditsLeft: Math.max(0, creditsLeft),
    };
  }, [filteredJobs, user?.credits]);

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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="dashbrd-card-hover p-6">
          <p className="text-sm text-apple-text-muted mb-2">Money Saved vs Competitors</p>
          <p className="text-3xl font-bold text-apple-accent">
            ${stats.moneySaved.toFixed(2)}
          </p>
          <p className="text-xs text-apple-text-muted mt-1">
            Competitors would charge ${(stats.totalVerified * 0.50).toFixed(2)}
          </p>
        </div>

        <div className="dashbrd-card-hover p-6">
          <p className="text-sm text-apple-text-muted mb-2">Total Valid Emails Found</p>
          <p className="text-3xl font-bold text-apple-accent">
            {stats.totalVerified.toLocaleString()}
          </p>
          <p className="text-xs text-apple-text-muted mt-1">
            {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""} processed
          </p>
        </div>

        <div className="dashbrd-card-hover p-6">
          <p className="text-sm text-apple-text-muted mb-2">Credit Usage</p>
          <p className="text-3xl font-bold text-apple-accent">
            {stats.creditsUsed.toLocaleString()}
          </p>
          <p className="text-xs text-apple-text-muted mt-1">
            ${stats.totalCost.toFixed(2)} spent
          </p>
        </div>

        <div className="dashbrd-card-hover p-6">
          <p className="text-sm text-apple-text-muted mb-2">Credits Left</p>
          <p className="text-3xl font-bold text-apple-accent">
            {stats.creditsLeft.toLocaleString()}
          </p>
          <p className="text-xs text-apple-text-muted mt-1">
            Available credits
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Activity Chart Placeholder */}
        <div className="dashbrd-card p-6">
          <h3 className="text-lg font-medium text-apple-text mb-4">Activity Over Time</h3>
          <div className="h-64 flex items-center justify-center text-apple-text-muted">
            <p>Chart visualization coming soon</p>
          </div>
        </div>

        {/* Verification Status Chart Placeholder */}
        <div className="dashbrd-card p-6">
          <h3 className="text-lg font-medium text-apple-text mb-4">Verification Status</h3>
          <div className="h-64 flex items-center justify-center text-apple-text-muted">
            <p>Chart visualization coming soon</p>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="dashbrd-card p-6">
        <h3 className="text-lg font-medium text-apple-text mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {filteredJobs.slice(0, 10).map((job) => (
            <div key={job.id} className="flex items-center justify-between py-2 border-b border-apple-border last:border-0">
              <div>
                <p className="text-sm text-apple-text">
                  Job {job.id.slice(0, 8)}... - {job.valid_emails_found + job.catchall_emails_found} emails verified
                </p>
                <p className="text-xs text-apple-text-muted mt-1">
                  {new Date(job.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                job.status === "completed" ? "badge-success" :
                job.status === "processing" ? "badge-warning" :
                "badge-info"
              }`}>
                {job.status}
              </span>
            </div>
          ))}
          {filteredJobs.length === 0 && (
            <p className="text-apple-text-muted text-center py-8">No activity in selected date range</p>
          )}
        </div>
      </div>
    </div>
  );
}
