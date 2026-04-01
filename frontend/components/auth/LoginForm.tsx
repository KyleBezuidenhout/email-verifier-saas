"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Eye, EyeOff } from "lucide-react";
import { OAuthButtons, OAuthDivider } from "@/components/auth/OAuthButtons";
import { ApiError } from "@/lib/api";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const oauthError = searchParams.get("error");
  const oauthMethod = searchParams.get("method");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ email, password, rememberMe });
      router.push("/sales-nav-scraper");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.detail);
      } else {
        setError(err instanceof Error ? err.message : "Invalid email or password");
      }
    } finally {
      setLoading(false);
    }
  };

  const displayError = error || (oauthError === "email_exists" && oauthMethod
    ? `An account with this email already exists${oauthMethod !== "email" ? ` via ${oauthMethod.charAt(0).toUpperCase() + oauthMethod.slice(1)} Sign-In` : ""}. Please sign in with your existing method.`
    : oauthError === "failed" ? "OAuth sign-in failed. Please try again." : "");

  return (
    <div className="space-y-6">
      <OAuthButtons />
      <OAuthDivider />
      <form onSubmit={handleSubmit} className="space-y-6">
      {displayError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {displayError}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="glass-input w-full"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="glass-input w-full pr-10"
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 text-[#0099FF] focus:ring-[#0099FF] border-white/10 rounded bg-white/5"
          />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-400">
            Remember me
          </label>
        </div>

        <Link
          href="/forgot-password"
          className="text-sm text-[#0099FF] hover:text-[#0099FF]/80"
        >
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 border border-dashboard-accent text-dashboard-accent bg-transparent rounded-lg hover:bg-dashboard-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {loading ? <LoadingSpinner size="sm" /> : "Sign in"}
      </button>

      <p className="text-center text-sm text-gray-400">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-[#0099FF] hover:text-[#0099FF]/80 font-medium">
          Sign up
        </Link>
      </p>
    </form>
    </div>
  );
}
