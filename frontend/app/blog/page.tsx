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
          <Link
            href="/#features"
            className="text-gray-300 hover:text-[#0099FF] text-sm font-medium transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#pricing"
            className="text-gray-300 hover:text-[#0099FF] text-sm font-medium transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/blog"
            className="text-[#0099FF] text-sm font-medium transition-colors"
          >
            Blog
          </Link>
        </nav>

        <div className="flex items-center gap-6 justify-self-end">
          <Link
            href="/login"
            className="text-gray-300 hover:text-[#0099FF] text-sm font-semibold tracking-wide transition-all duration-300"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-[#0099FF] text-black px-6 py-3 font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-[#0099FF]/90"
          >
            2,000 Free Credits
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

const blogPosts = [
  {
    slug: "intent-data-platforms-lying",
    title: "Every Intent Data Platform Is Lying To You - Here's what they can't see",
    excerpt: "Most intent data works the same way. A company like ZoomInfo or 6sense tracks anonymous behavioral signals across a network of third-party publishers. But LinkedIn's data is structurally different.",
    date: "April 15, 2026",
    readTime: "5 min read"
  }
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <LandingHeader />
      
      <main className="pt-32 pb-20 px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Blog Grid */}
          <div className="grid gap-8">
            {blogPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block p-8 rounded-2xl border border-[#252A31] bg-[#0D0F12] hover:border-[#0099FF]/50 transition-all duration-300"
              >
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span>{post.date}</span>
                  <span className="w-1 h-1 rounded-full bg-gray-600" />
                  <span>{post.readTime}</span>
                </div>
                <h2 className="text-2xl font-bold mb-4 group-hover:text-[#0099FF] transition-colors">
                  {post.title}
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  {post.excerpt}
                </p>
                <div className="mt-6 flex items-center text-[#0099FF] font-medium">
                  Read more
                  <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
