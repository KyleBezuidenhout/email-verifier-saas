"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

const pricingPlans = [
  {
    name: "Freelance",
    subtitle: "Individual professionals",
    description: "Perfect for solo operators",
    monthlyPrice: 297,
    features: [
      "Scrape leads at $2 per 1,000",
      "Find 2,500 emails per hour",
      "Find 130k+ valid emails daily",
      "Uncapped verification",
      "24hr Email Support",
    ],
    highlighted: false,
    extras: [],
  },
  {
    name: "Starter",
    subtitle: "Growing teams",
    description: "Scale your outreach",
    monthlyPrice: 497,
    features: [
      "Scrape leads at $2 per 1,000",
      "Find 5,000 emails per hour",
      "Find over 250k+ valid email addresses daily (just need full name & website)",
      "Uncapped verification",
      "> 60-minute Email Support",
    ],
    highlighted: false,
    extras: ["Enterprise Sales Nav Seat"],
  },
  {
    name: "Agency",
    subtitle: "High-volume teams",
    description: "Maximize your pipeline",
    monthlyPrice: 997,
    features: [
      "Scrape leads at $2 per 1,000",
      "Find 10,000 emails per hour",
      "Find over 500k+ valid email addresses daily (just need full name & website)",
      "Uncapped verification",
      "> 60-minute Email Support",
      "API Access",
    ],
    highlighted: true,
    extras: ["Enterprise Sales Nav Seat"],
  },
  {
    name: "Enterprise",
    subtitle: "Large scale operations",
    description: "Unlimited potential",
    monthlyPrice: 1497,
    features: [
      "Scrape leads at $2 per 1,000",
      "Find 20,000 emails per hour",
      "Find over 1M+ valid email addresses daily (just need full name & website)",
      "Uncapped verification",
      "> Priority Email Support",
      "API Access",
    ],
    highlighted: false,
    extras: ["Enterprise Sales Nav Seat", "Prewarmed LinkedIn Account"],
  },
];

export default function GetCreditsPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(50);
  const CREDIT_PRICE = 0.004; // $0.004 per credit
  
  // Calculate credits based on dollar amount
  const creditsFromTopUp = Math.floor(topUpAmount / CREDIT_PRICE);

  // Slider values: $10 to $500
  const minAmount = 10;
  const maxAmount = 500;

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-6 lg:px-8 py-8 border-b border-dashboard-border">
        <h1 className="text-3xl font-bold text-dashboard-text">Get More Credits</h1>
        <p className="text-dashboard-text-muted mt-2">
          Top up your credits or upgrade to a plan for better value.
        </p>
      </div>

      {/* TOP UP SECTION */}
      <section className="px-6 lg:px-8 py-12 border-b border-dashboard-border">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
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
          </div>

          {/* Top Up Card */}
          <div className="relative glass-card p-8 overflow-hidden">
            {/* Decorative gradient */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-dashboard-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              {/* Left: Slider Section */}
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

                {/* Custom Slider */}
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

                {/* Buy Button */}
                <button className="w-full py-4 px-6 bg-dashboard-accent text-white font-semibold rounded-xl hover:bg-dashboard-accent/90 transition-all duration-300 shadow-lg shadow-dashboard-accent/20 hover:shadow-dashboard-accent/40">
                  Purchase {creditsFromTopUp.toLocaleString()} Credits
                </button>
              </div>

              {/* Right: Credit Info */}
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
                      <div className="text-dashboard-text font-semibold">1× Scrape</div>
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
                      <div className="text-dashboard-text font-semibold">1× Enrichment</div>
                      <div className="text-dashboard-text-muted text-sm">= 1 Credit</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dashboard-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dashboard-text-muted">Price per credit</span>
                    <span className="text-dashboard-accent font-semibold">${CREDIT_PRICE.toFixed(3)}</span>
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
          {/* Section Header */}
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-dashboard-text mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-dashboard-text-muted text-lg max-w-2xl mx-auto mb-10">
              Choose the plan that fits your needs. Scale up anytime.
            </p>
            
            {/* Annual/Monthly Toggle */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setIsAnnual(false)}
                className={`relative flex items-center gap-3 px-1 py-1 rounded-full transition-all duration-300 ${
                  !isAnnual ? "text-dashboard-text" : "text-dashboard-text-muted"
                }`}
              >
                <div
                  className={`w-14 h-8 rounded-full transition-all duration-300 cursor-pointer flex items-center ${
                    isAnnual ? "bg-dashboard-accent" : "bg-dashboard-card"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAnnual(!isAnnual);
                  }}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 mx-1 ${
                      isAnnual ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </div>
                <span className={`font-medium transition-colors ${isAnnual ? "text-dashboard-text" : "text-dashboard-text-muted"}`}>
                  Annual billing
                </span>
                <span className="text-dashboard-accent font-medium">(2 months free)</span>
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5">
            {pricingPlans.map((plan, index) => {
              const displayPrice = isAnnual ? plan.monthlyPrice * 10 : plan.monthlyPrice;
              
              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col p-6 lg:p-8 glass-card transition-all duration-300 animate-fade-in ${
                    plan.highlighted
                      ? "border-dashboard-accent shadow-lg shadow-dashboard-accent/10"
                      : "hover:border-dashboard-border-light"
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Plan Header */}
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-dashboard-text mb-1">
                      {plan.name}
                    </h3>
                    <p className="text-dashboard-text-muted text-sm mb-1">{plan.subtitle}</p>
                    <p className="text-dashboard-text/70 text-sm">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="text-center mb-6">
                    <div className="flex items-baseline justify-center">
                      <span className={`text-4xl lg:text-5xl font-bold ${plan.highlighted ? "text-dashboard-accent" : "text-dashboard-text"}`}>
                        ${displayPrice.toLocaleString()}
                      </span>
                      <span className="text-dashboard-text-muted text-base ml-1">
                        /{isAnnual ? "yr" : "mo"}
                      </span>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <Link
                    href="/register"
                    className={`w-full py-3 px-6 font-semibold text-center transition-all duration-300 mb-8 rounded-lg ${
                      plan.highlighted
                        ? "bg-dashboard-accent text-white hover:bg-dashboard-accent/90 shadow-lg shadow-dashboard-accent/20"
                        : "bg-transparent border border-dashboard-border text-dashboard-text hover:border-dashboard-accent hover:text-dashboard-accent"
                    }`}
                  >
                    Get started
                  </Link>

                  {/* Divider */}
                  <div className="border-t border-dashboard-border mb-6" />

                  {/* Features List */}
                  <div className="flex-1">
                    <p className="text-dashboard-text font-semibold text-sm mb-4">
                      What&apos;s included
                    </p>
                    <ul className="space-y-3">
                      {plan.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-dashboard-accent flex-shrink-0 mt-0.5" />
                          <span className="text-dashboard-text text-sm leading-relaxed">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    
                    {/* Extras */}
                    {plan.extras.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-dashboard-border/50">
                        {plan.extras.map((extra, extraIndex) => (
                          <div key={extraIndex} className="flex items-center gap-2 text-dashboard-accent text-sm font-medium">
                            <span>+</span>
                            <span>{extra}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
