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
        <Link href="/" className="flex items-center group">
          <span className="text-landing-accent font-bold text-2xl tracking-tight">
            BillionVerifier
          </span>
        </Link>

        {/* Navigation */}
        <div className="flex items-center gap-6">
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

