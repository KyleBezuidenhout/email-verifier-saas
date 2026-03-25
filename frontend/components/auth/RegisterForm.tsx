"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

// Personal email domains that are blocked (except gmail.com which is allowed)
const BLOCKED_EMAIL_DOMAINS = [
  // Apple
  "icloud.com", "me.com", "mac.com",
  // Microsoft
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  // Yahoo
  "yahoo.com", "ymail.com",
  // Other personal providers
  "aol.com", "protonmail.com", "proton.me",
  "zoho.com", "mail.com", "gmx.com", "gmx.net",
  "inbox.com", "fastmail.com",
  // ISP emails
  "att.net", "verizon.net", "comcast.net", "cox.net",
  "sbcglobal.net", "bellsouth.net", "earthlink.net",
];

const isEmailAllowed = (email: string): boolean => {
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;
  
  // Gmail is explicitly allowed
  if (domain === "gmail.com") return true;
  
  // Check if domain is in blocked list
  return !BLOCKED_EMAIL_DOMAINS.includes(domain);
};

export function RegisterForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    company_website: "",
    referral_source: "",
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

    if (!isEmailAllowed(formData.email)) {
      setError("Please Enter A Company Email");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    const wordCount = formData.referral_source.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 20) {
      setError("Referral answer must be 20 words or less");
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
        company_website: formData.company_website,
        referral_source: formData.referral_source,
      });
      router.push("/check-email?email=" + encodeURIComponent(formData.email));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-white mb-2">
          Full Name
        </label>
        <input
          id="full_name"
          type="text"
          required
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="glass-input w-full"
          placeholder="John Doe"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="glass-input w-full"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="company_website" className="block text-sm font-medium text-white mb-2">
          Company Website
        </label>
        <input
          id="company_website"
          type="url"
          required
          value={formData.company_website}
          onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
          className="glass-input w-full"
          placeholder="https://yourcompany.com"
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
          value={formData.referral_source}
          onChange={(e) => setFormData({ ...formData, referral_source: e.target.value })}
          className="glass-input w-full"
          placeholder="John from Twitter, Google search, etc."
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="glass-input w-full"
          placeholder="••••••••"
        />
        {formData.password && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white/5 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    passwordStrength.strength === 1
                      ? "bg-red-500 w-1/3"
                      : passwordStrength.strength === 2
                      ? "bg-yellow-500 w-2/3"
                      : "bg-green-500 w-full"
                  }`}
                />
              </div>
              <span className="text-xs text-gray-400">{passwordStrength.label}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center">
        <input
          id="terms"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="h-4 w-4 text-[#0099FF] focus:ring-[#0099FF] border-white/10 rounded bg-white/5"
        />
        <label htmlFor="terms" className="ml-2 block text-sm text-gray-400">
          I agree to the{" "}
          <Link href="/terms" className="text-[#0099FF] hover:text-[#0099FF]/80">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-[#0099FF] hover:text-[#0099FF]/80">
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !acceptTerms}
        className="w-full bg-[#0099FF] text-white py-2 px-4 rounded-lg hover:bg-[#0099FF]/90 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all"
        style={{ boxShadow: '0 0 20px rgba(0, 153, 255, 0.2)' }}
      >
        {loading ? <LoadingSpinner size="sm" /> : "Create account"}
      </button>

      <p className="text-center text-sm text-gray-400">
        Already have an account?{" "}
        <Link href="/login" className="text-[#0099FF] hover:text-[#0099FF]/80 font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
