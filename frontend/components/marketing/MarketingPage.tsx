"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Script from "next/script";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { IntegrationsShowcase } from "./IntegrationsShowcase";
import { PricingSlider } from "../pricing/PricingSlider";
import { Check, Users, Sparkles, ShieldCheck, ChevronDown } from "lucide-react";

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

const howItWorksSticky = [
  {
    number: "01",
    headline: "Filter For Your ICP",
    description:
      "Filter by industry, title, company size, location, and dozens more - to instantly surface your ideal prospects from a database of 1.3 billion B2B profiles.",
    image: "/images/step-1-screenshot.png",
  },
  {
    number: "02",
    headline: "Extract Your Target Profiles",
    description:
      "Submit your Sales Nav search URL and session cookie, and we'll extract your entire search at 1,000 profiles per 6 minutes.",
    image: "/images/step-2-cookie.png",
  },
  {
    number: "03",
    headline: "Find Valid Emails",
    description:
      "Upload your profiles and we'll find and verify over 20,000 emails per hour. We guarantee a sub 1% hard bounce rate on all emails marked as valid.",
    image: "/images/step-3-screenshot.png",
  },
];

// Default credit price for non-logged-in users (trial rate)
const DEFAULT_CREDIT_PRICE = 0.0022;
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 500;

const faqItems = [
  {
    question: "Do I need a LinkedIn Sales Navigator Account?",
    answer: (
      <>
        <p className="mb-4">Yes - Sales Navigator is required to use BillionVerifier&apos;s scraping feature.</p>
        <p>If you don&apos;t have one yet, contact us at support@billionverifier.io and we&apos;ll share an exclusive 75% discount to get you set up.</p>
      </>
    ),
  },
  {
    question: "What data fields are returned when I scrape a Sales Nav profile?",
    answer: (
      <>
        <p className="mb-4">Every scraped profile includes the full set of LinkedIn data - no fields left behind:</p>
        <p className="font-semibold text-landing-heading mb-2">Personal:</p>
        <p className="mb-4">First name, Last name, About, Current position, Position description, LinkedIn URL, LinkedIn ID, Location</p>
        <p className="font-semibold text-landing-heading mb-2">Company:</p>
        <p>Company name, Company LinkedIn URL, Company website, Company description, Specialities/keywords, Employee count, Industry, Year founded, HQ location, Company LinkedIn ID</p>
      </>
    ),
  },
  {
    question: "How Many Profiles can I Scrape per day?",
    answer: (
      <>
        <p className="mb-4">To protect your LinkedIn account from potential flagging or suspension, we limit scraping to 15,000 profiles per day per account.</p>
        <p className="mb-4">This keeps your account within LinkedIn&apos;s safe activity thresholds.</p>
        <p>However, If you have a second Sales Navigator account, you can reset your daily limit directly from your Sales Nav Scraper dashboard.</p>
      </>
    ),
  },
  {
    question: "Do I need to re-verify emails found during enrichment?",
    answer: (
      <>
        <p className="mb-4">No. Every email marked as Valid is already verified. You can send with confidence straight from your results.</p>
        <p>That said, if you&apos;d like to run them through verification again for peace of mind, you&apos;re welcome to - you won&apos;t be charged for verification on any paid plan.</p>
      </>
    ),
  },
  {
    question: "Does BillionVerifier clean my scraped data?",
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
          <li>Don&apos;t use other LinkedIn scraping tools on the same day</li>
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
    answer: "Yes, we guarantee a sub 1% hard bounce rate on any emails marked as \"valid\".",
  },
];

