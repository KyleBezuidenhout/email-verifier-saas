import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-[#0D0F12] border-t border-[#252A31]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="text-landing-accent font-bold text-lg tracking-tight">
              BillionVerifier
            </span>
            <span className="text-landing-text text-sm">
              © {new Date().getFullYear()}
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

