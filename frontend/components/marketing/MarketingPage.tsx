"use client";

import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { DataVisualization } from "./DataVisualization";
import { Key, Target, PiggyBank } from "lucide-react";

export function MarketingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1">
        {/* SECTION 1: Hero Section */}
        <section className="relative min-h-screen flex items-center bg-[#0D0F12] bg-blueprint-grid pt-20">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32">
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
                  engine that&apos;s exclusively yours. Stop competing over 
                  recycled leads and build a proprietary, high-converting pipeline.
                </p>

                <Link
                  href="/register"
                  className="inline-flex items-center gap-3 bg-landing-accent text-landing-bg px-8 py-4 font-semibold text-base tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
                >
                  Request Access
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
        </section>

        {/* SECTION 2: Trust Bar */}
        <section className="bg-[#121418] border-y border-landing-border py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            {/* Key Metrics */}
            <div className="grid md:grid-cols-3 gap-8 lg:gap-12 mb-16">
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-landing-accent mb-2">
                  800M+
                </div>
                <div className="text-landing-muted text-sm uppercase tracking-wider">
                  Person & Company Profiles
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-landing-accent mb-2">
                  98.5%
                </div>
                <div className="text-landing-muted text-sm uppercase tracking-wider">
                  Email Verification Accuracy
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-landing-accent mb-2">
                  70%
                </div>
                <div className="text-landing-muted text-sm uppercase tracking-wider">
                  Savings vs Traditional Providers
                </div>
              </div>
            </div>

            {/* Client Logos Placeholder */}
            <div className="text-center mb-12">
              <p className="text-landing-muted text-sm uppercase tracking-wider mb-6">
                Trusted by leading B2B teams
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12 opacity-60">
                {/* Placeholder logos - replace with actual client logos */}
                <div className="text-landing-text/40 text-lg font-semibold">Company</div>
                <div className="text-landing-text/40 text-lg font-semibold">Company</div>
                <div className="text-landing-text/40 text-lg font-semibold">Company</div>
                <div className="text-landing-text/40 text-lg font-semibold">Company</div>
                <div className="text-landing-text/40 text-lg font-semibold">Company</div>
              </div>
            </div>

            {/* Testimonial */}
            <div className="max-w-3xl mx-auto">
              <blockquote className="relative">
                <div className="absolute -top-4 -left-2 text-6xl text-landing-accent/20 font-serif">
                  &ldquo;
                </div>
                <p className="text-xl md:text-2xl text-landing-text leading-relaxed text-center italic mb-8 px-8">
                  BillionVerifier isn&apos;t just a tool; it&apos;s our proprietary 
                  lead generation infrastructure. We&apos;ve seen a 3x increase in 
                  qualified opportunities since we stopped renting data and started 
                  owning it.
                </p>
                <footer className="flex items-center justify-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-landing-accent/20 border border-landing-accent/30 flex items-center justify-center">
                    <span className="text-landing-accent font-bold">JD</span>
                  </div>
                  <div className="text-left">
                    <div className="text-landing-heading font-semibold">
                      Jane Doe
                    </div>
                    <div className="text-landing-muted text-sm">
                      Head of Growth, TechCorp
                    </div>
                  </div>
                </footer>
              </blockquote>
            </div>
          </div>
        </section>

        {/* SECTION 3: Value Proposition */}
        <section className="bg-[#0D0F12] bg-blueprint-grid py-24 lg:py-32 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0D0F12]/50 to-transparent pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
                Your All-in-One, Proprietary Data Engine
              </h2>
              <p className="text-landing-muted text-lg max-w-2xl mx-auto">
                One platform. Complete ownership. Unmatched results.
              </p>
            </div>

            {/* Three Benefit Cards */}
            <div className="grid md:grid-cols-3 gap-8 lg:gap-10 mb-20">
              {/* Benefit Card 1 - Ownership */}
              <div className="group p-8 lg:p-10 border border-landing-border bg-[#161A1F] hover:border-landing-accent/50 transition-all duration-300">
                <div className="w-14 h-14 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <Key className="w-7 h-7 text-landing-accent" />
                </div>
                <h3 className="text-xl font-bold text-landing-heading mb-4">
                  Own Your Entire Pipeline
                </h3>
                <p className="text-landing-text leading-relaxed">
                  Get a dedicated scraping, enrichment, and verification engine 
                  built exclusively for you. The infrastructure, the data, and 
                  the competitive advantage are yours forever. Stop paying rent 
                  on data you&apos;ll never own.
                </p>
              </div>

              {/* Benefit Card 2 - Scale & Accuracy */}
              <div className="group p-8 lg:p-10 border border-landing-border bg-[#161A1F] hover:border-landing-accent/50 transition-all duration-300">
                <div className="w-14 h-14 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <Target className="w-7 h-7 text-landing-accent" />
                </div>
                <h3 className="text-xl font-bold text-landing-heading mb-4">
                  Achieve Unmatched Accuracy & Scale
                </h3>
                <p className="text-landing-text leading-relaxed">
                  Leverage our 800M+ profile graph and unique Market Waterfall 
                  Verification to find anyone, anywhere. Our multi-layered process 
                  ensures 98.5% accuracy on fresh, first-contact leads, at any 
                  volume you require.
                </p>
              </div>

              {/* Benefit Card 3 - Consolidation & Savings */}
              <div className="group p-8 lg:p-10 border border-landing-border bg-[#161A1F] hover:border-landing-accent/50 transition-all duration-300">
                <div className="w-14 h-14 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <PiggyBank className="w-7 h-7 text-landing-accent" />
                </div>
                <h3 className="text-xl font-bold text-landing-heading mb-4">
                  Consolidate & Save
                </h3>
                <p className="text-landing-text leading-relaxed">
                  Replace 3-4 separate tools with one seamless, easy-to-use 
                  platform. With a simple, one-time setup and no per-lead costs, 
                  our clients save an average of 70% compared to traditional 
                  data providers.
                </p>
              </div>
            </div>

            {/* Integrations Bar */}
            <div className="text-center">
              <p className="text-landing-muted text-sm uppercase tracking-wider mb-8">
                Integrates seamlessly with your favorite tools
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
                {/* Integration logos - using text placeholders */}
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

        {/* SECTION 4: Final CTA */}
        <section className="bg-[#121418] py-24 lg:py-32">
          <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-heading mb-6">
              Ready to Build Your
              <br />
              <span className="text-landing-accent">Unfair Advantage?</span>
            </h2>

            <p className="text-lg text-landing-text mb-12 max-w-xl mx-auto">
              Join the B2B teams that have stopped renting leads and started
              owning their pipeline.
            </p>

            {/* Primary CTA */}
            <Link
              href="/register"
              className="inline-flex items-center gap-3 bg-landing-accent text-landing-bg px-10 py-5 font-bold text-lg tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
            >
              Request Access
              <svg
                className="w-6 h-6"
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

            {/* Secondary CTA */}
            <div className="mt-6">
              <a
                href="mailto:sales@billionverifier.io"
                className="text-landing-muted hover:text-landing-accent text-sm font-medium transition-colors inline-flex items-center gap-1"
              >
                or Talk to Sales
                <svg
                  className="w-4 h-4"
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
              </a>
            </div>

            {/* Compliance Badges */}
            <div className="flex items-center justify-center gap-6 mt-16">
              <div className="flex items-center gap-2 text-landing-muted text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>GDPR Compliant</span>
              </div>
              <div className="w-px h-4 bg-landing-border" />
              <div className="flex items-center gap-2 text-landing-muted text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>CCPA Compliant</span>
              </div>
              <div className="w-px h-4 bg-landing-border" />
              <div className="flex items-center gap-2 text-landing-muted text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Public Data Only</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