export function MarketingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const toggleFaq = (index: number) => setOpenFaqIndex(openFaqIndex === index ? null : index);
  const validEmails = useDailyCounter(412_723, 1_417_136);
  const bouncesPrevented = useDailyCounter(236_451, 739_586);
  const totalEmailsFound = useDailyCounter(748_395_192, 749_395_192);

  const [activeHiwStep, setActiveHiwStep] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const hiwObserverRef = useRef<IntersectionObserver | null>(null);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  // Callback ref that sets up observation when elements mount
  const setHiwStepRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (!el || !hiwObserverRef.current) return;
      (el as HTMLElement & { _hiwIndex?: number })._hiwIndex = index;
      hiwObserverRef.current.observe(el);
    },
    []
  );

  useEffect(() => {
    hiwObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = (entry.target as HTMLElement & { _hiwIndex?: number })._hiwIndex;
            if (typeof idx === "number") setActiveHiwStep(idx);
          }
        });
      },
      { threshold: 0.5, rootMargin: "0px 0px -20% 0px" }
    );

    return () => {
      hiwObserverRef.current?.disconnect();
    };
  }, []);

  // Scroll progress tracking for the progress line and step 02
  useEffect(() => {
    const handleScroll = () => {
      if (!stepsContainerRef.current) return;
      
      const container = stepsContainerRef.current;
      const rect = container.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate progress based on how much of the container has scrolled through viewport
      const containerTop = rect.top;
      const containerHeight = rect.height;
      
      // Start progress when container top reaches center of viewport
      // End progress when container bottom reaches center of viewport
      const centerOffset = windowHeight / 2;
      const start = containerTop - centerOffset;
      const end = containerTop + containerHeight - centerOffset;
      const total = end - start;
      
      const progress = Math.max(0, Math.min(1, -start / total));
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial calculation
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1 bg-[#0D0F12] bg-blueprint-grid">
        {/* SECTION 1: Hero Section */}
        <section className="relative flex flex-col pt-20 pb-12 lg:pb-20">
          <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6) 75%, rgb(0,0,0) 100%)" }} />

          <div className="relative flex-1 flex flex-col items-center max-w-6xl mx-auto px-6 lg:px-8 pt-16 lg:pt-24 pb-0">
            <div className="text-center animate-fade-in-up mb-12">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-landing-accent/30 bg-landing-accent/10 mb-6">
                <span className="px-2 py-0.5 rounded-full bg-landing-accent/20 text-landing-accent font-semibold text-xs">
                  Built By
                </span>
                <span className="text-landing-text font-medium text-xs">
                  High-Volume Senders
                </span>
              </div>

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
                  Free Credits
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

            {/* Dashboard Preview */}
            <div className="relative w-full max-w-5xl mx-auto mt-4 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              <div className="relative rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                <img
                  src="/images/dashboard-preview.png"
                  alt="BillionVerifier dashboard — email verification results"
                  className="w-full block"
                />
                {/* Per-row email blur overlays */}
                {[63, 72.5, 82, 91.5].map((top) => (
                  <div
                    key={top}
                    className="absolute pointer-events-none backdrop-blur-[3px]"
                    style={{ left: "43%", width: "22%", top: `${top}%`, height: "5%" }}
                  />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none" />
            </div>

          </div>

        </section>

        {/* Live Stats Counter */}
        <section className="pt-16 lg:pt-20 pb-16 lg:pb-20 bg-black border-t border-b border-white/[0.06] flex items-center justify-center min-h-[140px]">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-16 text-center items-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-lg md:text-xl font-semibold text-landing-text tabular-nums tracking-tight">
                  {validEmails.toLocaleString()}
                </span>
                <span className="text-sm lg:text-base text-landing-muted uppercase tracking-wide">
                  Valid Emails Found Today
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-lg md:text-xl font-semibold text-landing-text tabular-nums tracking-tight">
                  {bouncesPrevented.toLocaleString()}
                </span>
                <span className="text-sm lg:text-base text-landing-muted uppercase tracking-wide">
                  Bounces Prevented Today
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-lg md:text-xl font-semibold text-landing-text tabular-nums tracking-tight">
                  {totalEmailsFound.toLocaleString()}
                </span>
                <span className="text-sm lg:text-base text-landing-muted uppercase tracking-wide">
                  Total Emails Found
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Grid - Key Value Props */}
        <section className="bg-black pt-10 lg:pt-12 pb-8 lg:pb-12 relative overflow-hidden">
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center mb-16 lg:mb-20">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Why Teams Switch to BillionVerifier
              </h2>
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {/* Card 1: Quality Guarantee */}
              <div className="group relative p-6 lg:p-8 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm transition-all duration-500 hover:border-landing-accent/40 hover:shadow-[0_0_60px_rgba(0,163,255,0.12)]">
                {/* Glow effect */}
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-landing-accent/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
                
                <div className="relative">
                  {/* Header */}
                  <h3 className="text-lg lg:text-xl font-bold text-white mb-2 tracking-tight">
                    Quality Guarantee
                  </h3>
                  
                  {/* Description */}
                  <p className="text-white/70 text-sm leading-relaxed">
                    We Guarantee a Sub 1% Hard Bounce Rate on All Emails Marked as Valid.
                  </p>
                </div>
              </div>

              {/* Card 2: Credits Never Expire */}
              <div className="group relative p-6 lg:p-8 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm transition-all duration-500 hover:border-landing-accent/40 hover:shadow-[0_0_60px_rgba(0,163,255,0.12)]">
                {/* Glow effect */}
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-landing-accent/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
                
                <div className="relative">
                  {/* Header */}
                  <h3 className="text-lg lg:text-xl font-bold text-white mb-2 tracking-tight">
                    Credits Never Expire
                  </h3>
                  
                  {/* Description */}
                  <p className="text-white/70 text-sm leading-relaxed">
                    No monthly pressure, no wasted credits.
                  </p>
                </div>
              </div>

              {/* Card 3: 1.3 Billion B2B Profiles */}
              <div className="group relative p-6 lg:p-8 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm transition-all duration-500 hover:border-landing-accent/40 hover:shadow-[0_0_60px_rgba(0,163,255,0.12)]">
                {/* Glow effect */}
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-landing-accent/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
                
                <div className="relative">
                  {/* Header */}
                  <h3 className="text-lg lg:text-xl font-bold text-white mb-2 tracking-tight">
                    1.3 Billion B2B Profiles
                  </h3>
                  
                  {/* Description */}
                  <p className="text-white/70 text-sm leading-relaxed">
                    Filter & Extract Profile From The World&apos;s Largest B2B Database
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: How it Works — Sticky Scroll */}
        <section className="relative bg-black">
          <div className="relative w-full px-6 lg:px-8 py-24 lg:py-32">
            {/* Section Header */}
            <div className="text-center mb-16 lg:mb-24 animate-fade-in">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-heading leading-[1.15] tracking-tight">
                <span className="block">Built by Enterprise Senders</span>
                <span className="block">
                  Who <span className="text-landing-accent">Prioritize Performance</span> at Scale
                </span>
              </h2>
            </div>

            {/* Sticky Layout: Image Left, Scrolling Steps Right */}
            <div className="flex flex-col lg:flex-row items-start justify-center gap-12 lg:gap-20">
              {/* Left — Sticky Image Panel - pushed down to align with step 00 */}
              <div className="lg:w-[45%] lg:sticky lg:top-[25vh] self-start lg:mt-[15vh]">
                <div
                  className="relative rounded-2xl overflow-hidden bg-[#0a0a0a]"
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: `
                      0 20px 40px -12px rgba(0,0,0,0.9),
                      inset 0 1px 0 rgba(255,255,255,0.05)
                    `,
                  }}
                >
                  {/* Step 0 — Dashboard Stats */}
                  <img
                    src="/images/dashboard-stats.png"
                    alt="Enterprise campaign performance dashboard"
                    className="w-full h-full object-cover"
                    style={{
                      opacity: activeHiwStep === 0 ? 1 : 0,
                      transition: "opacity 0.4s ease-in-out",
                      position: activeHiwStep === 0 ? "relative" : "absolute",
                    }}
                  />
                  {howItWorksSticky.map((step, i) => {
                    // Step 02 (index 1) uses a single combined image
                    if (i === 1) {
                      return (
                        <img
                          key={`${step.number}-combined`}
                          src="/images/step-2-combined.png"
                          alt="LinkedIn Authentication and Sales Navigator URL"
                          className="w-full h-full object-cover"
                          style={{
                            opacity: activeHiwStep === 2 ? 1 : 0,
                            transition: "opacity 0.4s ease-in-out",
                            position: activeHiwStep === 2 ? "relative" : "absolute",
                            top: 0,
                            left: 0,
                          }}
                        />
                      );
                    }

                    // Step 01 and 03 - normal behavior
                    return (
                      <img
                        key={step.number}
                        src={step.image}
                        alt={step.headline}
                        className="w-full h-full object-cover"
                        style={{
                          opacity: activeHiwStep === i + 1 ? 1 : 0,
                          transition: "opacity 0.4s ease-in-out",
                          position: activeHiwStep === i + 1 ? "relative" : "absolute",
                          top: 0,
                          left: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Right — All Scrollable Steps (00, 01, 02, 03) with Progress Line */}
              <div ref={stepsContainerRef} className="lg:w-[45%] flex flex-col relative">
                {/* Progress Line Container - starts aligned with image top (15vh offset) */}
                <div className="absolute left-[22px] top-[15vh] bottom-0 w-[3px] hidden lg:block">
                  {/* Background track (dimmed) */}
                  <div className="absolute inset-0 bg-zinc-800/50 rounded-full" />
                  
                  {/* Active progress - dot that grows into a line */}
                  <div className="absolute top-0 left-0 w-full" style={{ height: '100%' }}>
                    {/* The fill starts as a dot and grows downward */}
                    <div 
                      className="w-full bg-[#0099FF] rounded-full origin-top"
                      style={{ 
                        height: scrollProgress < 0.01 ? '8px' : `${scrollProgress * 100}%`,
                        minHeight: '8px',
                        transition: 'height 0.1s ease-out',
                      }}
                    />
                  </div>
                  
                  {/* Blue dot at the starting point (always visible) */}
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 w-[8px] h-[8px] bg-[#0099FF] rounded-full"
                    style={{ 
                      top: '0px',
                      boxShadow: '0 0 8px rgba(0, 153, 255, 0.5)',
                    }}
                  />
                </div>

                {/* Step 00 */}
                <div
                  ref={setHiwStepRef(0)}
                  className="flex items-center justify-center"
                  style={{
                    minHeight: "60vh",
                    opacity: activeHiwStep === 0 ? 1 : 0.35,
                    transition: "opacity 0.4s ease-in-out",
                  }}
                >
                  <div className="py-12 max-w-[400px] pl-6">
                    <h3 className="text-2xl lg:text-[28px] font-bold text-white leading-tight mb-4">
                      Scale Your Outbound<br />in 3 Steps
                    </h3>
                  </div>
                </div>

                {/* Steps 01, 02, 03 */}
                {howItWorksSticky.map((step, i) => (
                  <div
                    key={step.number}
                    ref={setHiwStepRef(i + 1)}
                    className="flex items-center justify-center"
                    style={{
                      minHeight: "60vh",
                      opacity: activeHiwStep === i + 1 ? 1 : 0.35,
                      transition: "opacity 0.4s ease-in-out",
                    }}
                  >
                    <div className="py-12 max-w-[400px] pl-6">
                      <span className="text-landing-accent text-sm font-semibold tracking-[0.2em] uppercase mb-4 block">
                        {step.number}
                      </span>
                      <h3 className="text-2xl lg:text-[28px] font-bold text-white leading-tight mb-4">
                        {step.headline}
                      </h3>
                      <p className="text-zinc-400 text-base leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Trusted By Logos */}
        <section className="pt-8 lg:pt-10 pb-16 lg:pb-20 bg-black border-t border-b border-white/[0.06]">
          <h3 className="text-base uppercase tracking-widest text-landing-text mb-10 text-center animate-fade-in">
            Trusted by thousands of industry leaders
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
                className="h-full w-auto object-contain grayscale brightness-200 opacity-80"
              />
            </div>

            {/* Logo 2 - PlusVibe */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <img
                src="https://app.plusvibe.ai/v2/images/logo.svg"
                alt="PlusVibe"
                className="h-full w-auto object-contain grayscale brightness-150 opacity-70"
              />
            </div>

            {/* Logo 3 - EPC VIP */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <img
                src="https://www.epcvip.com/build/images/epcvip_v2x2.png"
                alt="EPC VIP"
                className="h-full w-auto object-contain brightness-0 invert opacity-70"
              />
            </div>

            {/* Logo 4 - Gravity */}
            <div className="flex items-center justify-center shrink-0 h-7 lg:h-9 mt-12">
              <img
                src="https://www.trygravity.ai/assets/Gravity%20lockup%20white%20on%20black%20libre%20baskerville-0pJUGtNY.png"
                alt="Gravity"
                className="h-full w-auto object-contain brightness-0 invert opacity-70"
              />
            </div>
          </div>
        </section>

        {/* SECTION 2b: Pricing - Dashboard Style */}
        <section id="pricing" className="py-24 lg:py-32 relative scroll-mt-20 bg-black">
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            {/* Header */}
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
                Wholesale Pricing
              </h2>
              <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                All paid plans include uncapped enrichment & verification, credits never expire
              </p>
            </div>

            {/* PRICING PLANS SECTION - Full Plan Comparison */}
            <PricingSlider variant="marketing" />
          </div>
        </section>

        {/* SECTION 4: Integrations Showcase */}
        <IntegrationsShowcase />

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
                style={{ minWidth: "320px", height: "700px", maxWidth: "800px" }}
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
                <span className="text-[#0099FF]">Questions</span>
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
