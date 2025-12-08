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
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg">
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
          className="text-omni-cyan hover:opacity-80 transition-opacity mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-omni-white">Results</h1>
        <p className="mt-2 text-omni-gray">Job ID: {jobId}</p>
      </div>

      {/* Summary Banner */}
      {totalVerified > 0 && (
        <div className="mb-8 bg-omni-dark border border-omni-border rounded-lg p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-omni-white mb-2">
                ✅ Verified {totalVerified} emails in {processingTime} minutes for ${totalCost.toFixed(2)}
              </h2>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-omni-gray">
                  Cost per email: <strong className="text-omni-white">${costPerEmail.toFixed(2)}</strong>
                </span>
                {savings > 0 && (
                  <span className="text-omni-cyan">
                    💰 You saved <strong>${savings.toFixed(2)}</strong> vs competitors
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-omni-dark border border-omni-border p-6 rounded-lg">
          <p className="text-sm text-omni-gray">Total Leads</p>
          <p className="text-2xl font-bold text-omni-white">{job.total_leads}</p>
        </div>
        <div className="bg-omni-dark border border-omni-border p-6 rounded-lg">
          <p className="text-sm text-omni-gray">Valid Emails</p>
          <p className="text-2xl font-bold text-omni-cyan">
            {validLeads.length}
          </p>
        </div>
        <div className="bg-omni-dark border border-omni-border p-6 rounded-lg">
          <p className="text-sm text-omni-gray">Catchall Emails</p>
          <p className="text-2xl font-bold text-omni-cyan">
            {catchallLeads.length}
          </p>
        </div>
        <div className="bg-omni-dark border border-omni-border p-6 rounded-lg">
          <p className="text-sm text-omni-gray">Not Found</p>
          <p className="text-2xl font-bold text-red-400">
            {notFoundLeads.length}
          </p>
        </div>
      </div>

      <div className="bg-omni-dark border border-omni-border rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === "all"
                  ? "bg-omni-cyan text-omni-black font-medium"
                  : "bg-omni-black border border-omni-border text-omni-gray hover:bg-omni-dark"
              }`}
            >
              All ({leads.length})
            </button>
            <button
              onClick={() => setFilter("valid")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === "valid"
                  ? "bg-omni-cyan text-omni-black font-medium"
                  : "bg-omni-black border border-omni-border text-omni-gray hover:bg-omni-dark"
              }`}
            >
              Valid ({validLeads.length})
            </button>
            <button
              onClick={() => setFilter("catchall")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === "catchall"
                  ? "bg-omni-cyan text-omni-black font-medium"
                  : "bg-omni-black border border-omni-border text-omni-gray hover:bg-omni-dark"
              }`}
            >
              Catchall ({catchallLeads.length})
            </button>
          </div>
          <div className="flex space-x-2">
            {catchallLeads.length > 0 && (
              <>
                {!user?.catchall_verifier_api_key ? (
                  <button
                    onClick={() => {
                      if (confirm("You need to add your Catchall Verifier API key in Settings first. Would you like to go to Settings now?")) {
                        window.location.href = "/settings";
                      }
                    }}
                    className="px-4 py-2 bg-omni-cyan text-omni-black rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    title="Add your Catchall Verifier API key in Settings to verify catchall emails"
                  >
                    Verify Catchalls (Add API Key)
                  </button>
                ) : (
                  <button
                    onClick={handleVerifyCatchalls}
                    disabled={verifyingCatchalls}
                    className="px-4 py-2 bg-omni-cyan text-omni-black rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium flex items-center space-x-2"
                  >
                    {verifyingCatchalls && <LoadingSpinner size="sm" />}
                    <span>{verifyingCatchalls ? "Verifying..." : "Verify Catchalls"}</span>
                  </button>
                )}
              </>
            )}
            <button
              onClick={downloadCSV}
              className="px-4 py-2 bg-omni-cyan text-omni-black rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              Download CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-omni-border">
            <thead className="bg-omni-dark">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-omni-gray uppercase">
                  First Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-omni-gray uppercase">
                  Last Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-omni-gray uppercase">
                  Website
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-omni-gray uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-omni-gray uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-omni-gray uppercase">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-omni-black divide-y divide-omni-border">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-omni-dark transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-omni-white">
                    {lead.first_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-omni-white">
                    {lead.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-omni-gray">
                    {lead.domain}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-omni-white">
                    {lead.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          lead.verification_status === "valid"
                            ? "bg-green-900/20 text-green-300 border border-green-800"
                            : lead.verification_status === "catchall"
                            ? "bg-yellow-900/20 text-yellow-300 border border-yellow-800"
                            : "bg-red-900/20 text-red-300 border border-red-800"
                        }`}
                      >
                        {lead.verification_status}
                      </span>
                      {lead.verification_tag === "catchall-verified" && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-omni-cyan/20 text-omni-cyan border border-omni-cyan/30">
                          Catchall-Verified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-omni-gray">
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

