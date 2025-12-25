"use client";

import { useState } from "react";
import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { DataVisualization } from "./DataVisualization";
import { Check, Users, Sparkles, ShieldCheck } from "lucide-react";

const howItWorksSteps = [
  {
    icon: Users,
    title: "Sales Nav Scraper",
    features: [
      "Extract up to 15,000 profiles daily",
      "Each profile includes 35 columns of data",
      "Extract more than 20k profiles daily (customizable)",
    ],
    highlighted: false,
  },
  {
    icon: Sparkles,
    title: "Enrich",
    features: [
      "Find up to 800M Valid Emails",
      "Find emails with 70-98% accuracy",
      "Enrich scraped lists, or upload a csv with full name & website",
    ],
    highlighted: true,
  },
  {
    icon: ShieldCheck,
    title: "Verify",
    features: [
      "Uncapped email verification on all paid plans",
      "Sub 3% Bounce Rate Guaranteed",
      "Built-in Catchall verification",
    ],
    highlighted: false,
  },
];

export function MarketingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

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

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1">
        {/* SECTION 1: Hero Section */}
        <section className="relative min-h-screen flex flex-col bg-[#0D0F12] bg-blueprint-grid pt-20">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

          <div className="relative flex-1 flex items-center max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left - Text content */}
              <div className="animate-fade-in-up">
                <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-landing-heading leading-[1.1] tracking-tight mb-6">
                  Stop Renting Leads.
                  <br />
                  <span className="text-landing-accent">
                    Start Owning Your Pipeline.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-landing-text leading-relaxed mb-10 max-w-xl">
                  The first and only platform that consolidates scraping, 
                  enrichment, and multi-layer verification into a dedicated 
                  engine that&apos;s exclusively yours.
                </p>

                <Link
                  href="/register"
                  className="inline-flex items-center gap-3 bg-landing-accent text-landing-bg px-8 py-4 font-semibold text-base tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
                >
                  Get Free Credits
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </Link>
              </div>

              {/* Right - Data visualization */}
              <div className="animate-fade-in-delay-2">
                <DataVisualization />
              </div>
            </div>
          </div>

          {/* Integrations Bar - at bottom of hero */}
          <div className="relative pb-8 lg:pb-12">
            <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
              <p className="text-landing-muted text-sm uppercase tracking-wider mb-6">
                Single-Step Integration
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
                <div className="flex items-center gap-2 text-landing-text/60 hover:text-landing-text transition-colors">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  <span className="font-medium">Salesforce</span>
                </div>
                <div className="flex items-center gap-2 text-landing-text/60 hover:text-landing-text transition-colors">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  <span className="font-medium">HubSpot</span>
                </div>
                <div className="flex items-center gap-2 text-landing-text/60 hover:text-landing-text transition-colors">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="font-medium">Zapier</span>
                </div>
                <div className="flex items-center gap-2 text-landing-text/60 hover:text-landing-text transition-colors">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  <span className="font-medium">Outreach</span>
                </div>
                <div className="flex items-center gap-2 text-landing-text/60 hover:text-landing-text transition-colors">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                  </svg>
                  <span className="font-medium">Slack</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Trust Bar */}
        <section className="bg-[#121418] border-y border-landing-border py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            {/* Feature Cards */}
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {/* Card 1: Unmatched Pricing */}
              <div className="group relative bg-gradient-to-br from-[#1a1d24] to-[#14161a] rounded-2xl p-8 border border-landing-border hover:border-landing-accent/40 transition-all duration-300 hover:shadow-[0_0_40px_rgba(0,163,255,0.15)]">
                <div className="absolute inset-0 bg-gradient-to-br from-landing-accent/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-xl bg-landing-accent/10 border border-landing-accent/20 flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-landing-heading mb-3">
                    Unmatched Pricing
                  </h3>
                  <p className="text-landing-muted leading-relaxed">
                    Scrape Leads at <span className="text-landing-accent font-semibold">$2 per 1,000 leads</span>
                    <span className="block text-sm mt-1 text-landing-muted/70">[$0.002 per profile]</span>
                  </p>
                </div>
              </div>

              {/* Card 2: 800M+ */}
              <div className="group relative bg-gradient-to-br from-[#1a1d24] to-[#14161a] rounded-2xl p-8 border border-landing-border hover:border-landing-accent/40 transition-all duration-300 hover:shadow-[0_0_40px_rgba(0,163,255,0.15)]">
                <div className="absolute inset-0 bg-gradient-to-br from-landing-accent/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-xl bg-landing-accent/10 border border-landing-accent/20 flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-landing-heading mb-3">
                    <span className="text-landing-accent">800M+</span>
                  </h3>
                  <p className="text-landing-muted leading-relaxed">
                    Get access to over <span className="text-landing-text font-medium">800M valid B2B Emails</span>
                  </p>
                </div>
              </div>

              {/* Card 3: 99%+ Accuracy */}
              <div className="group relative bg-gradient-to-br from-[#1a1d24] to-[#14161a] rounded-2xl p-8 border border-landing-border hover:border-landing-accent/40 transition-all duration-300 hover:shadow-[0_0_40px_rgba(0,163,255,0.15)]">
                <div className="absolute inset-0 bg-gradient-to-br from-landing-accent/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-xl bg-landing-accent/10 border border-landing-accent/20 flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-landing-heading mb-3">
                    <span className="text-landing-accent">99%+</span> Accuracy
                  </h3>
                  <p className="text-landing-muted leading-relaxed">
                    All Leads are verified twice, we guarantee a <span className="text-landing-text font-medium">sub 3% bounce rate</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: How It Works */}
        <section className="bg-[#0D0F12] py-24 lg:py-32 relative">
          <div className="absolute inset-0 bg-blueprint-grid opacity-30 pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center mb-16 lg:mb-20 animate-fade-in">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-heading leading-[1.1] tracking-tight mb-6">
                How{" "}
                <span className="text-landing-accent">BillionVerifier</span>{" "}
                Works
              </h2>
              <p className="text-lg md:text-xl text-landing-muted max-w-2xl mx-auto">
                Build your lead pipeline in three simple steps. Scrape, enrich,
                and verify—all in one platform.
              </p>
            </div>

            {/* Step Cards */}
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {howItWorksSteps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <div
                    key={step.title}
                    className={`relative flex flex-col p-8 lg:p-10 bg-[#0F1215] rounded-2xl border transition-all duration-300 animate-fade-in ${
                      step.highlighted
                        ? "border-landing-accent/50 shadow-lg shadow-landing-accent/10"
                        : "border-landing-border hover:border-landing-border/80"
                    }`}
                    style={{ animationDelay: `${index * 0.15}s` }}
                  >
                    {/* Step Number Badge */}
                    <div className="absolute -top-3 left-8">
                      <span className="bg-[#0D0F12] px-3 py-1 text-xs font-semibold text-landing-muted border border-landing-border rounded-full">
                        Step {index + 1}
                      </span>
                    </div>

                    {/* Icon */}
                    <div className="flex justify-center mb-8">
                      <div
                        className={`w-16 h-16 flex items-center justify-center rounded-xl ${
                          step.highlighted
                            ? "bg-landing-accent/10 border border-landing-accent/30"
                            : "bg-[#1A1E24] border border-landing-border"
                        }`}
                      >
                        <IconComponent
                          className={`w-8 h-8 ${
                            step.highlighted
                              ? "text-landing-accent"
                              : "text-landing-text/70"
                          }`}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl lg:text-2xl font-bold text-center mb-6 text-landing-heading">
                      {step.title}
                    </h3>

                    {/* Features List */}
                    <ul className="space-y-4 flex-1">
                      {step.features.map((feature, featureIndex) => (
                        <li
                          key={featureIndex}
                          className="flex items-start gap-3"
                        >
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              step.highlighted
                                ? "bg-landing-accent/20"
                                : "bg-[#1A1E24]"
                            }`}
                          >
                            <Check
                              className={`w-3 h-3 ${
                                step.highlighted
                                  ? "text-landing-accent"
                                  : "text-landing-muted"
                              }`}
                              strokeWidth={3}
                            />
                          </div>
                          <span className="text-landing-text/80 text-sm lg:text-base leading-relaxed">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Highlighted Card Indicator */}
                    {step.highlighted && (
                      <div className="absolute -bottom-px left-1/2 -translate-x-1/2">
                        <div className="w-24 h-1 bg-landing-accent rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Connecting Flow Lines */}
            <div className="hidden md:flex justify-center items-center mt-12 gap-4">
              <div className="flex items-center gap-2 text-landing-muted text-sm">
                <div className="w-8 h-px bg-gradient-to-r from-transparent to-landing-accent/50" />
                <span>Scrape</span>
                <div className="w-12 h-px bg-landing-accent/30" />
                <svg
                  className="w-4 h-4 text-landing-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <div className="w-12 h-px bg-landing-accent/30" />
                <span className="text-landing-accent font-medium">Enrich</span>
                <div className="w-12 h-px bg-landing-accent/30" />
                <svg
                  className="w-4 h-4 text-landing-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <div className="w-12 h-px bg-landing-accent/30" />
                <span>Verify</span>
                <div className="w-8 h-px bg-gradient-to-l from-transparent to-landing-accent/50" />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Pricing Plans */}
        <section className="bg-[#0D0F12] py-24 lg:py-32 relative">
          <div className="absolute inset-0 bg-blueprint-grid opacity-30 pointer-events-none" />
          
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-landing-muted text-lg max-w-2xl mx-auto mb-10">
                Choose the plan that fits your needs. Scale up anytime.
              </p>
              
              {/* Annual/Monthly Toggle */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setIsAnnual(false)}
                  className={`relative flex items-center gap-3 px-1 py-1 rounded-full transition-all duration-300 ${
                    !isAnnual ? "text-landing-heading" : "text-landing-muted"
                  }`}
                >
                  <div
                    className={`w-14 h-8 rounded-full transition-all duration-300 cursor-pointer flex items-center ${
                      isAnnual ? "bg-landing-accent" : "bg-[#252A31]"
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
                  <span className={`font-medium transition-colors ${isAnnual ? "text-landing-heading" : "text-landing-muted"}`}>
                    Annual billing
                  </span>
                  <span className="text-landing-accent font-medium">(2 months free)</span>
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
                    className={`relative flex flex-col p-6 lg:p-8 border bg-[#161A1F] transition-all duration-300 animate-fade-in ${
                      plan.highlighted
                        ? "border-landing-accent shadow-lg shadow-landing-accent/10"
                        : "border-landing-border hover:border-landing-border/80"
                    }`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {/* Plan Header */}
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold text-landing-heading mb-1">
                        {plan.name}
                      </h3>
                      <p className="text-landing-muted text-sm mb-1">{plan.subtitle}</p>
                      <p className="text-landing-text/70 text-sm">{plan.description}</p>
                    </div>

                    {/* Price */}
                    <div className="text-center mb-6">
                      <div className="flex items-baseline justify-center">
                        <span className={`text-4xl lg:text-5xl font-bold ${plan.highlighted ? "text-landing-accent" : "text-landing-heading"}`}>
                          ${displayPrice.toLocaleString()}
                        </span>
                        <span className="text-landing-muted text-base ml-1">
                          /{isAnnual ? "yr" : "mo"}
                        </span>
                      </div>
                    </div>

                    {/* CTA Button */}
                    <Link
                      href="/register"
                      className={`w-full py-3 px-6 font-semibold text-center transition-all duration-300 mb-8 ${
                        plan.highlighted
                          ? "bg-landing-accent text-landing-bg hover:bg-landing-accent/90 glow-accent"
                          : "bg-transparent border border-landing-border text-landing-heading hover:border-landing-accent hover:text-landing-accent"
                      }`}
                    >
                      Get started
                    </Link>

                    {/* Divider */}
                    <div className="border-t border-landing-border mb-6" />

                    {/* Features List */}
                    <div className="flex-1">
                      <p className="text-landing-heading font-semibold text-sm mb-4">
                        What&apos;s included
                      </p>
                      <ul className="space-y-3">
                        {plan.features.map((feature, featureIndex) => (
                          <li key={featureIndex} className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-landing-accent flex-shrink-0 mt-0.5" />
                            <span className="text-landing-text text-sm leading-relaxed">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                      
                      {/* Extras */}
                      {plan.extras.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-landing-border/50">
                          {plan.extras.map((extra, extraIndex) => (
                            <div key={extraIndex} className="flex items-center gap-2 text-landing-accent text-sm font-medium">
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

      </main>

      <LandingFooter />
    </div>
  );
}
