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
      <div className="glass-card p-8 mb-6">
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

      {/* Response Time Card */}
      <div className="glass-card p-8 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-dashboard-text mb-2">Response Time</h2>
            <p className="text-dashboard-text-muted">
              We typically respond to all support inquiries within 24 hours during business days.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Preview */}
      <div className="glass-card p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-dashboard-text mb-2">Common Questions</h2>
            <ul className="text-dashboard-text-muted space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-dashboard-accent"></span>
                How do credits work?
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-dashboard-accent"></span>
                What is the email verification accuracy?
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-dashboard-accent"></span>
                How do I export my verified emails?
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-dashboard-accent"></span>
                Can I get a refund for unused credits?
              </li>
            </ul>
            <p className="text-dashboard-text-muted mt-4 text-sm">
              Email us at{" "}
              <a href="mailto:support@billionverifier.io" className="text-dashboard-accent hover:underline">
                support@billionverifier.io
              </a>
              {" "}for answers to these and any other questions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

