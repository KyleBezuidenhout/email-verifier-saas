"use client";

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dashboard-text">Support</h1>
        <p className="text-dashboard-text-muted mt-2">
          Get help with your account or report issues.
        </p>
      </div>

      {/* Contact Card */}
      <div className="glass-card p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-dashboard-accent/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-dashboard-text mb-2">Contact Us</h2>
            <p className="text-dashboard-text-muted mb-4">
              Have a question, issue, or need assistance? Our support team is here to help.
            </p>
            <a 
              href="mailto:support@billionverifier.io" 
              className="inline-flex items-center gap-2 text-dashboard-accent hover:underline font-medium"
            >
              support@billionverifier.io
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

