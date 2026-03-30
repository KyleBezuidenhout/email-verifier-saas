"use client";

import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { DataVisualization } from "./DataVisualization";
import { IntegrationsShowcase } from "./IntegrationsShowcase";
import { PricingSlider } from "../pricing/PricingSlider";
import { Check, Users, Sparkles, ShieldCheck } from "lucide-react";

const trustCards = [
  {
    title: "Unmatched Pricing",
    description: (
      <>
        Scrape Leads at <span className="text-landing-accent font-semibold">$2 per 1,000 leads</span>
        <span className="block text-sm mt-1 text-landing-muted/70">[$0.002 per profile]</span>
      </>
    ),
    icon: (
      <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: (<><span className="text-landing-accent">800M+</span></>),
    description: (
      <>Get access to over <span className="text-landing-text font-medium">800M valid B2B Emails</span></>
    ),
    icon: (
      <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    title: (<><span className="text-landing-accent">99%+</span> Accuracy</>),
    description: (
      <>All Leads are verified twice, we guarantee a <span className="text-landing-text font-medium">sub 3% bounce rate</span></>
    ),
    icon: (
      <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    title: "Credits Never Expire",
    description: "Once you pay for credits, they're yours to keep, forever.",
    icon: (
      <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
      </svg>
    ),
  },
  {
    title: "Catchall Detection",
    description: (
      <>Built-in catchall verification keeps your <span className="text-landing-text font-medium">sender reputation safe</span></>
    ),
    icon: (
      <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    ),
  },
  {
    title: "Sales Nav Scraper",
    description: (
      <>Extract up to <span className="text-landing-text font-medium">15,000 profiles daily</span> with 35 columns of data</>
    ),
    icon: (
      <svg className="w-7 h-7 text-landing-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.07a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
      </svg>
    ),
  },
];

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
      "Uncapped email enrichment on all paid plans",
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

// Default credit price for non-logged-in users (trial rate)
const DEFAULT_CREDIT_PRICE = 0.0022;
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 500;

export function MarketingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1">
        {/* SECTION 1: Hero Section */}
        <section className="relative min-h-screen flex flex-col bg-[#0D0F12] bg-blueprint-grid pt-20">
          <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

          <div className="relative flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto px-6 lg:px-8 py-24 lg:py-32">
            <div className="text-center animate-fade-in-up mb-16">
              <h1 className="text-4xl md:text-5xl lg:text-[64px] font-bold text-landing-heading leading-[1.08] tracking-tight mb-6">
                Stop Renting Leads.
                <br />
                <span className="text-landing-accent">
                  Start Owning Your Pipeline.
                </span>
              </h1>

              <p className="text-lg md:text-xl text-landing-text leading-relaxed mb-10 max-w-2xl mx-auto">
                Scraping, Enrichment, and Multi-Layer Verification In a Dedicated Engine That&apos;s Exclusively Yours.
              </p>

              <div className="flex items-center justify-center gap-4 flex-wrap">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 bg-landing-accent text-landing-bg px-6 py-3 rounded-lg font-semibold text-sm tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
                >
                  Get started
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  href="#pricing"
                  className="inline-flex items-center gap-2 border border-landing-border text-landing-text px-6 py-3 rounded-lg font-semibold text-sm tracking-wide transition-all duration-300 hover:border-landing-accent/50 hover:text-landing-heading"
                >
                  See pricing
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            </div>

            <div className="w-full animate-fade-in-delay-2">
              <DataVisualization />
            </div>
          </div>
        </section>

        {/* SECTION 2: Trust Bar — Carousel */}
        <section className="bg-[#121418] border-y border-landing-border py-16 lg:py-20 overflow-hidden">
          <div className="flex gap-6 animate-carousel" style={{ width: "max-content" }}>
            {[...trustCards, ...trustCards].map((card, i) => (
              <div
                key={i}
                className="group relative w-[340px] shrink-0 rounded-2xl p-8 border border-white/[0.08] transition-all duration-300 hover:border-landing-accent/40 hover:shadow-[0_0_50px_rgba(0,163,255,0.15)] shadow-[0_8px_32px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)]"
                style={{
                  background: "rgba(10, 12, 16, 0.75)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  transform: "translateY(-4px)",
                }}
              >
                <div className="absolute inset-0 rounded-2xl opacity-30 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%)" }} />
                <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-xl bg-landing-accent/10 border border-landing-accent/20 flex items-center justify-center mb-6">
                    {card.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-landing-heading mb-3">
                    {card.title}
                  </h3>
                  <p className="text-landing-muted leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 2b: Social Proof — Enterprise Stats */}
        <section className="bg-[#0D0F12] py-24 lg:py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
          <div className="relative max-w-5xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-14 animate-fade-in">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-heading leading-[1.1] tracking-tight mb-5">
                Built by Enterprise Senders Who{" "}
                <span className="text-landing-accent">Prioritize Performance</span>{" "}
                at Scale
              </h2>
              <p className="text-lg md:text-xl text-landing-muted max-w-2xl mx-auto">
                No scraper suited us, so we built our own.
              </p>
            </div>

            <div className="relative mx-auto max-w-4xl rounded-2xl border border-landing-border bg-gradient-to-b from-[#1a1d24] to-[#14161a] p-2 shadow-[0_0_80px_rgba(0,163,255,0.08)]">
              <div className="overflow-hidden rounded-xl">
                <img
                  src="/images/dashboard-stats.png"
                  alt="Enterprise campaign performance dashboard"
                  className="w-full h-auto"
                />
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
                Build your lead pipeline in three simple steps.
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

        {/* SECTION 4: Integrations Showcase */}
        <IntegrationsShowcase />

        {/* SECTION 5: Pricing - Dashboard Style */}
        <section id="pricing" className="bg-[#0D0F12] py-24 lg:py-32 relative scroll-mt-20">
          <div className="absolute inset-0 bg-blueprint-grid opacity-30 pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            {/* Header */}
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
                Wholesale Pricing For The <span className="text-[#0099FF]">Top 5%</span>
              </h2>
              <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                All plans include uncapped enrichment & verification, credits never expire
              </p>
            </div>

            {/* PRICING PLANS SECTION - Full Plan Comparison */}
            <PricingSlider variant="marketing" />
          </div>
        </section>

      </main>

      <LandingFooter />
    </div>
  );
}
