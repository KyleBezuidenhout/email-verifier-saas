import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-omni-black border-t border-omni-border mt-auto">
      <div className="max-w-[1200px] mx-auto px-10 md:px-16 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Logo Column */}
          <div>
            <div className="mb-4">
              <Link href="/" className="inline-flex items-center gap-2 group">
                <svg 
                  className="w-6 h-6 transition-opacity group-hover:opacity-90" 
                  fill="#007AFF" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <span 
                  className="text-[#007AFF] font-bold text-lg tracking-tight"
                  style={{ fontFamily: '"Helvetica Neue", "Arial", sans-serif', fontWeight: 700 }}
                >
                  Billion Verifier
                </span>
              </Link>
            </div>
            <p className="text-sm text-omni-gray mb-4">
              Professional email verification service for your business.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-omni-gray hover:text-omni-cyan transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                </svg>
              </a>
              <a href="#" className="text-omni-gray hover:text-omni-cyan transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-bold text-omni-white mb-4">Quick Links</h4>
            <ul className="space-y-3">
              <li>
                <Link href="#features" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#process" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Process
                </Link>
              </li>
              <li>
                <Link href="#benefits" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Benefits
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="#testimonials" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Testimonials
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-bold text-omni-white mb-4">Legal</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/privacy" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/data-agreement" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Data Agreement Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-bold text-omni-white mb-4">Support</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/contact" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-sm text-omni-gray hover:text-omni-cyan transition-colors">
                  Documentation
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-omni-border text-center">
          <p className="text-xs text-omni-gray">
            © {new Date().getFullYear()} Billion Verifier. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
