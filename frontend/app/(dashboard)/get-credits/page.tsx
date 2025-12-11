"use client";

export default function GetCreditsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text">Get More Credits</h1>
        <p className="text-apple-text-muted mt-2">
          Purchase additional credits to continue using our services.
        </p>
      </div>

      <div className="bg-apple-surface border border-apple-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-apple-accent/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-apple-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-apple-text mb-2">Coming Soon</h2>
        <p className="text-apple-text-muted">
          Credit packages will be available here shortly.
        </p>
      </div>
    </div>
  );
}

