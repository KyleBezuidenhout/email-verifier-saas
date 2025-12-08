"use client";

import Link from "next/link";
import { SellingPoints, SecurityBadges } from "@/components/common/SellingPoints";
import { Navbar } from "@/components/common/Navbar";
import { Footer } from "@/components/common/Footer";
import { EmailTestForm } from "./EmailTestForm";

export function MarketingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900">
      <Navbar />
      <main className="flex-1">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-purple-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
              For Modern Sales Teams
            </h1>
            <div className="flex justify-center mb-6">
              <svg className="w-32 h-4" viewBox="0 0 200 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 10 Q50 5, 90 10 T170 10" stroke="#ec4899" strokeWidth="3" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-lg md:text-xl text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
              Reach more targets without destroying your reputation with built-in email verification and exceptional data coverage.
            </p>
          </div>

          {/* Email Test Form */}
          <div className="relative">
            <div className="absolute -left-8 top-0 hidden lg:block">
              <div className="flex flex-col items-center">
                <Link
                  href="/register"
                  className="text-red-600 dark:text-red-400 font-medium text-sm mb-2 hover:text-red-700 dark:hover:text-red-300"
                >
                  Try it now
                </Link>
                <svg className="w-8 h-16 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <EmailTestForm />
          </div>
        </div>
      </section>

      {/* Selling Points */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">
            Why Choose EmailVerifier?
          </h2>
          <SellingPoints />
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Everything You Need to Scale
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Lightning Fast
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Process 170 emails every 30 seconds. Get results in minutes, not hours.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                10x Cheaper
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Only $0.10 per verified email. Competitors charge $0.50+. Save thousands.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Massive Scale
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Handle 250M+ leads effortlessly. Built for enterprise-scale operations.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Bank-Level Security
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                TLS 1.3 encryption, GDPR compliant, SOC 2 Type II certified.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Smart Permutations
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                AI-powered email pattern detection. Find the right email format automatically.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                SalesNav Integration
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Import directly from LinkedIn Sales Navigator. Auto-enrich with verified emails.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Pay only for verified emails. No hidden fees, no subscriptions.
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
            <div className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-2">
              $0.10
            </div>
            <div className="text-gray-600 dark:text-gray-400 mb-6">per verified email</div>
            <div className="grid grid-cols-2 gap-4 text-left mb-8">
              <div className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-700 dark:text-gray-300">Valid emails</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-700 dark:text-gray-300">Catchall detection</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-700 dark:text-gray-300">Real-time processing</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-700 dark:text-gray-300">CSV export</span>
              </div>
            </div>
            <Link
              href="/register"
              className="block w-full px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition-all"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">
            Enterprise-Grade Security
          </h2>
          <SecurityBadges />
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Scale Your Outreach?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of companies verifying millions of emails every month.
          </p>
          <Link
            href="/register"
            className="inline-block px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold text-lg hover:bg-blue-50 transition-all shadow-xl"
          >
            Get Started Free
          </Link>
        </div>
      </section>
      </main>
      <Footer />
    </div>
  );
}

