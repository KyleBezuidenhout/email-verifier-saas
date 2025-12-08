"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { apiClient } from "@/lib/api";

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [catchallApiKey, setCatchallApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.catchall_verifier_api_key) {
      setCatchallApiKey(user.catchall_verifier_api_key);
    }
  }, [user]);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
    } catch (error) {
      setMessage("Failed to logout");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCatchallKey = async () => {
    setSaving(true);
    setMessage("");
    try {
      await apiClient.updateUser({
        catchall_verifier_api_key: catchallApiKey || undefined,
      });
      // Refresh user data in context
      await refreshUser();
      setMessage("Catchall verifier API key saved successfully!");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Account Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <p className="mt-1 text-sm text-gray-900">{user?.email}</p>
            </div>
            {user?.company_name && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company Name
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {user.company_name}
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Credits
              </label>
              <p className="mt-1 text-sm text-gray-900">{user?.credits || 0}</p>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">API Key</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your API Key
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={user?.api_key || ""}
                readOnly
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(user?.api_key || "");
                  setMessage("API key copied to clipboard");
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Catchall Verifier API Key (Optional)
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Catchall Verifier API Key
              </label>
              <input
                type="password"
                value={catchallApiKey}
                onChange={(e) => setCatchallApiKey(e.target.value)}
                placeholder="Enter your catchall verifier API key (optional)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Add your catchall verifier API key to verify catchall emails from your enrichment runs.
              </p>
            </div>
            <button
              onClick={handleSaveCatchallKey}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {saving && <LoadingSpinner size="sm" />}
              <span>Save Catchall API Key</span>
            </button>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-medium text-red-900 mb-4">
            Danger Zone
          </h2>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
          >
            {loading && <LoadingSpinner size="sm" />}
            <span>Logout</span>
          </button>
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

