"use client";

import { useState } from "react";
import Link from "next/link";

interface EmailResult {
  name: string;
  company: string;
  email: string;
  status: "valid" | "invalid" | "catchall" | "pending";
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

    // Simulate API call - replace with actual API call later
    setTimeout(() => {
      const newResult: EmailResult = {
        name: name.trim(),
        company: companyWebsite.trim(),
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@${companyWebsite.replace(/^https?:\/\//, "").replace(/^www\./, "")}`,
        status: "pending", // Will be "valid", "invalid", or "catchall" when verification is implemented
      };
      setResults([...results, newResult]);
      setName("");
      setCompanyWebsite("");
      setLoading(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFindEmail();
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Try it now - Test up to 5 emails for free
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
          <input
            type="text"
            placeholder="example.com"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleFindEmail}
            disabled={loading || results.length >= 5}
            className="px-6 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find Email
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Results ({results.length}/5):
            </div>
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">{result.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{result.company}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-mono text-gray-900 dark:text-white">{result.email}</div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    result.status === "pending"
                      ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300"
                      : result.status === "valid"
                      ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                      : result.status === "catchall"
                      ? "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300"
                      : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300"
                  }`}>
                    {result.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length >= 5 && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
              You've reached the free test limit. Sign up for unlimited email verification!
            </p>
            <Link
              href="/register"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
            >
              Create Free Account
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/register"
          className="inline-flex items-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors shadow-lg"
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

