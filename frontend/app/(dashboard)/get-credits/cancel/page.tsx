"use client";

import Link from "next/link";

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-8 max-w-md w-full text-center">
        {/* Cancel Icon */}
        <div className="w-20 h-20 rounded-full bg-dashboard-card flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-dashboard-text mb-2">Payment Cancelled</h1>
        <p className="text-dashboard-text-muted mb-8">
          No worries! Your payment was not processed and you haven&apos;t been charged.
        </p>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/get-credits"
            className="block w-full px-6 py-3 bg-dashboard-accent text-white font-semibold rounded-xl hover:bg-dashboard-accent/90 transition-all"
          >
            Try Again
          </Link>
          <Link
            href="/dashboard"
            className="block w-full px-6 py-3 bg-transparent border border-dashboard-border text-dashboard-text font-semibold rounded-xl hover:border-dashboard-accent hover:text-dashboard-accent transition-all"
          >
            Go to Dashboard
          </Link>
        </div>

        {/* Help Text */}
        <p className="mt-8 text-sm text-dashboard-text-muted">
          Having trouble? <Link href="/support" className="text-dashboard-accent hover:underline">Contact support</Link>
        </p>
      </div>
    </div>
  );
}


