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
          ? "bg-[#0D0F12]/95 backdrop-blur-sm border-b border-[#252A31]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-landing-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="square"
                strokeLinejoin="miter"
                d="M4 7V4h16v3M9 20h6M12 4v16"
              />
            </svg>
          </div>
          <span className="text-landing-heading font-bold text-xl tracking-tight">
            Billionverifier<span className="text-landing-accent">.io</span>
          </span>
        </Link>

        {/* Navigation */}
        <div className="flex items-center gap-6">
          <Link
            href="/how-it-works"
            className="text-landing-muted hover:text-landing-text text-sm font-medium transition-colors"
          >
            How it Works
          </Link>
          <Link
            href="/login"
            className="text-landing-muted hover:text-landing-text text-sm font-medium transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="bg-landing-accent text-landing-bg px-6 py-3 font-semibold text-sm tracking-wide hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
          >
            Request Access
          </Link>
        </div>
      </div>
    </header>
  );
}

