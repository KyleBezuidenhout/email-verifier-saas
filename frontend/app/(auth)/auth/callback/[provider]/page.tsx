"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export default function OAuthCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setAuthUser } = useAuth();
  const [error, setError] = useState("");
  const exchanged = useRef(false);

  const provider = params.provider as string;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    if (errorParam) {
      if (errorParam === "access_denied") {
        setError("Sign-in was cancelled. Please try again.");
      } else {
        setError(errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, " ")) : "Authentication was denied by the provider.");
      }
      return;
    }

    if (!code || !stateParam) {
      setError("Missing authorization code. Please try signing in again.");
      return;
    }

    (async () => {
      try {
        const response = await apiClient.oauthCallback(provider, code, stateParam);
        setAuthUser(response.user);
        const user = response.user;
        if (!user.company_website) {
          router.replace("/onboarding");
        } else {
          router.replace("/sales-nav-scraper");
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const method = err.detail.toLowerCase().includes("email and password")
            ? "email"
            : err.detail.toLowerCase().includes("google")
            ? "google"
            : err.detail.toLowerCase().includes("microsoft")
            ? "microsoft"
            : "other";
          router.replace(`/login?error=email_exists&method=${method}`);
        } else if (err instanceof ApiError && err.status === 400) {
          setError(err.detail);
        } else {
          setError("Something went wrong during sign-in. Please try again.");
        }
      }
    })();
  }, [code, stateParam, provider, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 relative">
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
        <div className="max-w-md w-full space-y-6 relative z-10">
          <div className="glass-surface py-8 px-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-white font-medium">Sign-in failed</p>
            <p className="text-sm text-gray-400">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="inline-block mt-4 text-sm text-[#0099FF] hover:text-[#0099FF]/80 font-medium"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-gray-400 text-sm">Completing sign-in...</p>
      </div>
    </div>
  );
}
