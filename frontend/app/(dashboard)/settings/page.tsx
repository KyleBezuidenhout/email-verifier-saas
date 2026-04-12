"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { apiClient } from "@/lib/api";

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);

  // Auto-dismiss message after 5 seconds
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  // Default to true if undefined (enabled by default)
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(
    user?.email_notifications_enabled ?? true
  );

  const handleToggleNotifications = async () => {
    const newValue = !emailNotificationsEnabled;
    setUpdatingNotifications(true);
    setMessage("");
    try {
      await apiClient.updateUser({ email_notifications_enabled: newValue });
      await refreshUser();
      setEmailNotificationsEnabled(newValue);
      setMessage(newValue ? "Email notifications enabled." : "Email notifications disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update notification preferences");
    } finally {
      setUpdatingNotifications(false);
    }
  };

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

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    setMessage("");
    try {
      await apiClient.forgotPassword(user.email);
      setMessage("Please check your inbox.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send reset email");
    } finally {
      setSendingReset(false);
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
      <h1 className="text-3xl font-bold text-dashboard-text mb-8">Settings</h1>

      <div className="glass-card p-6 space-y-6">
        <div>
          <h2 className="text-lg font-medium text-dashboard-text mb-4">
            Account Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dashboard-text-muted">
                Email
              </label>
              <p className="mt-1 text-base text-dashboard-text">{user?.email}</p>
            </div>
            {user?.company_name && (
              <div>
                <label className="block text-sm font-medium text-dashboard-text-muted">
                  Company Name
                </label>
                <p className="mt-1 text-base text-dashboard-text">
                  {user.company_name}
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-dashboard-text-muted">
                Credits
              </label>
              <p className="mt-1 text-base text-dashboard-text">{user?.credits || 0}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-dashboard-border pt-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <p className="text-lg font-medium text-dashboard-text">Job completion emails</p>
              <p className="text-sm text-dashboard-text-muted mt-1">
                Receive an email notification when your job finishes processing.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleNotifications}
              disabled={updatingNotifications}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-dashboard-dark disabled:opacity-50 disabled:bg-black ${
                emailNotificationsEnabled ? "bg-primary" : "bg-gray-600"
              }`}
              aria-pressed={emailNotificationsEnabled}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  emailNotificationsEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {!user?.oauth_provider && (
          <div className="border-t border-dashboard-border pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-dashboard-text mb-2">Reset password</h2>
                <p className="text-sm text-dashboard-text-muted">
                  Click the button below, and we&apos;ll send you an email to change your password.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={sendingReset || !user?.email}
                className="px-4 py-2 border border-[rgb(229,72,77)] text-[rgb(229,72,77)] bg-transparent rounded-lg hover:bg-[rgb(229,72,77)]/10 transition-colors disabled:opacity-50 flex items-center space-x-2 disabled:cursor-not-allowed"
              >
                {sendingReset && <LoadingSpinner size="sm" />}
                <span>Reset</span>
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-dashboard-border pt-6">
          <h2 className="text-lg font-medium text-dashboard-text mb-2">Billing</h2>
          <p className="text-sm text-dashboard-text-muted mb-4">
            View your invoices and payment activity.
          </p>
          <Link
            href="/payment-history"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dashboard-accent/10 text-dashboard-accent border border-dashboard-accent/20 hover:bg-dashboard-accent/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span>Payment History</span>
          </Link>
        </div>

        <div className="border-t border-dashboard-border pt-6">
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-4 py-2 border border-[rgb(229,72,77)] text-[rgb(229,72,77)] bg-transparent rounded-lg hover:bg-[rgb(229,72,77)]/10 disabled:opacity-50 flex items-center space-x-2 transition-colors"
          >
            {loading && <LoadingSpinner size="sm" />}
            <span>Logout</span>
          </button>
        </div>

        {message && (
          <div className="text-sm text-dashboard-text-muted">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

