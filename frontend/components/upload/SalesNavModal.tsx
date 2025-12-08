"use client";

import { useState } from "react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

interface SalesNavModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (url: string, autoEnrich: boolean, companySize?: string) => void;
}

export function SalesNavModal({ isOpen, onClose, onStart }: SalesNavModalProps) {
  const [url, setUrl] = useState("");
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [companySize, setCompanySize] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ count: number; leads: Array<{ name: string; company: string; title?: string }> } | null>(null);

  if (!isOpen) return null;

  const handlePreview = async () => {
    if (!url.trim()) return;
    setLoading(true);
    // Simulate preview - in production, this would call backend to parse the URL
    setTimeout(() => {
      setPreview({ count: 47, leads: [] });
      setLoading(false);
    }, 1000);
  };

  const handleStart = () => {
    if (!url.trim()) return;
    onStart(url, autoEnrich, companySize || undefined);
    setUrl("");
    setPreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              📋 Import from SalesNav
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Paste your SalesNav URL or list
              </label>
              <textarea
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.linkedin.com/sales/people/... or paste names and companies"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                rows={4}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Supports: SalesNav profile URL, list URL, or comma-separated names and companies
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="auto-enrich"
                checked={autoEnrich}
                onChange={(e) => setAutoEnrich(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="auto-enrich" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Auto-enrich with verified emails
              </label>
            </div>

            {autoEnrich && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Company Size (optional)
                </label>
                <select
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select company size</option>
                  <option value="1-50">1-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>
            )}

            {preview && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  ✅ Found {preview.count} leads
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={!url.trim() || loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading && <LoadingSpinner size="sm" />}
                <span>Enrich & Verify</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


