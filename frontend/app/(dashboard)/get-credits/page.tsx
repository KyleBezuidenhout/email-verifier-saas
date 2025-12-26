"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

// Integration data with image URLs
const integrations = [
  {
    name: "Clay",
    image: "https://i.ibb.co/5g8S3CKS/clay-logo-transparent.png",
    style: { top: "10%", left: "20%" },
    svgPos: { x: 100, y: 50 },
  },
  {
    name: "Salesforce",
    image: "https://i.ibb.co/7JzG4fv9/salesforce-logo-transparent.png",
    style: { top: "10%", right: "20%" },
    svgPos: { x: 400, y: 50 },
  },
  {
    name: "LinkedIn",
    image: "https://i.ibb.co/Q3pQFHg7/Linkedin-logo-transparent.png",
    style: { top: "50%", left: "5%", transform: "translateY(-50%)" },
    svgPos: { x: 40, y: 200 },
  },
  {
    name: "Smartlead",
    image: "https://i.ibb.co/PGnz9qDX/Smartlead-logo-transparent.png",
    style: { top: "50%", right: "5%", transform: "translateY(-50%)" },
    svgPos: { x: 460, y: 200 },
  },
  {
    name: "Instantly",
    image: "https://i.ibb.co/60PSSXJf/instantly-logo-transparent.png",
    style: { bottom: "10%", left: "20%" },
    svgPos: { x: 100, y: 350 },
  },
  {
    name: "Plusvibe",
    image: "https://i.ibb.co/7JV2m8Bn/plusvibe-logo-transparent.png",
    style: { bottom: "10%", right: "20%" },
    svgPos: { x: 400, y: 350 },
  },
];

// SVG helper functions for integration lines
function getPerpendicularOffset(x1: number, y1: number, x2: number, y2: number, offset: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const px = -dy / length;
  const py = dx / length;
  return { px: px * offset, py: py * offset };
}

function getShortenedEndpoint(x1: number, y1: number, x2: number, y2: number, shortenBy: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const ratio = (length - shortenBy) / length;
  return {
    x: x1 + dx * ratio,
    y: y1 + dy * ratio,
  };
}

