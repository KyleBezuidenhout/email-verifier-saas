"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";

const CATEGORIES = [
  { value: "question", label: "General Question" },
  { value: "bug", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export default function SupportPage() {
  const [category, setCategory] = useState<Category>("question");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const wordCount = message.trim() ? message.trim().split(/\s+/).length : 0;
  const canSubmit = message.trim().length >= 10 && wordCount <= 150;

  function handleMessageChange(value: string) {
    const words = value.trim() ? value.trim().split(/\s+/) : [];
    if (words.length > 150 && value.length > message.length) return;
    setMessage(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError("");
    setSuccess(false);

    const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? category;

    try {
      await apiClient.submitSupportTicket({ category, subject: categoryLabel, message });
      setSuccess(true);
      setMessage("");
      setCategory("question");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dashboard-text">Support</h1>
        <p className="text-dashboard-text-muted mt-2">
          Get help with your account or report issues.
        </p>
      </div>

      {/* Contact Card */}
      <div className="glass-card p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-dashboard-accent/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-dashboard-text mb-2">Contact Us</h2>
            <p className="text-dashboard-text-muted mb-4">
              Have a question, issue, or need assistance? Our support team is here to help.
            </p>
            <a 
              href="mailto:support@billionverifier.io" 
              className="inline-flex items-center gap-2 text-dashboard-accent hover:underline font-medium"
            >
              support@billionverifier.io
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Support Form */}
      <div className="glass-card p-8 mt-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-dashboard-accent/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-dashboard-text mb-1">Submit a Request</h2>
            <p className="text-dashboard-text-muted text-sm">
              Fill out the form below and we&apos;ll get back to you as soon as possible.
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#22c55e] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[#22c55e] text-sm font-medium">
                Your request has been submitted. We&apos;ll get back to you shortly.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-dashboard-text mb-1.5">
              Topic
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-4 py-2.5 rounded-lg bg-dashboard-dark border border-white/10 text-dashboard-text text-sm focus:outline-none focus:border-dashboard-accent focus:ring-1 focus:ring-dashboard-accent transition-colors"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-dashboard-text mb-1.5">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              placeholder="Describe your issue or question in detail..."
              rows={6}
              className="w-full px-4 py-2.5 rounded-lg bg-dashboard-dark border border-white/10 text-dashboard-text placeholder-dashboard-text-muted/50 text-sm focus:outline-none focus:border-dashboard-accent focus:ring-1 focus:ring-dashboard-accent transition-colors resize-y"
            />
            <p className={`mt-1 text-xs ${wordCount > 150 ? "text-red-400" : "text-dashboard-text-muted"}`}>
              {wordCount}/150 words
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-dashboard-accent text-white font-medium text-sm hover:bg-dashboard-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Submit Request
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
