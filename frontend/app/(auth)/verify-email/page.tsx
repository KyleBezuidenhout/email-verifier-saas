"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (!token || verifiedRef.current) return;
    verifiedRef.current = true;

    const verify = async () => {
      try {
        const response = await apiClient.verifyEmail(token);
        setSuccess(true);
        const user = response.user;
        const dest = (!user.onboarding_completed)
          ? "/onboarding"
          : (localStorage.getItem("bv_post_auth_redirect") || "/dashboard");
        if (user.onboarding_completed) localStorage.removeItem("bv_post_auth_redirect");
        setTimeout(() => router.push(dest), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed. The link may have expired.");
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token, router]);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-400 text-sm">Invalid verification link. No token was provided.</p>
        <Link
          href="/register"
          className="inline-block text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
        >
          Create a new account
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center space-y-4">
        <LoadingSpinner size="md" />
        <p className="text-gray-400 text-sm">Verifying your email...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-[#22c55e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-white font-medium">Email verified successfully</p>
        <p className="text-sm text-gray-400">Redirecting you to the dashboard...</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <div className="w-12 h-12 mx-auto bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center">
        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <p className="text-white font-medium">Verification failed</p>
      <p className="text-sm text-red-400">{error}</p>
      <Link
        href="/register"
        className="inline-block text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
      >
        Try signing up again
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Email verification
          </h2>
        </div>
        <div className="glass-surface py-8 px-6">
          <Suspense fallback={<div className="flex justify-center"><LoadingSpinner size="md" /></div>}>
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
