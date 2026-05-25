"use client";

import { Job } from "@/types";
import { formatDate, getStatusColor, calculateProgress } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface JobTableProps {
  jobs: Job[];
  onDelete: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  hitRateHeader?: string;
}

export function JobTable({ jobs, onDelete, onCancel, hitRateHeader = "% found" }: JobTableProps) {
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [catchallWarning, setCatchallWarning] = useState<{ jobId: string; action: "cancel" | "delete" } | null>(null);

  const handleDelete = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job?.job_type === "catchall_verification" && (job.status === "processing" || job.status === "pending")) {
      setCatchallWarning({ jobId, action: "delete" });
      return;
    }
    if (deleteConfirm === jobId) {
      onDelete(jobId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(jobId);
    }
  };

  const handleCatchallCancel = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job?.job_type === "catchall_verification") {
      setCatchallWarning({ jobId, action: "cancel" });
      return;
    }
    onCancel?.(jobId);
  };

  const confirmCatchallAction = () => {
    if (!catchallWarning) return;
    if (catchallWarning.action === "cancel") {
      onCancel?.(catchallWarning.jobId);
    } else {
      onDelete(catchallWarning.jobId);
    }
    setCatchallWarning(null);
  };

  const isViewable = (status: string) =>
    status === "completed" || status === "failed" || status === "cancelled";

  const handleRowClick = (jobId: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons or links
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    const job = jobs.find((j) => j.id === jobId);
    if (!job || !isViewable(job.status)) {
      return;
    }
    router.push(`/results/${jobId}`);
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-dashboard-border">
          <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                Job ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                Upload Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                Leads
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                {hitRateHeader}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
            {jobs.map((job) => {
              // Only calculate hit rate after job is completed
              // Enrichment: (valid + catchall) / total unique leads | Verification: valid / total
              const isCompleted = job.status === "completed";
              const isEnrichment = job.job_type === "enrichment";
              let hitRateDisplay = "--";
              let hitRateValue = 0;

              if (isCompleted && job.total_leads > 0) {
                hitRateValue = isEnrichment
                  ? ((job.valid_emails_found + job.catchall_emails_found) / job.total_leads * 100)
                  : ((job.valid_emails_found) / job.total_leads * 100);
                hitRateDisplay = `${Math.min(hitRateValue, 100).toFixed(1)}%`;
              }

              // Determine hit rate color based on percentage
              const getHitRateColor = (value: number): string => {
                if (value <= 40) return '#E5484D';      // Red for ≤40%
                if (value <= 60) return '#F5A623';    // Orange for 41-60%
                return '#22C55E';                     // Green for 61%+
              };
              
              const rowViewable = isViewable(job.status);
              return (
              <tr 
                key={job.id} 
                className={`transition-colors ${rowViewable ? "hover:bg-dashboard-card/50 cursor-pointer" : "cursor-default"}`}
                onClick={(e) => handleRowClick(job.id, e)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono" style={{ color: '#C8D2DC' }}>
                  <div className="flex items-center gap-2">
                    <span
                      title={job.job_name || job.id}
                      className="cursor-default"
                    >
                      {job.job_name
                        ? (job.job_name.length > 15 ? `${job.job_name.slice(0, 15)}...` : job.job_name)
                        : `${job.id.slice(0, 8)}...`
                      }
                    </span>
                    {(job.source === "Sales Nav" || job.source === "Scraped") && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                        {job.source === "Scraped" ? "Scraped" : "Sales Nav"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-dashboard-text-muted">
                  {formatDate(job.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#C8D2DC' }}>
                  {job.total_leads}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`text-xs font-medium ${
                      job.status === "completed" ? "text-[#22c55e]" :
                      job.status === "processing" ? "text-yellow-400" :
                      job.status === "failed" ? "text-red-400" :
                      job.status === "cancelled" ? "text-dashboard-text-muted" :
                      job.status === "waiting_for_csv" ? "text-yellow-400" :
                      "text-dashboard-text-muted"
                    }`}
                  >
                    {job.status === "waiting_for_csv" ? "Waiting for CSV" : job.status === "waiting" ? "queued" : job.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-full bg-dashboard-card rounded-full h-1.5">
                    <div
                      className="bg-dashboard-accent h-1.5 rounded-full transition-all"
                      style={{
                        width: `${calculateProgress(
                          job.processed_leads,
                          job.total_leads
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-dashboard-text-muted mt-1 block">
                    {calculateProgress(job.processed_leads, job.total_leads)}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="font-medium" style={{ color: isCompleted ? getHitRateColor(hitRateValue) : '#6B7280' }}>
                    {hitRateDisplay}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  {rowViewable ? (
                    <Link
                      href={`/results/${job.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-dashboard-accent hover:opacity-80 transition-opacity"
                    >
                      View
                    </Link>
                  ) : (
                    <span
                      title="Results available once the job completes"
                      className="text-dashboard-text-muted/60 cursor-not-allowed"
                    >
                      View
                    </span>
                  )}
                  {(job.status === 'pending' || job.status === 'processing' || job.status === 'waiting' || job.status === 'queued') && onCancel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCatchallCancel(job.id);
                      }}
                      className="text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {deleteConfirm === job.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.id);
                      }}
                      className="transition-colors hover:opacity-80"
                      style={{ color: '#E5484D' }}
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.id);
                      }}
                      className="transition-colors hover:opacity-80"
                      style={{ color: '#E5484D' }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {jobs.length === 0 && (
        <div className="text-center py-12">
          <p className="text-dashboard-text-muted">No jobs yet. Upload a CSV file to get started.</p>
        </div>
      )}

      {/* Catchall credit warning modal */}
      {catchallWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCatchallWarning(null)} />
          <div className="relative glass-surface p-8 max-w-md w-full mx-4">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white text-center mb-3">
              Credits Are Non-Refundable
            </h2>
            <p className="text-gray-400 text-center mb-8 leading-relaxed">
              Credits for this job are deducted when processing begins and{" "}
              <strong className="text-white">cannot be refunded</strong>, even if you{" "}
              {catchallWarning.action === "cancel" ? "cancel" : "delete"} the job.
              The full credit cost for all emails in this job will still apply.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCatchallWarning(null)}
                className="flex-1 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-medium hover:bg-white/10 transition-all"
              >
                Go Back
              </button>
              <button
                onClick={confirmCatchallAction}
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-all"
              >
                {catchallWarning.action === "cancel" ? "Cancel Job" : "Delete Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

