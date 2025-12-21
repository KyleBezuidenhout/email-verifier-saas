import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-[#0D0F12] border-t border-[#252A31]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-landing-accent/10 border border-landing-accent/30 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-landing-accent"
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
            <span className="text-landing-text text-sm">
              © {new Date().getFullYear()} Billionverifier.io
            </span>
          </div>

          {/* Legal Links */}
          <div className="flex items-center gap-8">
            <Link
              href="/terms"
              className="text-landing-muted text-sm hover:text-landing-text transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="text-landing-muted text-sm hover:text-landing-text transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

