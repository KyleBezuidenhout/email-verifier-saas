"use client";

import Link from "next/link";
import { EmailTestForm } from "./EmailTestForm";
import { Navbar } from "@/components/common/Navbar";
import { Footer } from "@/components/common/Footer";

export function MarketingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-omni-black">
      <Navbar />
      <main className="flex-1 pt-[70px]">
        {/* Hero Section */}
        <section className="bg-omni-black py-16 md:py-24 px-6 md:px-16">
          <div className="max-w-[900px] mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-omni-cyan/15 px-3 py-1.5 rounded-full mb-6">
              <svg className="w-4 h-4 text-omni-black" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <span className="text-omni-black font-medium text-sm">New: Lightning Fast Verification</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-[48px] md:text-[64px] font-bold text-omni-white leading-[1.2] tracking-[-0.02em] mb-4">
              Find & Verify Emails{" "}
              <span className="text-omni-cyan">10x Faster</span>
            </h1>

            {/* Subheadline */}
            <p className="text-base md:text-lg text-omni-gray leading-relaxed max-w-[600px] mx-auto mb-12">
              Process up to 250M leads in minutes. Get verified emails at $0.10 each.
              Lightning-fast processing with bank-level security.
            </p>

            {/* Primary CTA */}
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-omni-cyan text-omni-black px-8 py-4 rounded-xl font-medium text-base hover:opacity-90 transition-all mb-12"
            >
              Get Free Credits
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* Supporting Features */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-10 md:gap-16 mt-12">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-omni-cyan rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-omni-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-omni-white font-medium text-base">Lightning Fast</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-omni-cyan rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-omni-black" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-omni-white font-medium text-base">10x Cheaper</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-omni-cyan rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-omni-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-omni-white font-medium text-base">250M+ Capacity</span>
              </div>
            </div>
          </div>
        </section>

        {/* Try It For Yourself Section - PRESERVED AS-IS */}
        <section className="bg-omni-black py-16 md:py-24 px-6 md:px-16">
          <div className="max-w-7xl mx-auto">
            <EmailTestForm />
          </div>
        </section>

        {/* About Section */}
        <section className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[900px] mx-auto text-center">
            <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-12">Our Story</h2>
            <p className="text-base md:text-lg text-omni-gray leading-relaxed mb-6">
              Built by the founders of a leading email infrastructure company, we&apos;ve spent years at the intersection of email delivery and cold outreach. We&apos;ve overseen over 4M emails being sent daily, and we noticed something alarming: lead prices have skyrocketed since we started, making it increasingly difficult for founders and sales teams to scale affordably.
            </p>
            <p className="text-base md:text-lg text-omni-gray leading-relaxed mb-12">
              So we took it into our own hands. We built a solution designed specifically for cold email senders—whether you&apos;re just starting out or sending millions of emails daily. Billion Verifier is the market&apos;s{" "}
              <span className="text-omni-cyan">most affordable</span>,{" "}
              <span className="text-omni-cyan">beginner-friendly</span>, and{" "}
              <span className="text-omni-cyan">infinitely scalable</span> email verification platform. No complexity. No hidden costs. Just clean, verified leads.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-omni-cyan text-omni-black px-8 py-4 rounded-xl font-medium text-base hover:opacity-90 transition-all"
            >
              Start Verifying Today
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* Dashboard Preview Section */}
        <section id="benefits" className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[1000px] mx-auto">
            <div className="bg-omni-dark border border-omni-border rounded-2xl p-8 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
                {/* Sidebar */}
                <div className="bg-omni-black rounded-xl p-4 space-y-2">
                  <div className="px-4 py-3 text-omni-white text-sm font-medium rounded-lg bg-omni-cyan/20 text-omni-cyan">Validate</div>
                  <div className="px-4 py-3 text-omni-gray text-sm font-medium rounded-lg hover:bg-omni-dark transition-colors cursor-pointer">Upload</div>
                  <div className="px-4 py-3 text-omni-gray text-sm font-medium rounded-lg hover:bg-omni-dark transition-colors cursor-pointer">Credits</div>
                  <div className="px-4 py-3 text-omni-gray text-sm font-medium rounded-lg hover:bg-omni-dark transition-colors cursor-pointer">Get Credits</div>
                  <div className="px-4 py-3 text-omni-gray text-sm font-medium rounded-lg hover:bg-omni-dark transition-colors cursor-pointer">Referrals</div>
                  <div className="px-4 py-3 text-omni-gray text-sm font-medium rounded-lg hover:bg-omni-dark transition-colors cursor-pointer">Settings</div>
                </div>
                {/* Main Content */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-omni-white">Credits</h3>
                    <div className="flex gap-3">
                      <button className="px-4 py-2 bg-omni-cyan text-omni-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                        Upload
                      </button>
                      <button className="px-4 py-2 bg-omni-cyan text-omni-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                        Settings
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div className="bg-omni-black rounded-xl p-6 border border-omni-border">
                      <div className="text-sm text-omni-gray mb-2">Available Credits</div>
                      <div className="text-4xl font-bold text-omni-white">1,250</div>
                    </div>
                    <div className="bg-omni-black rounded-xl p-6 border border-omni-border">
                      <div className="text-sm text-omni-gray mb-2">Used This Month</div>
                      <div className="text-4xl font-bold text-omni-white">3,450</div>
                    </div>
                  </div>
                  <button className="w-full bg-omni-cyan text-omni-black py-3 rounded-xl font-medium hover:opacity-90 transition-opacity">
                    Buy More Credits
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[1200px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
              <div className="text-center">
                <div className="text-[48px] md:text-[64px] font-bold text-omni-white mb-4">250M+</div>
                <div className="text-base md:text-lg text-omni-gray">Leads Processed</div>
              </div>
              <div className="text-center">
                <div className="text-[48px] md:text-[64px] font-bold text-omni-white mb-4">99.9%</div>
                <div className="text-base md:text-lg text-omni-gray">Uptime Guarantee</div>
              </div>
              <div className="text-center">
                <div className="text-[48px] md:text-[64px] font-bold text-omni-white mb-4">$0.10</div>
                <div className="text-base md:text-lg text-omni-gray">Per Verified Email</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-4">Everything You Need to Scale</h2>
              <p className="text-base md:text-lg text-omni-gray">Powerful features for modern sales teams</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
              {[
                { icon: "⚡", title: "Lightning Fast", desc: "Process 170 emails every 30 seconds. Get results in minutes, not hours." },
                { icon: "💰", title: "10x Cheaper", desc: "Only $0.10 per verified email. Competitors charge $0.50+. Save thousands." },
                { icon: "📈", title: "Massive Scale", desc: "Handle 250M+ leads effortlessly. Built for enterprise-scale operations." },
                { icon: "🔒", title: "Bank-Level Security", desc: "TLS 1.3 encryption, GDPR compliant, SOC 2 Type II certified." },
                { icon: "🎯", title: "Smart Permutations", desc: "AI-powered email pattern detection. Find the right email format automatically." },
                { icon: "📋", title: "SalesNav Integration", desc: "Import directly from LinkedIn Sales Navigator. Auto-enrich with verified emails." },
              ].map((feature, i) => (
                <div key={i} className="bg-omni-dark border border-omni-border rounded-2xl p-8 hover:border-omni-cyan/50 transition-all">
                  <div className="w-12 h-12 bg-omni-cyan rounded-xl flex items-center justify-center mb-5 mx-auto">
                    <span className="text-2xl">{feature.icon}</span>
                  </div>
                  <h3 className="text-xl font-bold text-omni-white mb-4 text-center">{feature.title}</h3>
                  <p className="text-base text-omni-gray leading-relaxed text-center">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section id="process" className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-4">How It Works</h2>
              <p className="text-base md:text-lg text-omni-gray">Simple, fast, and reliable</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
              {[
                { step: "1", title: "Upload Your CSV", desc: "Upload your lead list with names and company websites. We support flexible column mapping." },
                { step: "2", title: "We Verify Emails", desc: "Our system generates email permutations and verifies them using industry-leading validation." },
                { step: "3", title: "Download Results", desc: "Get your verified emails instantly. Download as CSV with all verification details." },
              ].map((step, i) => (
                <div key={i} className="bg-omni-dark border border-omni-border rounded-2xl p-8 text-center">
                  <div className="w-12 h-12 bg-omni-cyan rounded-xl flex items-center justify-center mb-5 mx-auto">
                    <span className="text-omni-black font-bold text-xl">{step.step}</span>
                  </div>
                  <h3 className="text-xl font-bold text-omni-white mb-4">Step {step.step}: {step.title}</h3>
                  <p className="text-base text-omni-gray leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[900px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-4">Simple, Transparent Pricing</h2>
              <p className="text-base md:text-lg text-omni-gray">Pay only for verified emails. No hidden fees, no subscriptions.</p>
            </div>
            {/* Tab Toggle */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex bg-omni-dark border border-omni-border rounded-xl p-1.5">
                <button className="px-6 py-2 bg-omni-cyan text-omni-black rounded-lg text-sm font-medium">
                  Standard Validation
                </button>
                <button className="px-6 py-2 text-omni-gray rounded-lg text-sm font-medium hover:text-omni-white transition-colors">
                  Catchall Validation
                </button>
              </div>
            </div>
            <div className="bg-omni-dark border border-omni-border rounded-2xl p-10 text-center">
              <div className="text-sm text-omni-gray mb-4">One-Time</div>
              <div className="text-[48px] md:text-[64px] font-bold text-omni-cyan mb-8">
                $0.10<span className="text-2xl">/email</span>
              </div>
              <div className="space-y-4 mb-8 text-left max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-omni-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-omni-gray">Valid emails</span>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-omni-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-omni-gray">Catchall detection</span>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-omni-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-omni-gray">Real-time processing</span>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-omni-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-omni-gray">CSV export</span>
                </div>
              </div>
              <Link
                href="/register"
                className="block w-full bg-omni-cyan text-omni-black py-4 rounded-xl font-medium text-base hover:opacity-90 transition-all"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </section>

        {/* Comparison Table Section */}
        <section className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-4">Compare With Competitors</h2>
              <p className="text-base md:text-lg text-omni-gray">See how we stack up against the competition</p>
            </div>
            <div className="bg-omni-dark border border-omni-border rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-omni-black border-b border-omni-border">
                    <th className="px-6 py-4 text-left text-sm font-bold text-omni-white">Features</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-omni-white">Competitor A</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-omni-cyan bg-omni-cyan/10">Billion Verifier</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-omni-white">Competitor B</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Price per email", compA: "$0.50", us: "$0.10", compB: "$0.45" },
                    { feature: "Processing Speed", compA: "Slow", us: "Fast (170/30s)", compB: "Medium" },
                    { feature: "Max Leads", compA: "10M", us: "250M+", compB: "50M" },
                    { feature: "API Access", compA: "✓", us: "✓", compB: "✗" },
                    { feature: "CSV Export", compA: "✓", us: "✓", compB: "✓" },
                    { feature: "GDPR Compliant", compA: "✓", us: "✓", compB: "✗" },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-omni-border last:border-0">
                      <td className="px-6 py-4 text-sm text-omni-gray">{row.feature}</td>
                      <td className="px-6 py-4 text-center text-sm text-omni-gray">{row.compA}</td>
                      <td className="px-6 py-4 text-center text-sm text-omni-cyan bg-omni-cyan/10 font-medium">{row.us}</td>
                      <td className="px-6 py-4 text-center text-sm text-omni-gray">{row.compB}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section id="testimonials" className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-4">What Our Customers Say</h2>
              <p className="text-base md:text-lg text-omni-gray">Trusted by thousands of sales teams worldwide</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
              {[
                { quote: "Billion Verifier has saved us thousands of dollars. The speed and accuracy are unmatched.", name: "Sarah Johnson", title: "VP of Sales, TechCorp" },
                { quote: "We process millions of leads monthly. This platform scales effortlessly and never breaks.", name: "Michael Chen", title: "Founder, GrowthLab" },
                { quote: "Best investment we've made for our cold outreach. ROI is incredible.", name: "Emily Rodriguez", title: "Sales Director, StartupXYZ" },
              ].map((testimonial, i) => (
                <div key={i} className="bg-omni-dark border border-omni-border rounded-2xl p-8">
                  <p className="text-base text-omni-gray italic leading-relaxed mb-6">
                    &quot;{testimonial.quote}&quot;
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-omni-cyan rounded-full flex items-center justify-center">
                      <span className="text-omni-black font-bold text-lg">
                        {testimonial.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-omni-white">{testimonial.name}</div>
                      <div className="text-xs text-omni-gray">{testimonial.title}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="bg-omni-black py-20 md:py-28 px-6 md:px-16">
          <div className="max-w-[800px] mx-auto text-center">
            <h2 className="text-[36px] md:text-[48px] font-bold text-omni-white mb-4">
              Ready to Scale Your Outreach?
            </h2>
            <p className="text-base md:text-lg text-omni-gray mb-12">
              Join thousands of companies verifying millions of emails every month.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-omni-cyan text-omni-black px-10 py-5 rounded-xl font-medium text-lg hover:opacity-90 transition-all"
            >
              Get Started Free
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