function ConnectionLines({ x1, y1, x2, y2, offset = 2.5, shortenEnd = 35 }: { x1: number; y1: number; x2: number; y2: number; offset?: number; shortenEnd?: number }) {
  const { px, py } = getPerpendicularOffset(x1, y1, x2, y2, offset);
  const shortened = getShortenedEndpoint(x1, y1, x2, y2, shortenEnd);
  
  return (
    <>
      <line x1={x1 - px} y1={y1 - py} x2={shortened.x - px} y2={shortened.y - py} stroke="rgba(0, 163, 255, 0.25)" strokeWidth="2" strokeLinecap="round" />
      <line x1={x1 + px} y1={y1 + py} x2={shortened.x + px} y2={shortened.y + py} stroke="rgba(0, 163, 255, 0.25)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function EnergyBeam({ x1, y1, x2, y2, delay = 0, id, lineOffset = 2.5, shortenEnd = 35 }: { x1: number; y1: number; x2: number; y2: number; delay?: number; id: string; lineOffset?: number; shortenEnd?: number }) {
  const beamWidth = lineOffset * 1.5;
  const shortened = getShortenedEndpoint(x1, y1, x2, y2, shortenEnd);
  
  return (
    <>
      <defs>
        <linearGradient id={`beam-gradient-${id}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={shortened.x} y2={shortened.y}>
          <stop offset="0%" stopColor="#00A3FF" stopOpacity="0">
            <animate attributeName="offset" values="-0.3;0.7;1.3" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
          </stop>
          <stop offset="15%" stopColor="#00A3FF" stopOpacity="1">
            <animate attributeName="offset" values="-0.15;0.85;1.45" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
          </stop>
          <stop offset="30%" stopColor="#00A3FF" stopOpacity="0">
            <animate attributeName="offset" values="0;1;1.6" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <line x1={x1} y1={y1} x2={shortened.x} y2={shortened.y} stroke={`url(#beam-gradient-${id})`} strokeWidth={beamWidth} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 10px rgba(0, 163, 255, 1))" }} />
    </>
  );
}

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

  const centerX = 250;
  const centerY = 200;

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

      {/* INTEGRATIONS SECTION */}
      <section className="py-16 relative overflow-hidden border-t border-dashboard-border">
        {/* Subtle gradient overlay for depth */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.3) 100%)",
          }}
        />
        
        {/* Radial glow behind diagram */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(0, 153, 255, 0.06) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-16 lg:mb-20">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-dashboard-text leading-[1.1] tracking-tight mb-6">
              Single-Step <span className="text-dashboard-accent">Integration</span>
            </h2>
            <p className="text-lg md:text-xl text-dashboard-text-muted max-w-2xl mx-auto leading-relaxed">
              Seamlessly integrate With All Your Favorite Tools
            </p>
          </div>

          {/* Hub and Spoke Diagram */}
          <div className="relative w-full max-w-[500px] h-[400px] mx-auto">
            {/* SVG Connection Lines */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none" 
              viewBox="0 0 500 400"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Base connection lines */}
              <g>
                {integrations.map((integration, index) => (
                  <ConnectionLines 
                    key={`lines-${index}`}
                    x1={centerX} 
                    y1={centerY} 
                    x2={integration.svgPos.x} 
                    y2={integration.svgPos.y}
                  />
                ))}
              </g>

              {/* Animated energy beams */}
              <g>
                {integrations.map((integration, index) => (
                  <EnergyBeam 
                    key={`beam-${index}`}
                    x1={centerX} 
                    y1={centerY} 
                    x2={integration.svgPos.x} 
                    y2={integration.svgPos.y} 
                    delay={index * 0.25} 
                    id={`beam${index}`}
                  />
                ))}
              </g>
            </svg>

            {/* Center Hub */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <div 
                className="relative glass-card px-10 py-6 shadow-2xl border-dashboard-accent/30"
                style={{
                  boxShadow: "0 4px 30px rgba(0, 0, 0, 0.5), 0 0 60px rgba(0, 163, 255, 0.3)",
                }}
              >
                <div 
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(0, 163, 255, 0.1) 0%, rgba(0, 0, 0, 0) 50%, rgba(0, 163, 255, 0.05) 100%)",
                  }}
                />
                <div className="relative">
                  <span className="block text-xl font-bold text-dashboard-accent tracking-wide leading-tight text-center">
                    BillionVerifier
                  </span>
                </div>
              </div>
            </div>

            {/* Integration Icons */}
            {integrations.map((integration, index) => (
              <div
                key={integration.name}
                className="absolute z-10 w-[72px] h-[72px]"
                style={{
                  ...integration.style,
                  animationDelay: `${index * 0.1}s`,
                }}
              >
                <div 
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: "rgba(0, 0, 0, 0.8)",
                    transform: "translateY(8px) translateZ(-10px)",
                    filter: "blur(12px)",
                  }}
                />
                <div 
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: "rgba(0, 0, 0, 0.5)",
                    transform: "translateY(4px)",
                    filter: "blur(6px)",
                  }}
                />
                <div 
                  className="group relative w-full h-full rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 hover:-translate-y-1 cursor-pointer overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, #2a3240 0%, #1a2028 50%, #151a20 100%)",
                    boxShadow: `
                      0 12px 40px rgba(0, 0, 0, 0.8),
                      0 6px 20px rgba(0, 0, 0, 0.6),
                      0 0 30px rgba(0, 163, 255, 0.15),
                      inset 0 1px 0 rgba(255, 255, 255, 0.08),
                      inset 0 -2px 10px rgba(0, 0, 0, 0.3)
                    `,
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    transform: "translateZ(20px)",
                  }}
                >
                  <div 
                    className="absolute top-0 left-2 right-2 h-[1px] rounded-full"
                    style={{
                      background: "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%)",
                    }}
                  />
                  <div 
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      boxShadow: "inset 0 0 20px rgba(0, 163, 255, 0.12)",
                    }}
                  />
                  <div 
                    className="absolute top-1 left-1 w-3 h-3 rounded-tl-xl"
                    style={{
                      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 60%)",
                    }}
                  />
                  <div 
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      boxShadow: "0 0 40px rgba(0, 163, 255, 0.7), 0 20px 50px rgba(0, 0, 0, 0.8)",
                    }}
                  />
                  <img 
                    src={integration.image} 
                    alt={integration.name}
                    className="relative w-10 h-10 object-contain transform group-hover:scale-110 transition-transform duration-300 drop-shadow-lg"
                    style={{
                      filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))",
                    }}
                  />
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                    <div className="glass-card px-3 py-1.5 whitespace-nowrap">
                      <span className="text-sm font-medium text-dashboard-text">{integration.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
