"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Script from "next/script";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { IntegrationsShowcase } from "./IntegrationsShowcase";
import { PricingSlider } from "../pricing/PricingSlider";
import { Check, Users, Sparkles, ShieldCheck, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";

const Globe = dynamic(() => import("./Globe"), { ssr: false });
const SignalPopups = dynamic(() => import("./SignalPopups"), { ssr: false });

function useDailyCounter(startValue: number, endValue: number) {
  const compute = () => {
    const now = new Date();
    const secondsSinceMidnightUTC =
      now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const startSecond = 60; // 00:01:00
    const endSecond = 86340; // 23:59:00
    const elapsed = Math.max(0, secondsSinceMidnightUTC - startSecond);
    const progress = Math.min(elapsed / (endSecond - startSecond), 1);
    return Math.round(startValue + (endValue - startValue) * progress);
  };

  const [value, setValue] = useState(compute);

  useEffect(() => {
    const interval = setInterval(() => setValue(compute()), 5000);
    return () => clearInterval(interval);
  }, [startValue, endValue]);

  return value;
}

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

const featureHighlights = [
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

const faqItems = [
  {
    question: "Do I need a LinkedIn Sales Navigator account?",
    answer: (
      <>
        <p className="mb-4">Yes - a Sales Navigator is required.</p>
        <p>If you don&apos;t have one yet, contact us at support@billionverifier.io and we&apos;ll share an exclusive 75% discount to get you set up.</p>
      </>
    ),
  },
  {
    question: "What data fields are returned when I extract a Sales Nav profile?",
    answer: (
      <>
        <p className="mb-4">Every extracted profile includes the full set of LinkedIn data - no fields left behind:</p>
        <p className="font-semibold text-landing-heading mb-2">Personal:</p>
        <p className="mb-4">First name, Last name, About, Current position, Position description, LinkedIn URL, LinkedIn ID, Location</p>
        <p className="font-semibold text-landing-heading mb-2">Company:</p>
        <p>Company name, Company LinkedIn URL, Company website, Company description, Specialities/keywords, Employee count, Industry, Year founded, HQ location, Company LinkedIn ID</p>
      </>
    ),
  },
  {
    question: "How many profiles can I extract per day?",
    answer: (
      <>
        <p className="mb-4">To protect your LinkedIn account from potential flagging or suspension, we limit extraction to 15,000 profiles per day per account.</p>
        <p className="mb-4">This keeps your account within LinkedIn&apos;s safe activity thresholds.</p>
        <p>However, If you have a second Sales Navigator account, you can reset your daily limit directly from your dashboard.</p>
      </>
    ),
  },
  {
    question: "Do I need to re-verify emails found during enrichment?",
    answer: (
      <>
        <p className="mb-4">No. Every email marked as Valid is already verified. You can send with confidence.</p>
      </>
    ),
  },
  {
    question: "Does BillionVerifier clean my extracted data?",
    answer: (
      <>
        <p className="mb-4">With each extraction, we clean up:</p>
        <p className="mb-2">First names<br />Last names<br />Company names<br />Job titles</p>
        <p className="mb-2">By cleaning we mean:</p>
        <p>Removing emojis<br />Correcting typos<br />Standardising names (capital letters)</p>
      </>
    ),
  },
  {
    question: "Is my LinkedIn account safe?",
    answer: (
      <>
        <p className="mb-4">Yes. BillionVerifier is built with LinkedIn account safety as a core design principle - not an afterthought.</p>
        <p className="mb-4">Our system rate-limits all requests to LinkedIn&apos;s servers to keep your activity within safe thresholds.</p>
        <p className="mb-4">To keep your account fully protected while using BillionVerifier at full capacity:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Don&apos;t use other LinkedIn scraping or automation tools on the same day</li>
          <li>Limit manual profile visits to under 100 per day</li>
        </ul>
        <p className="mt-4">Following these guidelines, your account remains safe and within LinkedIn&apos;s recommended usage limits.</p>
      </>
    ),
  },
  {
    question: "Who owns BillionVerfier?",
    answer: (
      <>
        <p className="mb-4">BillionVerifier was built by an outbound team who spent years sending 50,000+ emails per day and paying five-figure monthly bills for data tools.</p>
        <p className="mb-4">After years of overpaying for fragmented, overpriced solutions, they made the decision to build BillionVerifier and make it available to everyone.</p>
        <p>The founding team prefers to let the product speak for itself.</p>
      </>
    ),
  },
  {
    question: "Does BillionVerifier offer a Guarantee?",
    answer: "Yes, we guarantee a sub 2% hard bounce rate on any emails marked as \"valid\".",
  },
];

const howItWorksSteps = [
  {
    key: "upload",
    label: "Target",
    title: (
      <>
        Target the right people,
        <br />
        at the right moment
      </>
    ),
    description:
      "Most intent data is rough guesses. When you build your search on Sales Navigator, you're pulling from the world's only professional identity network — where signals are tied to real people, not anonymous IPs.",
    tags: ["Identity-resolved", "50 targeting filters", "Real-time"],
    card: {
      header: "import · leads.csv",
      rows: [
        { label: "File", value: "q4-outbound-list.csv" },
        { label: "Rows detected", value: "14,382" },
        { label: "Duplicates removed", value: "231" },
        { label: "Ready to process", value: "14,151" },
      ],
    },
  },
  {
    key: "enrich",
    label: "Extract",
    title: (
      <>
        Paste your URL,
        <br />
        Get a campaign-ready list.
      </>
    ),
    description:
      "Paste your Sales Navigator search URL, and we'll extract and enrich your entire search. No spreadsheets, no handoffs between tools.",
    tags: ["Up to 15k profiles/day", "35 + data points", "AI data cleaning"],
    card: {
      header: "enrichment · running",
      rows: [
        { label: "Emails found", value: "12,847" },
        { label: "Job titles matched", value: "13,920" },
        { label: "Company domains", value: "8,412" },
        { label: "LinkedIn URLs", value: "14,002" },
      ],
    },
  },
  {
    key: "verify",
    label: "Launch",
    title: "Launch your campaign.",
    description:
      "Drop your verified list straight into your sending tool. With clean data, the right signals, and good messaging - the numbers speak for themselves.",
    tags: ["intent leads", "Campaign-ready output", "<2% bounce rate"],
    card: {
      header: "verification · complete",
      rows: [
        { label: "Valid", value: "11,934" },
        { label: "Risky (catch-all)", value: "648" },
        { label: "Invalid", value: "265" },
        { label: "Bounce rate est.", value: "< 1.2%" },
      ],
    },
  },
];

function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeStepRef = useRef(0);
  const lastScrollY = useRef(0);
  const scrollDirection = useRef<"up" | "down">("down");
  const visibilityRatios = useRef<number[]>([0, 0, 0]);

  // Keep ref in sync with state
  useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cards = Array.from(container.children) as HTMLDivElement[];
    const viewportHeight = window.innerHeight;
    const viewportCenter = viewportHeight / 2;
    
    // Track scroll direction
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      scrollDirection.current = currentScrollY > lastScrollY.current ? "down" : "up";
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        // Update visibility ratios
        entries.forEach((entry) => {
          const index = cards.indexOf(entry.target as HTMLDivElement);
          if (index >= 0) {
            visibilityRatios.current[index] = entry.intersectionRatio;
          }
        });

        const currentIndex = activeStepRef.current;
        const currentRatio = visibilityRatios.current[currentIndex];
        
        // Find best candidate with hysteresis
        let bestIndex = currentIndex;
        let bestScore = currentRatio;
        
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          
          const index = cards.indexOf(entry.target as HTMLDivElement);
          if (index < 0) return;
          
          const rect = entry.boundingClientRect;
          const cardCenter = rect.top + rect.height / 2;
          const distanceFromCenter = Math.abs(cardCenter - viewportCenter);
          
          // Calculate score based on visibility and position
          let score = entry.intersectionRatio;
          
          // Moving down: prefer later sections, require 50%+ visibility to switch
          if (scrollDirection.current === "down") {
            if (index > currentIndex && entry.intersectionRatio >= 0.5) {
              score += 0.3; // Boost for next sections when scrolling down
            }
          } 
          // Moving up: prefer earlier sections, require 60%+ visibility to switch back
          else {
            if (index < currentIndex && entry.intersectionRatio >= 0.6) {
              score += 0.3; // Boost for previous sections when scrolling up
            }
          }
          
          // Penalty for distance from center (prefer centered cards)
          score -= (distanceFromCenter / viewportHeight) * 0.2;
          
          // Hysteresis: need significantly better score to switch (0.15 threshold)
          const needsSignificantImprovement = index !== currentIndex;
          const improvementThreshold = needsSignificantImprovement ? 0.15 : 0;
          
          if (score > bestScore + improvementThreshold) {
            bestScore = score;
            bestIndex = index;
          }
        });
        
        if (bestIndex >= 0 && bestIndex < howItWorksSteps.length && bestIndex !== currentIndex) {
          setActiveStep(bestIndex);
        }
      },
      { 
        rootMargin: "-20% 0px -20% 0px", 
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
      }
    );

    cards.forEach((card) => observer.observe(card));

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <section className="bg-black relative mt-20 lg:mt-32">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 pt-16 pb-24 lg:pt-20 lg:pb-32">
        {/* Section Header */}
        <h2 className="text-3xl md:text-4xl lg:text-[44px] font-bold text-white text-center leading-tight tracking-tight mb-6">
          One Platform Replaces Your Entire Stack.
        </h2>
        <p className="text-lg md:text-xl text-zinc-400 text-center max-w-2xl mx-auto mb-24 lg:mb-32">
          You shouldn&apos;t need three tools to build one lead list.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* Left sticky column */}
          <div className="lg:col-span-6">
            <div className="lg:sticky lg:top-32">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 border border-white/10 rounded px-3 py-1 mb-6">
                How It Works
              </span>
              <h2 className="text-2xl md:text-3xl lg:text-[36px] font-bold text-white leading-[1.15] tracking-tight mb-12">
                Go from intent signal to{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white/60 to-white">
                  campaign-ready lead list
                </span>{" "}
                in a single platform.
              </h2>

              {/* Step labels */}
              <div className="flex flex-col gap-2">
                {howItWorksSteps.map((step, i) => (
                  <div
                    key={step.key}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      i === activeStep
                        ? "bg-white/[0.06] text-white border-l-2 border-white shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                        : "text-white/30 border-l-2 border-transparent"
                    }`}
                  >
                    <span>{step.label}</span>
                    {i === activeStep && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right scrolling cards */}
          <div ref={containerRef} className="lg:col-span-6 flex flex-col gap-16 lg:gap-24">
            {howItWorksSteps.map((step) => (
              <div key={step.key} className="relative rounded-3xl p-px bg-gradient-to-b from-white/[0.15] via-white/[0.05] to-transparent shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="relative rounded-[23px] bg-[#0a0a0a] p-6 md:p-8">
                  <div className="mb-6">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-3">
                      {step.title}
                    </h3>
                    <p className="text-base text-zinc-400 leading-relaxed max-w-md">
                      {step.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {step.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs text-white/60 border border-white/10 rounded px-3 py-1.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Inner Mock card */}
                  {step.key === "upload" ? (
                    /* Two-column comparison card for Target step */
                    <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] overflow-hidden">
                      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
                        {/* Left column - Third-party intent (muted) */}
                        <div className="p-4">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-4">
                            Third-Party Intent
                          </div>
                          <div className="space-y-4">
                            {[
                              { title: "Company surge detected", sub: "Topic: sales software", badge: "Unknown Visitor" },
                              { title: "Anonymous IP match", sub: "Inferred from web behavior", badge: "No Identity" },
                              { title: "Content consumption inferred", sub: "14-day data delay", badge: "Account-Level Only" },
                            ].map((item) => (
                              <div key={item.title} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/20 mt-1.5" />
                                <div>
                                  <div className="text-xs text-white/40">{item.title}</div>
                                  <div className="text-[10px] text-white/25 mt-0.5">{item.sub}</div>
                                  <div className="text-[9px] font-medium uppercase tracking-wide text-white/30 mt-1">
                                    {item.badge}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Right column - LinkedIn's intent (highlighted) */}
                        <div className="p-4">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-landing-accent mb-4">
                            LinkedIn&apos;s Intent
                          </div>
                          <div className="space-y-4">
                            {[
                              { title: "Sarah Chen · VP Sales", sub: "Changed jobs 14 days ago", badge: "New Budget" },
                              { title: "Acme Corp · Series B", sub: "12 open roles posted", badge: "Hiring Signal" },
                              { title: "James Park · Director", sub: "Posted 3 days ago", badge: "Active & Reachable" },
                            ].map((item) => (
                              <div key={item.title} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" />
                                <div>
                                  <div className="text-xs text-white font-medium">{item.title}</div>
                                  <div className="text-[10px] text-white/50 mt-0.5">{item.sub}</div>
                                  <div className="text-[9px] font-medium uppercase tracking-wide text-landing-accent mt-1">
                                    {item.badge}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : step.key === "enrich" ? (
                    /* Extraction progress card for Enrich step */
                    <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.03)]">
                      {/* URL bar with Extract button */}
                      <div className="px-5 pt-4 pb-3">
                        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2">
                          <span className="text-xs text-white/40 truncate flex-1">
                            linkedin.com/sales/search/people?query=eyJjb21wYW55U2l6ZSI6WyIxMS01MCJd...
                          </span>
                          <button className="text-xs font-semibold text-landing-accent bg-white/[0.08] border border-white/[0.15] rounded px-3 py-1.5 flex items-center gap-1 hover:bg-white/[0.12] transition-colors">
                            Extract
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Job label */}
                      <div className="px-5 pb-3">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                          JOB · 04-OUTBOUND-CAMPAIGN
                        </span>
                      </div>

                      {/* Stats panel */}
                      <div className="mx-5 mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {/* Stats rows */}
                        <div className="divide-y divide-white/[0.06]">
                          {[
                            { label: "Profiles extracted", value: "4,387 / 5,000" },
                            { label: "Valid emails", value: "3,159" },
                            { label: "catchall emails", value: "350" },
                          ].map((row) => (
                            <div key={row.label} className="flex items-center justify-between px-4 py-3">
                              <span className="text-xs text-white/50">{row.label}</span>
                              <span className="text-xs font-semibold text-white">{row.value}</span>
                            </div>
                          ))}
                          {/* Processing with progress bar */}
                          <div className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-white/50">Processing</span>
                              <span className="text-xs font-semibold text-landing-accent">87%</span>
                            </div>
                            <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                              <div className="h-full w-[87%] bg-blue-500 rounded-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : step.key === "verify" ? (
                    /* Campaign results dashboard */
                    <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.03)]">
                      {/* Header dots and label */}
                      <div className="flex items-center gap-1.5 px-5 pt-4 pb-2">
                        <span className="w-2 h-2 rounded-full bg-white/20" />
                        <span className="w-2 h-2 rounded-full bg-white/20" />
                        <span className="w-2 h-2 rounded-full bg-white/20" />
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-white/30">
                          CAMPAIGN · Q4-OUTBOUND-RESULTS
                        </span>
                      </div>

                      {/* Stats grid */}
                      <div className="px-5 pb-5">
                        <div className="grid grid-cols-3 gap-3">
                          {/* Total emails sent */}
                          <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="text-[10px] text-white/40 mb-1">Total emails sent</div>
                            <div className="text-lg font-bold text-landing-accent">9,348</div>
                          </div>
                          {/* Leads contacted */}
                          <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="text-[10px] text-white/40 mb-1">Leads contacted</div>
                            <div className="text-lg font-bold text-landing-accent">4,674</div>
                          </div>
                          {/* Bounce rate */}
                          <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="text-[10px] text-white/40 mb-1">Bounce rate</div>
                            <div className="text-lg font-bold text-landing-accent">0.6%</div>
                          </div>
                          {/* Reply rate */}
                          <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="text-[10px] text-white/40 mb-1">Reply rate</div>
                            <div className="text-lg font-bold text-landing-accent">5.3%</div>
                          </div>
                          {/* Positive reply rate */}
                          <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="text-[10px] text-white/40 mb-1">Positive reply rate</div>
                            <div className="text-lg font-bold text-landing-accent">32.8%</div>
                          </div>
                          {/* Meetings booked */}
                          <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="text-[10px] text-white/40 mb-1">Meetings booked</div>
                            <div className="text-lg font-bold text-landing-accent">27</div>
                          </div>
                        </div>

                      </div>
                    </div>
                  ) : (
                    /* Standard terminal-style card for other steps */
                    <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.03)]">
                      <div className="flex items-center gap-1.5 px-5 pt-4 pb-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                        <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                        <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                        <span className="ml-3 text-xs text-white/40 font-medium">
                          {step.card.header}
                        </span>
                      </div>
                      <div className="relative divide-y divide-white/[0.06]">
                        {step.card.rows.map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between px-5 py-3.5"
                          >
                            <span className="text-sm text-white/60">{row.label}</span>
                            <span className="text-sm text-white font-medium">
                              {row.value}
                            </span>
                          </div>
                        ))}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const toggleFaq = (index: number) => setOpenFaqIndex(openFaqIndex === index ? null : index);
  const validEmails = useDailyCounter(412_723, 1_417_136);
  const bouncesPrevented = useDailyCounter(236_451, 739_586);
  const totalEmailsFound = useDailyCounter(748_395_192, 749_395_192);


  return (
    <div className="flex flex-col min-h-screen bg-black">
      <LandingHeader />

      <main className="flex-1 bg-black">
        {/* SECTION 1: Hero Section */}
        <section className="relative pt-20 pb-12 lg:pb-20 overflow-hidden">
          <div className="relative max-w-6xl mx-auto px-6 lg:px-8 pt-16 lg:pt-24 pb-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="animate-fade-in-up">
                <h1 className="text-3xl md:text-4xl lg:text-[52px] font-bold text-white leading-tight tracking-tight mb-12">
                  <span className="block">The Data Extraction</span>
                  <span className="block mt-2">Layer Behind Smarter</span>
                  <span className="block mt-2">Pipeline Growth</span>
                </h1>

                <p className="text-lg md:text-xl text-gray-400 leading-relaxed mb-10 max-w-lg">
                  Built for outbound teams. Turn intent signals from the world&apos;s largest professional identity network into campaign-ready leads - in a single platform.
                </p>

                <div className="flex items-center gap-4 flex-wrap">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 bg-blue-500 text-black px-6 py-3 rounded-lg font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-blue-600"
                  >
                    2,000 Credits
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                  <Link
                    href="#pricing"
                    className="inline-flex items-center gap-2 border border-white/20 text-gray-300 px-6 py-3 rounded-lg font-semibold text-sm tracking-wide transition-all duration-300 hover:border-white/50 hover:text-white"
                  >
                    See pricing
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>
              </div>

              <div className="relative h-[380px] lg:h-[520px] flex items-center justify-center lg:pl-6">
                <div className="w-[90%] h-[90%]">
                  <Globe />
                </div>
                <SignalPopups />
              </div>
            </div>
          </div>
        </section>

        {/* Live Stats Counter */}
        <section className="pt-10 lg:pt-12 pb-10 lg:pb-12 bg-black flex items-center justify-center min-h-[140px]">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-16 text-center items-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-xl md:text-2xl lg:text-3xl font-bold text-landing-text tabular-nums tracking-tight">
                  {validEmails.toLocaleString()}
                </span>
                <span className="text-sm lg:text-base text-landing-muted uppercase tracking-wide">
                  Valid Emails Found Today
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xl md:text-2xl lg:text-3xl font-bold text-landing-text tabular-nums tracking-tight">
                  {bouncesPrevented.toLocaleString()}
                </span>
                <span className="text-sm lg:text-base text-landing-muted uppercase tracking-wide">
                  Bounces Prevented Today
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xl md:text-2xl lg:text-3xl font-bold text-landing-text tabular-nums tracking-tight">
                  {totalEmailsFound.toLocaleString()}
                </span>
                <span className="text-sm lg:text-base text-landing-muted uppercase tracking-wide">
                  Total Emails Found
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Showcase — Account Safety / Deliverability / Pricing */}
        <section id="features" className="bg-black pt-16 lg:pt-24 pb-8 lg:pb-12 relative overflow-hidden">
          <div className="relative max-w-6xl mx-auto px-6 lg:px-8 space-y-24 lg:space-y-32">

            {/* ── ACCOUNT SAFETY ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 border border-white/10 rounded px-3 py-1 mb-6">
                  Account Safety
                </span>
                <h2 className="text-2xl md:text-3xl lg:text-[36px] font-bold text-white leading-[1.15] tracking-tight mb-6">
                  We protect your LinkedIn account while you scale.
                </h2>
                <p className="text-base lg:text-lg text-zinc-400 leading-relaxed mb-8 max-w-md">
                  Speed means nothing if it costs you your account. Our daily rate limits stay within LinkedIn&apos;s safe thresholds, we&apos;re 100% cloud-based, which means no footprint, and no bans.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["No browser extension", "100% cloud-based", "Built-in daily limits"].map((tag) => (
                    <span key={tag} className="text-xs text-white/60 border border-white/10 rounded px-3 py-1.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Mock card: scraper · settings */}
              <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] p-0 overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.03)]">
                <div className="flex items-center px-5 pt-4 pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    <span className="ml-3 text-xs text-white/40 font-medium">extractor · settings</span>
                  </div>
                  <span className="ml-auto text-xs font-semibold text-emerald-400">
                    Safe
                  </span>
                </div>
                <div className="relative divide-y divide-white/[0.06]">
                  {[
                    { label: "Browser extension", value: "None required" },
                    { label: "Daily profile limit", value: "15,000 / day" },
                    { label: "Request throttling", value: "Auto · within threshold" },
                    { label: "Extraction mode", value: "cloud-based" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-sm text-white/60">{row.label}</span>
                      <span className="text-sm text-white font-medium">{row.value}</span>
                    </div>
                  ))}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                </div>
              </div>
            </div>

            {/* ── DELIVERABILITY ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Mock card: results */}
              <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] p-0 overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.03)] order-2 lg:order-1">
                <div className="flex items-center gap-1.5 px-5 pt-4 pb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="ml-3 text-xs text-white/40 font-medium">results · q4-outbound-list.csv</span>
                </div>

                {/* Mini table */}
                <div className="relative px-5 pt-3 pb-2">
                  <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-white/30 pb-2">
                    <span>Email</span><span>Company</span><span>MX</span><span>Status</span>
                  </div>
                  {[
                    { email: "james@acmecorp.io", company: "Acme Corp", mx: "Google", status: "Valid" },
                    { email: "sarah@horizonhq.com", company: "Horizon HQ", mx: "Outlook", status: "Valid" },
                    { email: "m.lee@oldco.net", company: "OldCo", mx: "Other", status: "Invalid" },
                    { email: "alex@techflow.io", company: "TechFlow", mx: "Google", status: "Valid" },
                  ].map((row) => (
                    <div key={row.email} className="grid grid-cols-4 gap-2 items-center py-2.5 border-t border-white/[0.04] text-sm">
                      <span className="text-white/70 truncate text-xs">{row.email}</span>
                      <span className="text-white/50 text-xs">{row.company}</span>
                      <span className="text-white/50 text-xs">{row.mx}</span>
                      <span className={`text-[11px] font-semibold ${row.status === "Valid" ? "text-emerald-400" : "text-red-400"}`}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                </div>
              </div>

              {/* Text */}
              <div className="order-1 lg:order-2">
                <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 border border-white/10 rounded px-3 py-1 mb-6">
                  Deliverability Guarantee
                </span>
                <h2 className="text-2xl md:text-3xl lg:text-[36px] font-bold text-white leading-[1.15] tracking-tight mb-6">
                  Verified means verified.
                </h2>
                <p className="text-base lg:text-lg text-zinc-400 leading-relaxed mb-8 max-w-md">
                  When your emails bounce, domains get blacklisted, and your entire outbound motion collapses. We offer a sub 2% hard bounce rate guarantee - or we refund your credits.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Sub-2% bounce rate guarantee", "7 email checkpoints"].map((tag) => (
                    <span key={tag} className="text-xs text-white/60 border border-white/10 rounded px-3 py-1.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── PRICING / CREDITS NEVER EXPIRE ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 border border-white/10 rounded px-3 py-1 mb-6">
                  Pricing
                </span>
                <h2 className="text-2xl md:text-3xl lg:text-[36px] font-bold text-white leading-[1.15] tracking-tight mb-6">
                  Credits never expire.
                </h2>
                <p className="text-base lg:text-lg text-zinc-400 leading-relaxed mb-8 max-w-md">
                  When you purchase credits, they&apos;re yours to keep, forever. No monthly resets, no pressure to burn through your balance.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["No monthly pressure", "Balance never resets"].map((tag) => (
                    <span key={tag} className="text-xs text-white/60 border border-white/10 rounded px-3 py-1.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Mock card: account · credits */}
              <div className="relative rounded-2xl border border-white/[0.12] bg-[#0a0a0a] p-0 overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.03)]">
                <div className="flex items-center gap-1.5 px-5 pt-4 pb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="ml-3 text-xs text-white/40 font-medium">account · credits</span>
                </div>
                <div className="relative divide-y divide-white/[0.06]">
                  <div className="flex items-center justify-between px-5 py-4">
                    <span className="text-sm text-white/60">Current balance</span>
                    <span className="text-sm font-bold text-landing-accent">452,000 credits</span>
                  </div>
                  {[
                    { label: "Agency Plus · Nov 2025", status: "active", amount: "+400,000" },
                    { label: "Top-up · Aug 2024", status: "active", amount: "+50,000" },
                    { label: "Trial · Jan 2024", status: "active", amount: "+2,000" },
                  ].map((tx) => (
                    <div key={tx.label} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/80">{tx.label}</span>
                        <span className="text-[10px] font-semibold text-emerald-400">{tx.status}</span>
                      </div>
                      <span className="text-sm font-semibold text-white/70">{tx.amount}</span>
                    </div>
                  ))}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <HowItWorks />

        {/* Trusted By Logos */}
        <section className="pt-8 lg:pt-10 pb-16 lg:pb-20 bg-black">
          <h3 className="text-base uppercase tracking-widest text-landing-text mb-10 text-center animate-fade-in">
            TRUSTED BY HUNDREDS OF OUTBOUND TEAMS
          </h3>
          <div className="relative flex items-center justify-center gap-16 lg:gap-32 overflow-hidden mt-10 mb-10">
            {/* Left gradient fade */}
            <div 
              className="absolute left-0 top-0 bottom-0 w-32 sm:w-48 lg:w-64 z-10 pointer-events-none"
              style={{
                background: "linear-gradient(to right, rgb(0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 30%, transparent 100%)"
              }}
            />
            {/* Right gradient fade */}
            <div 
              className="absolute right-0 top-0 bottom-0 w-32 sm:w-48 lg:w-64 z-10 pointer-events-none"
              style={{
                background: "linear-gradient(to left, rgb(0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 30%, transparent 100%)"
              }}
            />

            {/* Logo 1 - Floqer */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <img
                src="https://www.floqer.com/logo-dark-wb.svg"
                alt="Floqer"
                className="h-full w-auto object-contain grayscale opacity-100"
                style={{ filter: 'grayscale(100%) brightness(400%)' }}
              />
            </div>

            {/* Logo 2 - Shield Funding */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <span className="text-white font-bold text-lg lg:text-xl tracking-wide whitespace-nowrap">
                SHIELD FUNDING
              </span>
            </div>

            {/* Logo 3 - EPC VIP */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <img
                src="https://www.epcvip.com/build/images/epcvip_v2x2.png"
                alt="EPC VIP"
                className="h-full w-auto object-contain opacity-100"
                style={{ filter: 'brightness(0) invert(1) brightness(150%)' }}
              />
            </div>

            {/* Logo 4 - Gravity */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <img
                src="https://www.trygravity.ai/assets/Gravity%20lockup%20white%20on%20black%20libre%20baskerville-0pJUGtNY.png"
                alt="Gravity"
                className="h-full w-auto object-contain opacity-100"
                style={{ filter: 'brightness(0) invert(1) brightness(150%)' }}
              />
            </div>

            {/* Logo 5 - Dell */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <span className="text-white font-bold text-lg lg:text-xl tracking-wider italic">
                DELL
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 2b: Pricing - Dashboard Style */}
        <section id="pricing" className="pt-24 lg:pt-32 pb-12 lg:pb-16 relative scroll-mt-20 bg-black">
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            {/* Header */}
            <div className="text-center mb-20">
              <h2 className="text-sm text-zinc-400 flex items-center justify-center gap-2 mb-6">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Pricing
              </h2>
              <p className="text-3xl md:text-4xl lg:text-5xl font-bold text-white max-w-4xl mx-auto leading-tight">
                Only pay for the emails we find
              </p>
              <p className="text-xl md:text-2xl lg:text-3xl font-medium text-zinc-400 max-w-4xl mx-auto mt-4">
                Credits never expire
              </p>
            </div>

            {/* PRICING PLANS SECTION - Full Plan Comparison */}
            <PricingSlider variant="marketing" />
          </div>
        </section>

        {/* SECTION 4: Integrations Showcase - TEMPORARILY HIDDEN until integrations are ready */}
        {/* <IntegrationsShowcase /> */}

        {/* CTA: Schedule onboarding call */}
        <section className="bg-black py-16 relative">
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center">
              <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.1] tracking-tight mb-6">Have More Questions?</h3>
              <p className="text-lg text-zinc-400 mb-8">
                Schedule an onboarding call with our team
              </p>
              <div
                className="calendly-inline-widget rounded-lg overflow-hidden mx-auto"
                data-url="https://calendly.com/billionverifier-support/30min?hide_event_type_details=1&hide_gdpr_banner=1&background_color=f0f4f7&primary_color=0099ff"
                style={{ minWidth: "320px", height: "620px", maxWidth: "800px" }}
              />
              <Script
                src="https://assets.calendly.com/assets/external/widget.js"
                strategy="afterInteractive"
              />
            </div>
          </div>
        </section>

        {/* SECTION 5: FAQ */}
        <section className="bg-black py-24 lg:py-32 relative">
          <div className="relative max-w-[90rem] mx-auto px-4 lg:px-6">
            {/* Section Header */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.1] tracking-tight mb-6">
                Frequently Asked{" "}
                <span className="text-white">Questions</span>
              </h2>
              <p className="text-lg text-zinc-400 max-w-xl mx-auto">
                Everything you need to know about BillionVerifier
              </p>
            </div>

            {/* FAQ Items */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {faqItems.map((item, index) => (
                <div
                  key={index}
                  className={`rounded-2xl border transition-all duration-300 ${
                    openFaqIndex === index
                      ? "border-[#0099FF]/40 bg-zinc-900/50"
                      : "border-white/[0.08] bg-zinc-900/30 hover:border-white/[0.15]"
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between py-4 px-5 text-left"
                  >
                    <span className="text-lg font-semibold text-white pr-4">
                      {item.question}
                    </span>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                        openFaqIndex === index
                          ? "bg-[#0099FF]/20"
                          : "bg-zinc-800"
                      }`}
                    >
                      <ChevronDown
                        className={`w-5 h-5 text-[#0099FF] transition-transform duration-300 ${
                          openFaqIndex === index ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      openFaqIndex === index ? "max-h-[600px]" : "max-h-0"
                    }`}
                  >
                    <div className="px-5 pb-4 text-zinc-300 leading-relaxed">
                      {item.answer}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      <LandingFooter />
    </div>
  );
}
