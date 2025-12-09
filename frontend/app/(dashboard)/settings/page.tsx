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
  const [regenerating, setRegenerating] = useState(false);

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

  const handleRegenerateApiKey = async () => {
    if (!confirm("Are you sure you want to regenerate your API key? The old key will no longer work.")) {
      return;
    }
    setRegenerating(true);
    setMessage("");
    try {
      await apiClient.regenerateApiKey();
      await refreshUser();
      setMessage("API key regenerated successfully! Make sure to update any integrations using the old key.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to regenerate API key");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-apple-text mb-8">Settings</h1>

      <div className="dashbrd-card p-6 space-y-6">
        <div>
          <h2 className="text-lg font-medium text-apple-text mb-4">
            Account Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-apple-text-muted">
                Email
              </label>
              <p className="mt-1 text-sm text-apple-text">{user?.email}</p>
            </div>
            {user?.company_name && (
              <div>
                <label className="block text-sm font-medium text-apple-text-muted">
                  Company Name
                </label>
                <p className="mt-1 text-sm text-apple-text">
                  {user.company_name}
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-apple-text-muted">
                Credits
              </label>
              <p className="mt-1 text-sm text-apple-text">{user?.credits || 0}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-apple-border pt-6">
          <h2 className="text-lg font-medium text-apple-text mb-4">API Key</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-apple-text-muted mb-2">
                Your API Key
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={user?.api_key || ""}
                  readOnly
                  className="flex-1 apple-input font-mono text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(user?.api_key || "");
                    setMessage("API key copied to clipboard");
                  }}
                  className="btn-secondary"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-sm text-apple-text-muted">
                Use this API key to authenticate API requests. Include it in the <code className="px-1 py-0.5 bg-dashbrd-card rounded text-xs">X-API-Key</code> header or as a Bearer token.
              </p>
            </div>
            <button
              onClick={handleRegenerateApiKey}
              disabled={regenerating}
              className="btn-secondary disabled:opacity-50 flex items-center space-x-2"
            >
              {regenerating && <LoadingSpinner size="sm" />}
              <span>Regenerate API Key</span>
            </button>
          </div>
        </div>

        <div className="border-t border-apple-border pt-6">
          <h2 className="text-lg font-medium text-apple-text mb-4">
            Catchall Verifier API Key (Optional)
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-apple-text-muted mb-2">
                Catchall Verifier API Key
              </label>
              <input
                type="password"
                value={catchallApiKey}
                onChange={(e) => setCatchallApiKey(e.target.value)}
                placeholder="Enter your catchall verifier API key (optional)"
                className="apple-input w-full"
              />
              <p className="mt-1 text-sm text-apple-text-muted">
                Add your catchall verifier API key to verify catchall emails from your enrichment runs.
              </p>
            </div>
            <button
              onClick={handleSaveCatchallKey}
              disabled={saving}
              className="btn-primary disabled:opacity-50 flex items-center space-x-2"
            >
              {saving && <LoadingSpinner size="sm" />}
              <span>Save Catchall API Key</span>
            </button>
          </div>
        </div>

        <div className="border-t border-apple-border pt-6">
          <h2 className="text-lg font-medium text-apple-error mb-4">
            Danger Zone
          </h2>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-4 py-2 bg-apple-error text-white rounded-lg hover:bg-apple-error/90 disabled:opacity-50 flex items-center space-x-2 transition-colors"
          >
            {loading && <LoadingSpinner size="sm" />}
            <span>Logout</span>
          </button>
        </div>

        {message && (
          <div className="badge-info px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

