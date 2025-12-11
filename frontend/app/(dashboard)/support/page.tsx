"use client";

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text">Support</h1>
        <p className="text-apple-text-muted mt-2">
          Get help with your account or report issues.
        </p>
      </div>

      <div className="bg-apple-surface border border-apple-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-apple-accent/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-apple-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-apple-text mb-2">Coming Soon</h2>
        <p className="text-apple-text-muted">
          Support contact form and FAQ will be available here shortly.
        </p>
      </div>
    </div>
  );
}

