"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

function ResetDailyLimitContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const resetRef = useRef(false);

  useEffect(() => {
    if (!token || resetRef.current) return;
    resetRef.current = true;

    const reset = async () => {
      try {
        await apiClient.resetVayneDailyUsageWithToken(token);
        setSuccess(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Reset failed. The link may have expired."
        );
      } finally {
        setLoading(false);
      }
    };

    reset();
  }, [token]);

  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) {
      router.push("/sales-nav-scraper");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [success, countdown, router]);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-400 text-sm">
          Invalid reset link. No token was provided.
        </p>
        <Link
          href="/sales-nav-scraper"
          className="inline-block text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
        >
          Go to Sales Nav Scraper
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center space-y-4">
        <LoadingSpinner size="md" />
        <p className="text-gray-400 text-sm">Resetting your daily limit...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-6 h-6 text-[#22c55e]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-white font-medium">
          Your daily limit has been reset successfully
        </p>
        <p className="text-sm text-gray-400">
          Redirecting to Sales Nav Scraper in {countdown} second
          {countdown !== 1 ? "s" : ""}...
        </p>
        <Link
          href="/sales-nav-scraper"
          className="inline-block text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
        >
          Go now
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <div className="w-12 h-12 mx-auto bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center">
        <svg
          className="w-6 h-6 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
      <p className="text-white font-medium">Reset failed</p>
      <p className="text-sm text-red-400">{error}</p>
      <Link
        href="/sales-nav-scraper"
        className="inline-block text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
      >
        Go to Sales Nav Scraper
      </Link>
    </div>
  );
}

export default function ResetDailyLimitPage() {
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
            Daily Scraping Limit
          </h2>
        </div>
        <div className="glass-surface py-8 px-6">
          <Suspense
            fallback={
              <div className="flex justify-center">
                <LoadingSpinner size="md" />
              </div>
            }
          >
            <ResetDailyLimitContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
