"use client";

import { Job } from "@/types";
import { formatDate, getStatusColor, calculateProgress } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

interface JobTableProps {
  jobs: Job[];
  onDelete: (jobId: string) => void;
}

export function JobTable({ jobs, onDelete }: JobTableProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = (jobId: string) => {
    if (deleteConfirm === jobId) {
      onDelete(jobId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(jobId);
    }
  };

  return (
    <div className="dashbrd-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-dashbrd-border">
          <thead className="bg-dashbrd-card">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Job ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Upload Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Leads
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Verified
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dashbrd-text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-dashbrd-card divide-y divide-dashbrd-border">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-dashbrd-card-hover transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-dashbrd-text">
                  {job.id.slice(0, 8)}...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-dashbrd-text-muted">
                  {formatDate(job.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-dashbrd-text">
                  {job.total_leads}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      job.status === "completed" ? "badge-success" :
                      job.status === "processing" ? "badge-warning" :
                      job.status === "failed" ? "badge-error" :
                      "badge-info"
                    }`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-full bg-dashbrd-card-hover rounded-full h-2">
                    <div
                      className="bg-dashbrd-accent h-2 rounded-full transition-all"
                      style={{
                        width: `${calculateProgress(
                          job.processed_leads,
                          job.total_leads
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-dashbrd-text-muted mt-1 block">
                    {calculateProgress(job.processed_leads, job.total_leads)}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-dashbrd-text">
                  {job.valid_emails_found + job.catchall_emails_found}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <Link
                    href={`/results/${job.id}`}
                    className="text-dashbrd-accent hover:opacity-80 transition-opacity"
                  >
                    View
                  </Link>
                  {deleteConfirm === job.id ? (
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-dashbrd-error hover:text-dashbrd-error/80 transition-colors"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-dashbrd-error hover:text-dashbrd-error/80 transition-colors"
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
      {jobs.length === 0 && (
        <div className="text-center py-12">
          <p className="text-dashbrd-text-muted">No jobs yet. Upload a CSV file to get started.</p>
        </div>
      )}
    </div>
  );
}

