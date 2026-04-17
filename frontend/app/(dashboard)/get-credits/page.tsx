"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/plans";
import { CreditsPlanGrid } from "@/components/pricing/CreditsPlanGrid";
import { apiClient } from "@/lib/api";

const cardStyle = {
  background: "#0a0a0a",
  border: "1px solid rgba(255,255,255,0.12)",
} as const;

export default function GetCreditsPage() {
  const { user } = useAuth();
  const [topUpAmount, setTopUpAmount] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const CREDIT_PRICE = 0.015;

  const userPlan = user?.plan || "trial";
  const planDef = getPlanById(userPlan);

  const creditsFromTopUp = Math.floor(topUpAmount / CREDIT_PRICE);
  const minAmount = 10;
  const maxAmount = 500;

  const handlePurchase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.createTopupCheckout(topUpAmount);
      window.location.href = response.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout session");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* PRICING PLANS SECTION */}
      <section className="px-6 lg:px-8 py-16">
        <div className="max-w-7xl mx-auto">
          {/* Universal Policy Statement */}
          <p className="text-center text-white text-lg font-medium mb-12">
            1 Credit = 1 Email Found.
          </p>
          <CreditsPlanGrid
            currentPlanId={userPlan}
            subscriptionStatus={user?.subscription_status}
            manageUrl={user?.manage_url}
          />
        </div>
      </section>

      {/* TOP UP SECTION */}
      <section className="px-6 lg:px-8 py-16 border-t border-dashboard-border">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-dashboard-text mb-4">
              Top Up
            </h2>
            <p className="text-dashboard-text-muted text-lg">
              Make a one-time credit purchase to top up your account.
            </p>
          </div>

          {/* Top Up Card */}
          <div className="relative rounded-2xl p-px bg-gradient-to-b from-white/[0.15] via-white/[0.05] to-transparent overflow-hidden">
            <div
              className="relative rounded-[15px] p-6 lg:p-8"
              style={cardStyle}
            >
              {/* Amount Display */}
              <div className="text-center mb-8">
                <div className="text-5xl font-bold text-dashboard-text mb-2">
                  ${topUpAmount.toLocaleString()}
                </div>
                <div className="text-dashboard-accent font-semibold text-lg">
                  = {creditsFromTopUp.toLocaleString()} Credits
                </div>
              </div>

              {/* Slider */}
              <div className="relative mb-8 max-w-md mx-auto">
                <input
                  type="range"
                  min={minAmount}
                  max={maxAmount}
                  step={5}
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(Number(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #0099FF 0%, #0099FF ${((topUpAmount - minAmount) / (maxAmount - minAmount)) * 100}%, #1E2228 ${((topUpAmount - minAmount) / (maxAmount - minAmount)) * 100}%, #1E2228 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-dashboard-text-muted mt-2">
                  <span>${minAmount}</span>
                  <span>${maxAmount}</span>
                </div>
              </div>

              {/* Price Info */}
              <div className="text-center mb-6">
                <p className="text-dashboard-text-muted text-sm">
                  Price per email found: <span className="text-dashboard-text">${CREDIT_PRICE.toFixed(3)}</span>
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center max-w-md mx-auto">
                  {error}
                </div>
              )}

              {/* Purchase Button */}
              <div className="text-center">
                <button
                  onClick={handlePurchase}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center border border-dashboard-accent text-dashboard-accent bg-transparent hover:bg-dashboard-accent/10 transition-colors font-semibold py-4 px-8 rounded-lg text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Redirecting...
                    </span>
                  ) : (
                    `Purchase ${creditsFromTopUp.toLocaleString()} Credits`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
