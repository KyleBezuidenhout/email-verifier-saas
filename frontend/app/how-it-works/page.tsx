"use client";

import Link from "next/link";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { Users, Sparkles, ShieldCheck, Check } from "lucide-react";

const steps = [
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

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center bg-[#0D0F12] bg-blueprint-grid pt-20">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-24 lg:py-32">
            {/* Section Header */}
            <div className="text-center mb-16 lg:mb-20 animate-fade-in">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-landing-heading leading-[1.1] tracking-tight mb-6">
                How{" "}
                <span className="text-landing-accent">BillionVerifier</span>{" "}
                Works
              </h1>
              <p className="text-lg md:text-xl text-landing-muted max-w-2xl mx-auto">
                Build your lead pipeline in three simple steps. Scrape, enrich,
                and verify—all in one platform.
              </p>
            </div>

            {/* Step Cards */}
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {steps.map((step, index) => {
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
                    <h3
                      className={`text-xl lg:text-2xl font-bold text-center mb-6 ${
                        step.highlighted
                          ? "text-landing-heading"
                          : "text-landing-heading"
                      }`}
                    >
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

            {/* Connecting Flow Lines (Visual Enhancement) */}
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

            {/* CTA Section */}
            <div className="text-center mt-16 lg:mt-20">
              <Link
                href="/register"
                className="inline-flex items-center gap-3 bg-landing-accent text-landing-bg px-8 py-4 font-semibold text-base tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
              >
                Get Started Now
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

              <p className="text-landing-muted text-sm mt-4">
                No credit card required to start
              </p>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

