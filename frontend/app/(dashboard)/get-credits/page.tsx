"use client";

import { useState, useMemo } from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getPlanById, formatCredits } from "@/lib/plans";
import { PricingSlider } from "@/components/pricing/PricingSlider";

export default function GetCreditsPage() {
  const { user } = useAuth();
  const [topUpAmount, setTopUpAmount] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userPlan = user?.plan || "trial";
  const planDef = getPlanById(userPlan);
  const trialFallbackPrice = 0.0022;
  const creditPrice = user?.custom_credit_price ?? planDef?.creditPrice ?? trialFallbackPrice;
  const isTrialPlan = userPlan === "trial";
  const isCustomMissingPrice = userPlan === "custom" && !user?.custom_credit_price;

  const creditsFromTopUp = useMemo(
    () => (creditPrice > 0 ? Math.round(topUpAmount / creditPrice) : 0),
    [topUpAmount, creditPrice],
  );

  const minAmount = 10;
  const maxAmount = 500;

  const handlePurchase = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.createCheckoutSession(topUpAmount);
      window.location.href = response.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout session");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Plan Banner */}
      <div className="px-6 lg:px-8 py-8 border-b border-dashboard-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-dashboard-text">Get More Credits</h1>
            <p className="text-dashboard-text-muted mt-2">
              Top up your credits or upgrade your plan for better rates.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 rounded-full text-sm font-semibold bg-dashboard-accent/10 text-dashboard-accent border border-dashboard-accent/20">
              {planDef?.name ?? "Trial"} Plan
            </span>
            {user && (
              <span className="text-dashboard-text-muted text-sm">
                {formatCredits(user.credits)} credits
              </span>
            )}
          </div>
        </div>
      </div>

      {/* TOP UP SECTION */}
      <section className="px-6 lg:px-8 py-12 border-b border-dashboard-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-dashboard-accent/10 border border-dashboard-accent/20 mb-4">
              <svg className="w-5 h-5 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-dashboard-accent font-semibold">Top Up</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-dashboard-text mb-2">
              Instant Credit <span className="text-dashboard-accent">Top Up</span>
            </h2>
            <p className="text-dashboard-text-muted">
              Pay only for what you need. Credits never expire.
            </p>
            <p className="text-dashboard-text-muted text-sm mt-1">
              You&apos;ll be charged at your <span className="text-dashboard-accent font-medium">{planDef?.name ?? "Trial"}</span> rate of{" "}
              <span className="text-dashboard-accent font-medium">${creditPrice.toFixed(4)}</span> per credit
            </p>
          </div>

          <div className="relative glass-card p-8 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-dashboard-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              {/* Left: Slider */}
              <div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-dashboard-text-muted mb-2">
                    Select Amount
                  </label>
                  <div className="text-5xl font-bold text-dashboard-text mb-2">
                    ${topUpAmount.toLocaleString()}
                  </div>
                  <div className="text-dashboard-accent font-semibold">
                    = {creditsFromTopUp.toLocaleString()} Credits
                  </div>
                </div>

                <div className="relative mb-8">
                  <input
                    type="range"
                    min={minAmount}
                    max={maxAmount}
                    step={5}
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(Number(e.target.value))}
                    className="w-full h-3 rounded-full appearance-none cursor-pointer bg-dashboard-card"
                    style={{
                      background: `linear-gradient(to right, #0099FF 0%, #0099FF ${((topUpAmount - minAmount) / (maxAmount - minAmount)) * 100}%, #1E2228 ${((topUpAmount - minAmount) / (maxAmount - minAmount)) * 100}%, #1E2228 100%)`,
                    }}
                  />
                  <style jsx>{`
                    input[type="range"]::-webkit-slider-thumb {
                      appearance: none;
                      width: 24px;
                      height: 24px;
                      border-radius: 50%;
                      background: #0099FF;
                      cursor: pointer;
                      box-shadow: 0 0 20px rgba(0, 153, 255, 0.5);
                      border: 3px solid #fff;
                    }
                    input[type="range"]::-moz-range-thumb {
                      width: 24px;
                      height: 24px;
                      border-radius: 50%;
                      background: #0099FF;
                      cursor: pointer;
                      box-shadow: 0 0 20px rgba(0, 153, 255, 0.5);
                      border: 3px solid #fff;
                    }
                  `}</style>
                  <div className="flex justify-between text-xs text-dashboard-text-muted mt-2">
                    <span>${minAmount}</span>
                    <span>${maxAmount}</span>
                  </div>
                </div>

                {isCustomMissingPrice && (
                  <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                    Your custom plan credit price has not been configured yet. Please contact support before purchasing.
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handlePurchase}
                  disabled={isLoading || isCustomMissingPrice}
                  className="w-full py-4 px-6 bg-dashboard-accent text-white font-semibold rounded-xl hover:bg-dashboard-accent/90 transition-all duration-300 shadow-lg shadow-dashboard-accent/20 hover:shadow-dashboard-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Redirecting to checkout...
                    </span>
                  ) : (
                    `Purchase ${creditsFromTopUp.toLocaleString()} Credits`
                  )}
                </button>
              </div>

              {/* Right: Credit Usage Info */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-dashboard-text mb-4">Credit Usage</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg glass-card-hover">
                    <div className="w-12 h-12 rounded-xl bg-dashboard-accent/10 flex items-center justify-center">
                      <svg className="w-6 h-6 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-dashboard-text font-semibold">1× Sales Nav Scrape</div>
                      <div className="text-dashboard-text-muted text-sm">= 1 Credit</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 rounded-lg glass-card-hover">
                    <div className="w-12 h-12 rounded-xl bg-dashboard-accent/10 flex items-center justify-center">
                      <svg className="w-6 h-6 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-dashboard-text font-semibold">1× Enrichment / Verification</div>
                      <div className="text-dashboard-text-muted text-sm">
                        {isTrialPlan ? "= 0.5 Credits" : (
                          <span className="text-green-400 font-medium">Free (Uncapped)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dashboard-border space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dashboard-text-muted">Price per credit</span>
                    <span className="text-dashboard-accent font-semibold">${creditPrice.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dashboard-text-muted">Your plan</span>
                    <span className="text-dashboard-text font-semibold">{planDef?.name ?? "Trial"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING PLANS SECTION */}
      <section className="px-6 lg:px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <PricingSlider variant="dashboard" />
        </div>
      </section>
    </div>
  );
}
