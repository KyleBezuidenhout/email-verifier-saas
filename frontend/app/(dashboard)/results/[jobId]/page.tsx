"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Lead, Job } from "@/types";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function ResultsPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [verifyingCatchalls, setVerifyingCatchalls] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [jobData, leadsData] = await Promise.all([
        apiClient.getJob(jobId),
        apiClient.getResults(jobId),
      ]);
      setJob(jobData);
      setLeads(leadsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyCatchalls = async () => {
    setVerifyingCatchalls(true);
    setError("");
    try {
      const result = await apiClient.verifyCatchalls(jobId);
      // Reload data to get updated leads
      await loadData();
      alert(`Successfully verified ${result.verified_count} catchall emails!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify catchalls");
    } finally {
      setVerifyingCatchalls(false);
    }
  };

  const filteredLeads =
    filter === "all"
      ? leads
      : filter === "valid"
      ? leads.filter((lead) => lead.verification_status === "valid")
      : leads.filter((lead) => lead.verification_status === filter);

  // Valid leads include both regular valid and catchall-verified
  const validLeads = leads.filter((l) => l.verification_status === "valid");
  const catchallLeads = leads.filter((l) => l.verification_status === "catchall");
  const notFoundLeads = leads.filter((l) => l.verification_status === "invalid" || l.verification_status === "not_found");
  
  // Check if user can verify catchalls (has API key and job has catchall leads)
  const canVerifyCatchalls = user?.catchall_verifier_api_key && catchallLeads.length > 0;
  
  const totalVerified = validLeads.length + catchallLeads.length;
  const totalCost = job ? (job.cost_in_credits || 0) * 0.1 : 0;
  const costPerEmail = totalVerified > 0 ? totalCost / totalVerified : 0;
  const competitorCost = totalVerified * 0.50; // Competitors charge $0.50 per email
  const savings = competitorCost - totalCost;
  
  const processingTime = job && job.completed_at && job.created_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000 / 60)
    : 0;

  const downloadCSV = () => {
    const headers = ["First Name", "Last Name", "Website", "Email", "Status"];
    const csv = [
      headers.join(","),
      ...filteredLeads.map((lead) =>
        [
          lead.first_name,
          lead.last_name,
          lead.domain,
          lead.email,
          lead.verification_status,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${jobId}.csv`;
    a.click();
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

  if (error || !job) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg">
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500 mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Results</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Job ID: {jobId}</p>
      </div>

      {/* Summary Banner */}
      {totalVerified > 0 && (
        <div className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                ✅ Verified {totalVerified} emails in {processingTime} minutes for ${totalCost.toFixed(2)}
              </h2>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  Cost per email: <strong>${costPerEmail.toFixed(2)}</strong>
                </span>
                {savings > 0 && (
                  <span className="text-green-700 dark:text-green-300">
                    💰 You saved <strong>${savings.toFixed(2)}</strong> vs competitors
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Leads</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{job.total_leads}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Valid Emails</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {validLeads.length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Catchall Emails</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {catchallLeads.length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Not Found</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {notFoundLeads.length}
          </p>
        </div>
      </div>

      {/* Verify Catchalls Button */}
      {canVerifyCatchalls && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                Verify Catchall Emails
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Verify {catchallLeads.length} catchall emails using your catchall verifier API. Verified emails will be moved to the Valid section.
              </p>
            </div>
            <button
              onClick={handleVerifyCatchalls}
              disabled={verifyingCatchalls}
              className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {verifyingCatchalls && <LoadingSpinner size="sm" />}
              <span>{verifyingCatchalls ? "Verifying..." : "Verify Catchalls"}</span>
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              All ({leads.length})
            </button>
            <button
              onClick={() => setFilter("valid")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === "valid"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Valid ({validLeads.length})
            </button>
            <button
              onClick={() => setFilter("catchall")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === "catchall"
                  ? "bg-yellow-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Catchall ({catchallLeads.length})
            </button>
          </div>
          <button
            onClick={downloadCSV}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
          >
            Download CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  First Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Last Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Website
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {lead.first_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {lead.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {lead.domain}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {lead.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          lead.verification_status === "valid"
                            ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                            : lead.verification_status === "catchall"
                            ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300"
                            : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300"
                        }`}
                      >
                        {lead.verification_status}
                      </span>
                      {lead.verification_tag === "catchall-verified" && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300">
                          Catchall-Verified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {lead.prevalence_score || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

