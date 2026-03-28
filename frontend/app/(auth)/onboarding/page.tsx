"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export default function OnboardingPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
    if (!loading && user && user.company_website) {
      router.replace("/sales-nav-scraper");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!companyWebsite.trim()) {
      setError("Company website is required.");
      return;
    }

    const wordCount = referralSource.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 20) {
      setError("Referral answer must be 20 words or less.");
      return;
    }

    setSubmitting(true);

    try {
      await apiClient.updateUser({
        company_website: companyWebsite.trim(),
        referral_source: referralSource.trim(),
      });
      await refreshUser();
      router.replace("/sales-nav-scraper");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || (!user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8 relative">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Complete your profile
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Just a couple more details before you get started
          </p>
        </div>
        <div className="glass-surface py-8 px-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="company_website" className="block text-sm font-medium text-white mb-2">
                Company Website
              </label>
              <input
                id="company_website"
                type="text"
                required
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                className="glass-input w-full"
                placeholder="yourcompany.com"
              />
            </div>

            <div>
              <label htmlFor="referral_source" className="block text-sm font-medium text-white mb-2">
                How Did You Hear About Us?
              </label>
              <input
                id="referral_source"
                type="text"
                required
                maxLength={150}
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                className="glass-input w-full"
                placeholder="John from Twitter, Google search, etc."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0099FF] text-white py-2 px-4 rounded-lg hover:bg-[#0099FF]/90 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all"
              style={{ boxShadow: "0 0 20px rgba(0, 153, 255, 0.2)" }}
            >
              {submitting ? <LoadingSpinner size="sm" /> : "Get started"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
