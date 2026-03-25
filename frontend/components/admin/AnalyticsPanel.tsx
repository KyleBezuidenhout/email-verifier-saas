"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  AreaChart,
  Area,
} from "recharts";
import { apiClient } from "@/lib/api";
import { AnalyticsResponse } from "@/types";
import { AnalyticsDatePicker, DateRange } from "./AnalyticsDatePicker";
import { ClientSelector } from "./ClientSelector";

interface Client {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
}

interface Props {
  clients: Client[];
}

const COLORS = {
  enrichment: "#0099FF",
  verification: "#34C759",
  sales_nav: "#FF9500",
  active: "#0099FF",
  queued: "#FF9500",
  waiting_room: "#FF3B30",
  catchall_queued: "#AF52DE",
  vayne_queued: "#34C759",
  median: "#6B7280",
};

function formatSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateShort(dateStr: unknown): string {
  const s = String(dateStr ?? "");
  if (!s) return "";
  if (s.includes("T")) {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const parts = s.split("-");
  if (parts.length < 3) return s;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function getDefaultDateRange(): DateRange {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
    label: "Last 1 Week",
  };
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

const tooltipStyle = {
  contentStyle: {
    background: "rgba(13, 15, 18, 0.95)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#F0F4F8",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  itemStyle: { color: "#F0F4F8", fontSize: "12px" },
  labelStyle: { color: "#6B7280", fontSize: "11px", marginBottom: "4px" },
};

const axisStyle = {
  tick: { fontSize: 11, fill: "#6B7280" },
  axisLine: { stroke: "#1E2228" },
  tickLine: { stroke: "#1E2228" },
};

const gridStyle = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.04)",
};

function ChartCard({
  title,
  subtitle,
  children,
  loading,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="glass-card p-5 flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-dashboard-text">{title}</h3>
        <p className="text-xs text-dashboard-text-muted mt-0.5">{subtitle}</p>
      </div>
      <div className="flex-1 min-h-[220px] relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-dashboard-accent/30 border-t-dashboard-accent rounded-full animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-dashboard-text-muted">
      No data for this period
    </div>
  );
}

export function AnalyticsPanel({ clients }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [clientId, setClientId] = useState("all");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminAnalytics(
        dateRange.startDate,
        dateRange.endDate,
        clientId
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate, clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hitRateMedians = data?.hit_rate.historical_median ?? {};
  const turnaroundMedians = data?.turnaround.historical_median ?? {};
  const completionMedians = data?.completion_rate.historical_median ?? {};
  const queueMedians = data?.queue_depth.historical_median ?? {};

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClientSelector clients={clients} value={clientId} onChange={setClientId} />
          {data?.cached_at && (
            <span className="text-xs text-dashboard-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-apple-success inline-block" />
              Refreshed {timeAgo(data.cached_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-dashboard-border bg-dashboard-surface text-dashboard-text-muted hover:text-dashboard-text hover:border-dashboard-accent/40 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <AnalyticsDatePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-apple-error/30 text-apple-error text-sm">{error}</div>
      )}

      {/* 2x2 Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Graph A: Email Hit Rate */}
        <ChartCard
          title="Email Hit Rate"
          subtitle="Valid emails found as % of total leads, by job type"
          loading={loading}
        >
          {data && data.hit_rate.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.hit_rate.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" {...axisStyle} tickFormatter={formatDateShort} />
                <YAxis {...axisStyle} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [`${Number(value ?? 0).toFixed(1)}%`, String(name)]}
                  labelFormatter={formatDateShort}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#6B7280" }} />
                <Line
                  type="monotone"
                  dataKey="enrichment"
                  name="Enrichment"
                  stroke={COLORS.enrichment}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="verification"
                  name="Verification"
                  stroke={COLORS.verification}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                {hitRateMedians.enrichment != null && (
                  <ReferenceLine
                    y={hitRateMedians.enrichment}
                    stroke={COLORS.enrichment}
                    strokeDasharray="6 4"
                    strokeOpacity={0.35}
                    label={{ value: `Med ${hitRateMedians.enrichment}%`, position: "right", fontSize: 10, fill: COLORS.median }}
                  />
                )}
                {hitRateMedians.verification != null && (
                  <ReferenceLine
                    y={hitRateMedians.verification}
                    stroke={COLORS.verification}
                    strokeDasharray="6 4"
                    strokeOpacity={0.35}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            !loading && <EmptyState />
          )}
        </ChartCard>

        {/* Graph B: Median Turnaround Time */}
        <ChartCard
          title="Median Job Turnaround"
          subtitle="Time from creation to completion, by job type"
          loading={loading}
        >
          {data && data.turnaround.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.turnaround.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" {...axisStyle} tickFormatter={formatDateShort} />
                <YAxis {...axisStyle} tickFormatter={formatSeconds} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [formatSeconds(Number(value ?? 0)), String(name)]}
                  labelFormatter={formatDateShort}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#6B7280" }} />
                <Line type="monotone" dataKey="enrichment" name="Enrichment" stroke={COLORS.enrichment} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="verification" name="Verification" stroke={COLORS.verification} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="sales_nav" name="Sales Nav" stroke={COLORS.sales_nav} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                {turnaroundMedians.enrichment != null && (
                  <ReferenceLine
                    y={turnaroundMedians.enrichment}
                    stroke={COLORS.enrichment}
                    strokeDasharray="6 4"
                    strokeOpacity={0.35}
                    label={{ value: `Med ${formatSeconds(turnaroundMedians.enrichment)}`, position: "right", fontSize: 10, fill: COLORS.median }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            !loading && <EmptyState />
          )}
        </ChartCard>

        {/* Graph C: Queue Depth */}
        <ChartCard
          title="Queue Depth"
          subtitle="Active, queued, and waiting jobs over time"
          loading={loading}
        >
          {data ? (
            <>
              {/* Current snapshot badges */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { label: "Active", value: data.queue_depth.current.active, color: COLORS.active },
                  { label: "Queued", value: data.queue_depth.current.queued, color: COLORS.queued },
                  { label: "Waiting", value: data.queue_depth.current.waiting_room, color: COLORS.waiting_room },
                  { label: "Catchall", value: data.queue_depth.current.catchall_queued, color: COLORS.catchall_queued },
                  { label: "Vayne", value: data.queue_depth.current.vayne_queued, color: COLORS.vayne_queued },
                ].map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                    style={{ background: `${b.color}15`, color: b.color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                    {b.label}: <span className="font-semibold">{b.value}</span>
                  </div>
                ))}
              </div>
              {data.queue_depth.series.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={data.queue_depth.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid {...gridStyle} />
                    <XAxis dataKey="snapshot_at" {...axisStyle} tickFormatter={formatDateShort} />
                    <YAxis {...axisStyle} allowDecimals={false} />
                    <Tooltip
                      {...tooltipStyle}
                      labelFormatter={(label) => {
                        const d = new Date(label);
                        return d.toLocaleString();
                      }}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#6B7280" }} />
                    <Area type="monotone" dataKey="active" name="Active" stroke={COLORS.active} fill={COLORS.active} fillOpacity={0.1} strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="queued" name="Queued" stroke={COLORS.queued} fill={COLORS.queued} fillOpacity={0.08} strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="waiting_room" name="Waiting" stroke={COLORS.waiting_room} fill={COLORS.waiting_room} fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                    {queueMedians.active != null && (
                      <ReferenceLine y={queueMedians.active} stroke={COLORS.active} strokeDasharray="6 4" strokeOpacity={0.3} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-sm text-dashboard-text-muted">
                  Queue trend data will build up over time
                </div>
              )}
            </>
          ) : (
            !loading && <EmptyState />
          )}
        </ChartCard>

        {/* Graph D: Job Completion Rate */}
        <ChartCard
          title="Job Completion Rate"
          subtitle="Completed / (completed + failed) as %, by job type"
          loading={loading}
        >
          {data && data.completion_rate.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.completion_rate.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" {...axisStyle} tickFormatter={formatDateShort} />
                <YAxis {...axisStyle} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [`${Number(value ?? 0).toFixed(1)}%`, String(name)]}
                  labelFormatter={formatDateShort}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#6B7280" }} />
                <Line type="monotone" dataKey="enrichment" name="Enrichment" stroke={COLORS.enrichment} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="verification" name="Verification" stroke={COLORS.verification} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="sales_nav" name="Sales Nav" stroke={COLORS.sales_nav} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                {completionMedians.enrichment != null && (
                  <ReferenceLine
                    y={completionMedians.enrichment}
                    stroke={COLORS.enrichment}
                    strokeDasharray="6 4"
                    strokeOpacity={0.35}
                    label={{ value: `Med ${completionMedians.enrichment}%`, position: "right", fontSize: 10, fill: COLORS.median }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            !loading && <EmptyState />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
