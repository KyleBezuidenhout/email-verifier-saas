"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0D0F12]/95 backdrop-blur-sm border-b border-[#252A31]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 grid grid-cols-3 items-center">
        <Link href="/" className="flex items-center group justify-self-start">
          <span className="text-[#0099FF] font-bold text-2xl tracking-tight">
            BillionVerifier
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 justify-self-center">
          <Link href="/#features" className="text-gray-300 hover:text-[#0099FF] text-sm font-medium transition-colors">
            Features
          </Link>
          <Link href="/#pricing" className="text-gray-300 hover:text-[#0099FF] text-sm font-medium transition-colors">
            Pricing
          </Link>
          <Link href="/blog" className="text-[#0099FF] text-sm font-medium transition-colors">
            Blog
          </Link>
        </nav>

        <div className="flex items-center gap-6 justify-self-end">
          <Link href="/login" className="text-gray-300 hover:text-[#0099FF] text-sm font-semibold tracking-wide transition-all duration-300">
            Log In
          </Link>
          <Link href="/register" className="inline-flex items-center gap-2 bg-[#0099FF] text-black px-6 py-3 font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-[#0099FF]/90">
            500 Free Credits
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function BlogPostPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <LandingHeader />
      
      <main className="pt-32 pb-20 px-6 lg:px-8">
        <article className="max-w-3xl mx-auto">
          {/* Back Link */}
          <Link href="/blog" className="inline-flex items-center gap-2 text-gray-400 hover:text-[#0099FF] mb-8 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Blog
          </Link>

          {/* Title */}
          <h1 className="text-3xl lg:text-4xl font-bold mb-8 leading-tight">
            Every Intent Data Platform Is Lying To You - Here&apos;s what they can&apos;t see
          </h1>

          {/* Content - All text same size and color, key points in bold */}
          <div className="space-y-6 text-base text-gray-300 leading-relaxed">
            <p>
              Most intent data works the same way.
            </p>

            <p>
              A company like ZoomInfo or 6sense tracks anonymous behavioral signals across a network of third-party publishers. Someone at a company reads three articles about CRM software - that registers as intent. The problem is they&apos;re <strong>inferring identity from IP addresses and cookies</strong>. They often know a company is researching something. They don&apos;t always know who.
            </p>

            <p>
              That&apos;s not a knock on those platforms. It&apos;s just how the data is collected. <strong>Anonymous web behavior has a ceiling</strong>.
            </p>

            <p>
              <strong>LinkedIn&apos;s data is structurally different</strong>.
            </p>

            <p>
              Every signal on Sales Navigator is <strong>identity-resolved</strong> - tied to a specific person, not a probabilistic account match. That&apos;s because the behavior is happening on LinkedIn itself, where people are logged in. <strong>There&apos;s no inference needed</strong>.
            </p>

            <p>
              Just a person, and what they actually did.
            </p>

            <p className="font-bold mt-10">
              What that unlocks specifically
            </p>

            <p className="font-bold mt-6">
              Changed jobs in the last 90 days.
            </p>

            <p>
              LinkedIn has the job change database. <strong>No other provider has this at the individual level in real time</strong> - because no other platform is where people actually update their employment. ZoomInfo is always playing catch-up. A new hire in a relevant role is <strong>one of the highest-converting triggers in outbound</strong>. And nobody else has it fresher.
            </p>

            <p className="font-bold mt-6">
              Product Category Intent.
            </p>

            <p>
              <strong>Not company-level - person-level</strong>. You can surface someone actively researching a specific product category right now, tied to their identity. Third-party intent networks can approximate this at the account level. <strong>LinkedIn can do it at the contact level</strong>.
            </p>

            <p className="font-bold mt-6">
              Buyer Intent Score.
            </p>

            <p>
              <strong>180+ signals</strong> - InMail acceptances, new connections to people at your company, profile views, company page activity. <strong>All identity-resolved</strong>. None of it visible to any outside provider. ZoomInfo can&apos;t see it. <strong>It&apos;s only on LinkedIn</strong>.
            </p>

            <p className="font-bold mt-6">
              Posted on LinkedIn in the last 30 days.
            </p>

            <p>
              This isn&apos;t really an intent signal. <strong>It&apos;s a reachability signal</strong>. Someone who&apos;s been active on the platform recently is more likely to respond to outreach. Simple as that.
            </p>

            <p className="font-bold mt-6">
              Hiring signals.
            </p>

            <p>
              LinkedIn has the actual job postings - not scraped versions. They know the moment a role goes live, the department, the seniority. For outbound, <strong>a new open role in the right department is a budget-or-growth signal with no lag anywhere else</strong>.
            </p>

            <p className="font-bold mt-10">
              Here&apos;s the thing about account-level intent vs. person-level intent.
            </p>

            <p>
              Knowing a company is in-market gets you in the right building.
            </p>

            <p>
              <strong>Knowing which person is showing intent gets you to the right door</strong>.
            </p>

            <p>
              That&apos;s <strong>the gap most intent platforms can&apos;t close</strong> - because they don&apos;t have the identity layer to do it.
            </p>

            <p>
              <strong>Sales Navigator does. It&apos;s just how the platform is built</strong>.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
