"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { PaymentHistoryItem } from "@/types";

const EVENT_LABELS: Record<string, string> = {
  subscription_payment: "Subscription",
  topup: "Credit Top-Up",
  refund: "Refund",
  dispute: "Dispute",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PaymentHistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PaymentHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const resp = await apiClient.getPaymentHistory(limit, offset);
        setItems(resp.items);
        setTotal(resp.total);
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [offset]);

  const handleManageSubscription = async () => {
    if (user?.manage_url) {
      window.open(user.manage_url, "_blank");
      return;
    }
    try {
      const resp = await apiClient.getBillingPortalUrl();
      window.open(resp.url, "_blank");
    } catch {
      // no active subscription
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-dashboard-text">Payment History</h1>
          <p className="text-dashboard-text-muted mt-1">View all charges, credits, and subscription activity.</p>
        </div>
        {user?.subscription_status === "active" && (
          <button
            onClick={handleManageSubscription}
            className="inline-flex items-center justify-center border border-dashboard-accent text-dashboard-accent bg-transparent hover:bg-dashboard-accent/10 transition-colors font-semibold py-2.5 px-5 rounded-lg text-sm"
          >
            Manage Subscription
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dashboard-accent" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-dashboard-text-muted">No payment history yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-dashboard-text-muted uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-dashboard-text-muted uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-dashboard-text-muted uppercase tracking-wider">Plan</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-dashboard-text-muted uppercase tracking-wider">Amount</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-dashboard-text-muted uppercase tracking-wider">Credits</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-dashboard-text-muted uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashboard-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-dashboard-card/30 transition-colors">
                    <td className="px-5 py-4 text-sm text-dashboard-text">{formatDate(item.created_at)}</td>
                    <td className="px-5 py-4 text-sm text-dashboard-text">
                      {EVENT_LABELS[item.event_type] || item.event_type}
                    </td>
                    <td className="px-5 py-4 text-sm text-dashboard-text-muted capitalize">
                      {item.plan_name?.replace("_", " ") || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-right text-dashboard-text">
                      ${item.amount_dollars.toFixed(2)}
                    </td>
                    <td className={`px-5 py-4 text-sm text-right font-medium ${item.credits_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {item.credits_delta >= 0 ? "+" : ""}{item.credits_delta.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-sm text-right text-dashboard-text-muted">
                      {item.new_balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-dashboard-border">
            <p className="text-xs text-dashboard-text-muted">
              Page {currentPage} of {totalPages} ({total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-3 py-1.5 text-xs rounded border border-dashboard-border text-dashboard-text-muted hover:text-dashboard-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="px-3 py-1.5 text-xs rounded border border-dashboard-border text-dashboard-text-muted hover:text-dashboard-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
