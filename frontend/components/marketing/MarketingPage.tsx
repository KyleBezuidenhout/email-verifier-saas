"use client";

import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { DataVisualization } from "./DataVisualization";
import {
  Hammer,
  Network,
  Target,
  Key,
  User,
  Rocket,
  Database,
  Crown,
  Shield,
  RefreshCw,
  Users,
  TrendingUp,
} from "lucide-react";

export function MarketingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-landing-bg">
      <LandingHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center bg-landing-bg bg-blueprint-grid pt-20">
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
                  The best B2B teams don&apos;t share databases with their
                  competitors. They build proprietary lead engines that generate
                  exclusive opportunities.
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

        {/* Problem Section - The "Old Way" */}
        <section className="bg-landing-surface py-24 lg:py-32">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
                Renting Leads is a Losing Strategy
              </h2>
              <p className="text-landing-muted text-lg max-w-2xl mx-auto">
                The traditional model is designed to keep you dependent.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
              {/* Problem Card 1 */}
              <div className="group p-8 border border-landing-border bg-landing-bg/50 hover:border-landing-accent/30 transition-all duration-300">
                <div className="w-14 h-14 border border-landing-muted/30 flex items-center justify-center mb-6 group-hover:border-landing-accent/50 transition-colors">
                  <RefreshCw className="w-7 h-7 text-landing-muted group-hover:text-landing-accent transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-landing-heading mb-3">
                  Recycled Data
                </h3>
                <p className="text-landing-text leading-relaxed">
                  The same leads are sold to dozens of companies. By the time
                  you reach out, your prospects are already fatigued by cold
                  outreach.
                </p>
              </div>

              {/* Problem Card 2 */}
              <div className="group p-8 border border-landing-border bg-landing-bg/50 hover:border-landing-accent/30 transition-all duration-300">
                <div className="w-14 h-14 border border-landing-muted/30 flex items-center justify-center mb-6 group-hover:border-landing-accent/50 transition-colors">
                  <Users className="w-7 h-7 text-landing-muted group-hover:text-landing-accent transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-landing-heading mb-3">
                  Fierce Competition
                </h3>
                <p className="text-landing-text leading-relaxed">
                  Your competitors have access to the exact same contact lists.
                  There&apos;s no differentiation, just a race to the bottom on
                  price.
                </p>
              </div>

              {/* Problem Card 3 */}
              <div className="group p-8 border border-landing-border bg-landing-bg/50 hover:border-landing-accent/30 transition-all duration-300">
                <div className="w-14 h-14 border border-landing-muted/30 flex items-center justify-center mb-6 group-hover:border-landing-accent/50 transition-colors">
                  <TrendingUp className="w-7 h-7 text-landing-muted group-hover:text-landing-accent transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-landing-heading mb-3">
                  Escalating Costs
                </h3>
                <p className="text-landing-text leading-relaxed">
                  Monthly subscriptions that never end. Per-lead fees that scale
                  with your growth. You&apos;re paying rent on data you&apos;ll
                  never own.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Solution Section - The "New Way" */}
        <section className="bg-landing-bg bg-blueprint-grid py-24 lg:py-32 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-landing-bg/50 to-transparent pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
                Build Your Proprietary Data Engine
              </h2>
              <p className="text-landing-muted text-lg max-w-2xl mx-auto">
                Own your lead generation infrastructure. Stop renting, start
                building.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Solution Card 1 */}
              <div className="group p-8 border border-landing-border bg-landing-surface/50 hover:border-landing-accent/50 transition-all duration-300 hover:bg-landing-surface">
                <div className="w-12 h-12 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <Hammer className="w-6 h-6 text-landing-accent" />
                </div>
                <h3 className="text-lg font-bold text-landing-heading mb-2">
                  Your Exclusive Lead Engine
                </h3>
                <p className="text-landing-text text-sm leading-relaxed">
                  Custom scraper built to your exact ICP specifications. No
                  shared infrastructure.
                </p>
              </div>

              {/* Solution Card 2 */}
              <div className="group p-8 border border-landing-border bg-landing-surface/50 hover:border-landing-accent/50 transition-all duration-300 hover:bg-landing-surface">
                <div className="w-12 h-12 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <Network className="w-6 h-6 text-landing-accent" />
                </div>
                <h3 className="text-lg font-bold text-landing-heading mb-2">
                  Unparalleled Reach
                </h3>
                <p className="text-landing-text text-sm leading-relaxed">
                  Access to 800M+ email graph. Find anyone, anywhere, with
                  precision accuracy.
                </p>
              </div>

              {/* Solution Card 3 */}
              <div className="group p-8 border border-landing-border bg-landing-surface/50 hover:border-landing-accent/50 transition-all duration-300 hover:bg-landing-surface">
                <div className="w-12 h-12 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <Target className="w-6 h-6 text-landing-accent" />
                </div>
                <h3 className="text-lg font-bold text-landing-heading mb-2">
                  Fresh Lead Precision
                </h3>
                <p className="text-landing-text text-sm leading-relaxed">
                  85-90% deliverability on untouched leads. First-contact
                  advantage every time.
                </p>
              </div>

              {/* Solution Card 4 */}
              <div className="group p-8 border border-landing-border bg-landing-surface/50 hover:border-landing-accent/50 transition-all duration-300 hover:bg-landing-surface">
                <div className="w-12 h-12 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center mb-6">
                  <Key className="w-6 h-6 text-landing-accent" />
                </div>
                <h3 className="text-lg font-bold text-landing-heading mb-2">
                  Ownership Economics
                </h3>
                <p className="text-landing-text text-sm leading-relaxed">
                  One-time setup, no per-lead fees. The data is yours forever.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="bg-landing-surface py-24 lg:py-32">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
                How It Works
              </h2>
              <p className="text-landing-muted text-lg max-w-2xl mx-auto">
                Three steps to owning your lead generation infrastructure.
              </p>
            </div>

            <div className="relative">
              {/* Timeline connector */}
              <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-landing-border -translate-y-1/2" />
              <div className="hidden lg:block absolute top-1/2 left-[16.66%] right-[16.66%] h-px bg-landing-accent/30 -translate-y-1/2" />

              <div className="grid md:grid-cols-3 gap-8 lg:gap-16">
                {/* Step 1 */}
                <div className="relative text-center">
                  <div className="relative z-10 w-20 h-20 mx-auto mb-8 bg-landing-bg border-2 border-landing-accent flex items-center justify-center">
                    <User className="w-8 h-8 text-landing-accent" />
                  </div>
                  <div className="text-landing-accent font-mono text-sm mb-2">
                    STEP 01
                  </div>
                  <h3 className="text-xl font-bold text-landing-heading mb-3">
                    Define Your ICP
                  </h3>
                  <p className="text-landing-text leading-relaxed">
                    Specify your ideal customer profile with precision. Industry,
                    company size, job titles, technologies—you define the
                    parameters.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="relative text-center">
                  <div className="relative z-10 w-20 h-20 mx-auto mb-8 bg-landing-bg border-2 border-landing-accent flex items-center justify-center">
                    <Rocket className="w-8 h-8 text-landing-accent" />
                  </div>
                  <div className="text-landing-accent font-mono text-sm mb-2">
                    STEP 02
                  </div>
                  <h3 className="text-xl font-bold text-landing-heading mb-3">
                    Deploy Your Scraper
                  </h3>
                  <p className="text-landing-text leading-relaxed">
                    We build and deploy your custom data engine. It runs
                    exclusively for you, sourcing fresh leads that match your
                    criteria.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative text-center">
                  <div className="relative z-10 w-20 h-20 mx-auto mb-8 bg-landing-bg border-2 border-landing-accent flex items-center justify-center">
                    <div className="relative">
                      <Database className="w-8 h-8 text-landing-accent" />
                      <Crown className="w-4 h-4 text-landing-accent absolute -top-2 -right-2" />
                    </div>
                  </div>
                  <div className="text-landing-accent font-mono text-sm mb-2">
                    STEP 03
                  </div>
                  <h3 className="text-xl font-bold text-landing-heading mb-3">
                    Own Your Pipeline
                  </h3>
                  <p className="text-landing-text leading-relaxed">
                    Receive verified, exclusive leads delivered directly to you.
                    No sharing, no competition, no recurring fees.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust/Compliance Section */}
        <section className="bg-landing-bg py-24 lg:py-32">
          <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <div className="w-16 h-16 mx-auto mb-8 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center">
              <Shield className="w-8 h-8 text-landing-accent" />
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-landing-heading mb-6">
              Ethical & Compliant by Design
            </h2>

            <p className="text-lg text-landing-text leading-relaxed max-w-2xl mx-auto">
              All data is ethically sourced from publicly available information
              in full compliance with GDPR and CCPA standards. We believe in
              building sustainable, responsible data infrastructure that
              respects privacy while delivering results.
            </p>

            <div className="flex items-center justify-center gap-8 mt-12">
              <div className="text-center">
                <div className="text-landing-accent font-mono text-sm mb-1">
                  GDPR
                </div>
                <div className="text-landing-muted text-xs">Compliant</div>
              </div>
              <div className="w-px h-8 bg-landing-border" />
              <div className="text-center">
                <div className="text-landing-accent font-mono text-sm mb-1">
                  CCPA
                </div>
                <div className="text-landing-muted text-xs">Compliant</div>
              </div>
              <div className="w-px h-8 bg-landing-border" />
              <div className="text-center">
                <div className="text-landing-accent font-mono text-sm mb-1">
                  PUBLIC DATA
                </div>
                <div className="text-landing-muted text-xs">Only</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="bg-landing-surface py-24 lg:py-32">
          <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-heading mb-6">
              Ready to Build Your
              <br />
              <span className="text-landing-accent">Unfair Advantage?</span>
            </h2>

            <p className="text-lg text-landing-text mb-12 max-w-xl mx-auto">
              Join the companies that have stopped renting leads and started
              owning their pipeline.
            </p>

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
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
