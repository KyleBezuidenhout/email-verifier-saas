"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export function RegisterForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    company_name: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: "" };
    if (password.length < 6) return { strength: 1, label: "Weak" };
    if (password.length < 10) return { strength: 2, label: "Medium" };
    return { strength: 3, label: "Strong" };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (!acceptTerms) {
      setError("You must accept the terms of service");
      return;
    }

    setLoading(true);

    try {
      await register({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        company_name: formData.company_name || undefined,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
        <label htmlFor="full_name" className="block text-sm font-medium text-apple-text mb-2">
          Full Name
        </label>
        <input
          id="full_name"
          type="text"
          required
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="John Doe"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-apple-text mb-2">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="company_name" className="block text-sm font-medium text-apple-text mb-2">
          Company Name <span className="text-apple-text-muted">(optional)</span>
        </label>
        <input
          id="company_name"
          type="text"
          value={formData.company_name}
          onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="Acme Inc."
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
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="••••••••"
        />
        {formData.password && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-apple-surface-hover rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    passwordStrength.strength === 1
                      ? "bg-apple-error w-1/3"
                      : passwordStrength.strength === 2
                      ? "bg-apple-warning w-2/3"
                      : "bg-apple-success w-full"
                  }`}
                />
              </div>
              <span className="text-xs text-apple-text-muted">{passwordStrength.label}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-apple-text mb-2">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          className="w-full px-4 py-2 bg-apple-surface border border-apple-border text-apple-text placeholder-apple-text-muted rounded-lg focus:ring-2 focus:ring-apple-accent focus:border-apple-accent focus:outline-none"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center">
        <input
          id="terms"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="h-4 w-4 text-apple-accent focus:ring-apple-accent border-apple-border rounded bg-apple-surface"
        />
        <label htmlFor="terms" className="ml-2 block text-sm text-apple-text-muted">
          I agree to the{" "}
          <Link href="/terms" className="text-apple-accent hover:text-apple-accent/80">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-apple-accent hover:text-apple-accent/80">
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-apple-accent text-white py-2 px-4 rounded-lg hover:bg-apple-accent/90 focus:outline-none focus:ring-2 focus:ring-apple-accent focus:ring-offset-2 focus:ring-offset-apple-bg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
      >
        {loading ? <LoadingSpinner size="sm" /> : "Create account"}
      </button>

      <p className="text-center text-sm text-apple-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-apple-accent hover:text-apple-accent/80 font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}

