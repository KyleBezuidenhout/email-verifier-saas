"use client";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface EmailResult {
  name: string;
  company: string;
  email: string;
  status: "valid" | "invalid" | "catchall" | "pending" | "not_found";
}

export function EmailTestForm() {
  const [name, setName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [results, setResults] = useState<EmailResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFindEmail = async () => {
    if (!name.trim() || !companyWebsite.trim()) {
      setError("Please fill in both name and company website");
      return;
    }

    if (results.length >= 5) {
      setError("Maximum 5 test emails reached. Sign up for unlimited access.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await apiClient.testEmail(name.trim(), companyWebsite.trim());
      
      const newResult: EmailResult = {
        name: result.name,
        company: result.company,
        email: result.email,
        status: result.status as EmailResult["status"],
      };
      
      setResults([...results, newResult]);
      setName("");
      setCompanyWebsite("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find email");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFindEmail();
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <p className="text-sm text-gray-400 mb-2">
          Try it now - Test up to 5 emails for free
        </p>
      </div>

      <div className="glass-card p-8">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            className="glass-input flex-1"
          />
          <input
            type="text"
            placeholder="example.com"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            onKeyPress={handleKeyPress}
            className="glass-input flex-1"
          />
          <button
            onClick={handleFindEmail}
            disabled={loading || results.length >= 5}
            className="px-6 py-3 bg-white/5 text-white rounded-xl hover:bg-[#0099FF] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all border border-white/10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find Email
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400">{error}</div>
        )}

        {results.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="text-sm font-medium text-white mb-3">
              Results ({results.length}/5):
            </div>
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/8"
              >
                <div className="flex-1">
                  <div className="font-medium text-white">{result.name}</div>
                  <div className="text-sm text-gray-400">{result.company}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm font-mono text-white">{result.email}</div>
                  <span className={`px-3 py-1.5 text-xs rounded-full font-medium ${
                    result.status === "pending"
                      ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                      : result.status === "valid"
                      ? "bg-green-500/20 text-green-300 border border-green-500/30"
                      : result.status === "catchall"
                      ? "bg-[#0099FF]/20 text-[#0099FF] border border-[#0099FF]/30"
                      : result.status === "not_found"
                      ? "bg-gray-500/20 text-gray-400 border border-white/10"
                      : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}>
                    {result.status === "not_found" ? "not found" : result.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length >= 5 && (
          <div className="mt-6 p-4 bg-[#0099FF]/10 border border-[#0099FF]/20 rounded-xl">
            <p className="text-sm text-[#0099FF] mb-3">
              You&apos;ve reached the free test limit. Sign up for unlimited email verification!
            </p>
            <Link
              href="/register"
              className="inline-flex items-center px-4 py-2 bg-[#0099FF] text-black rounded-xl hover:opacity-90 text-sm font-medium transition-all"
            >
              Create Free Account
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/register"
          className="inline-flex items-center px-8 py-4 bg-[#0099FF] text-black rounded-xl hover:opacity-90 font-medium transition-all"
          style={{ boxShadow: '0 0 20px rgba(0, 153, 255, 0.25)' }}
        >
          Or Create Your Free Account For More
          <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
