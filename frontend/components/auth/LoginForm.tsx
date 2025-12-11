"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ email, password, rememberMe });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-apple-error/20 border border-apple-error/30 text-apple-error px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-apple-text mb-2">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-apple-text mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 text-apple-accent focus:ring-apple-accent border-apple-border rounded bg-apple-surface"
          />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-apple-text-muted">
            Remember me
          </label>
        </div>

        <Link
          href="/forgot-password"
          className="text-sm text-apple-accent hover:text-apple-accent/80"
        >
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-apple-accent text-white py-2 px-4 rounded-lg hover:bg-apple-accent/90 focus:outline-none focus:ring-2 focus:ring-apple-accent focus:ring-offset-2 focus:ring-offset-apple-bg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
      >
        {loading ? <LoadingSpinner size="sm" /> : "Sign in"}
      </button>

      <p className="text-center text-sm text-apple-text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-apple-accent hover:text-apple-accent/80 font-medium">
          Sign up
        </Link>
      </p>
    </form>
  );
}

