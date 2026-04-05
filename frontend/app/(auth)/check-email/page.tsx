"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  const handleResend = async () => {
    if (!email) return;
    setError("");
    setLoading(true);
    try {
      await apiClient.resendVerification(email);
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-center space-y-4">
      <div className="w-14 h-14 mx-auto bg-[#0099FF]/10 border border-[#0099FF]/20 rounded-full flex items-center justify-center">
        <svg className="w-7 h-7 text-[#0099FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 className="text-white text-lg font-semibold">Check your email</h3>
      <p className="text-sm text-gray-400">
        We sent a confirmation link to{" "}
        {email ? <span className="text-white">{email}</span> : "your email address"}.
        <br />
        Click the link in the email to verify your account.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {resent ? (
        <p className="text-sm text-[#22c55e]">A new verification email has been sent.</p>
      ) : (
        <button
          onClick={handleResend}
          disabled={loading || !email}
          className="w-full bg-white/5 border border-white/10 text-white py-2 px-4 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all text-sm"
        >
          {loading ? <LoadingSpinner size="sm" /> : "Resend verification email"}
        </button>
      )}

      <p className="text-sm text-gray-500 pt-2">
        Didn&apos;t receive the email? Check your spam folder.
      </p>

      <Link
        href="/login"
        className="inline-block text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="glass-surface py-8 px-6">
          <Suspense fallback={<div className="flex justify-center"><LoadingSpinner size="md" /></div>}>
            <CheckEmailContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
