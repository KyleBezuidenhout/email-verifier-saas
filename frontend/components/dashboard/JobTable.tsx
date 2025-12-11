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
}

export function JobTable({ jobs, onDelete, onCancel }: JobTableProps) {
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = (jobId: string) => {
    if (deleteConfirm === jobId) {
      onDelete(jobId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(jobId);
    }
  };

  const handleRowClick = (jobId: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons or links
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    router.push(`/results/${jobId}`);
  };

  return (
    <div className="dashbrd-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-apple-border">
          <thead className="bg-apple-surface">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Job ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Upload Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Leads
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Hit Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-apple-surface divide-y divide-apple-border">
            {jobs.map((job) => {
              // Only calculate hit rate after job is completed
              // Enrichment: (valid + catchall) / total unique leads | Verification: valid / total
              const isCompleted = job.status === "completed";
              const isEnrichment = job.job_type === "enrichment";
              let hitRateDisplay = "--";
              
              if (isCompleted && job.total_leads > 0) {
                const rawHitRate = isEnrichment
                  ? ((job.valid_emails_found + job.catchall_emails_found) / job.total_leads * 100)
                  : ((job.valid_emails_found) / job.total_leads * 100);
                hitRateDisplay = `${Math.min(rawHitRate, 100).toFixed(1)}%`;
              }
              
              return (
              <tr 
                key={job.id} 
                className="hover:bg-apple-surface-hover transition-colors cursor-pointer"
                onClick={(e) => handleRowClick(job.id, e)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-apple-text">
                  <div className="flex items-center gap-2">
                    <span>{job.id.slice(0, 8)}...</span>
                    {job.source === "Sales Nav" && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                        Sales Nav
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text-muted">
                  {formatDate(job.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-apple-text">
                  {job.total_leads}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      job.status === "completed" ? "badge-success" :
                      job.status === "processing" ? "badge-warning" :
                      job.status === "failed" ? "badge-error" :
                      job.status === "cancelled" ? "badge-info" :
                      "badge-info"
                    }`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-full bg-apple-surface-hover rounded-full h-2">
                    <div
                      className="bg-apple-accent h-2 rounded-full transition-all"
                      style={{
                        width: `${calculateProgress(
                          job.processed_leads,
                          job.total_leads
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-apple-text-muted mt-1 block">
                    {calculateProgress(job.processed_leads, job.total_leads)}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`font-medium ${isCompleted ? 'text-green-400' : 'text-apple-text-muted'}`}>
                    {hitRateDisplay}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <Link
                    href={`/results/${job.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-apple-accent hover:opacity-80 transition-opacity"
                  >
                    View
                  </Link>
                  {(job.status === 'pending' || job.status === 'processing') && onCancel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancel(job.id);
                      }}
                      className="text-apple-warning hover:text-apple-warning/80 transition-colors"
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
                      className="text-apple-error hover:text-apple-error/80 transition-colors"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.id);
                      }}
                      className="text-apple-error hover:text-apple-error/80 transition-colors"
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
          <p className="text-apple-text-muted">No jobs yet. Upload a CSV file to get started.</p>
        </div>
      )}
    </div>
  );
}

