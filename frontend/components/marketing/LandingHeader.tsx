"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export function LandingHeader() {
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
          ? "bg-black/95 backdrop-blur-sm border-b border-white/[0.06]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 grid grid-cols-3 items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center group justify-self-start">
          <span className="text-landing-accent font-bold text-2xl tracking-tight">
            BillionVerifier
          </span>
        </Link>

        {/* Center Navigation */}
        <nav className="hidden md:flex items-center gap-8 justify-self-center">
          <Link
            href="/#features"
            className="text-landing-text/70 hover:text-landing-accent text-sm font-medium transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#pricing"
            className="text-landing-text/70 hover:text-landing-accent text-sm font-medium transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/blog"
            className="text-landing-text/70 hover:text-landing-accent text-sm font-medium transition-colors"
          >
            Blog
          </Link>
        </nav>

        {/* Right Navigation */}
        <div className="flex items-center gap-6 justify-self-end">
          <Link
            href="/login"
            className="text-landing-text/70 hover:text-landing-accent text-sm font-semibold tracking-wide transition-all duration-300"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-blue-500 text-black px-6 py-3 rounded-lg font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-blue-600"
          >
            2,000 Credits
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
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
