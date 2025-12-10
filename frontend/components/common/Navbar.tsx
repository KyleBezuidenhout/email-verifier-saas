"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/common/ThemeProvider";

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-omni-black border-b border-omni-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-16 h-[70px] flex items-center justify-between">
        {/* Logo */}
        <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2.5 group">
          <svg 
            className="w-7 h-7 transition-opacity group-hover:opacity-90" 
            fill="#007AFF" 
            viewBox="0 0 24 24" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
          <span 
            className="text-[#007AFF] font-bold text-xl tracking-tight"
            style={{ fontFamily: '"Helvetica Neue", "Arial", sans-serif', fontWeight: 700 }}
          >
            Billion Verifier
          </span>
        </Link>

        {user ? (
          <>
            {/* Authenticated Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link
                href="/dashboard"
                className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity"
              >
                Settings
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-omni-dark text-omni-white transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-2 text-omni-white font-medium text-sm hover:opacity-80"
                >
                  {user.email}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-omni-dark border border-omni-border rounded-lg py-2 z-50">
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-sm text-omni-white hover:bg-omni-black/50"
                      onClick={() => setShowMenu(false)}
                    >
                      Settings
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-omni-white hover:bg-omni-black/50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Public Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              <Link href="#features" className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity">
                Features
              </Link>
              <span className="text-omni-gray">•</span>
              <Link href="#process" className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity">
                Process
              </Link>
              <span className="text-omni-gray">•</span>
              <Link href="#benefits" className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity">
                Benefits
              </Link>
              <span className="text-omni-gray">•</span>
              <Link href="#pricing" className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity">
                Pricing
              </Link>
              <span className="text-omni-gray">•</span>
              <Link href="#testimonials" className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity">
                Testimonials
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-omni-dark text-omni-white transition-colors hidden md:block"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <Link
                href="/login"
                className="text-omni-white font-medium text-sm hover:opacity-80 transition-opacity hidden md:block"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-omni-cyan text-omni-black px-6 py-3 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                Get Free Credits
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              {/* Mobile Menu Button */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="md:hidden p-2 text-omni-white"
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showMobileMenu ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
      {/* Mobile Menu */}
      {showMobileMenu && !user && (
        <div className="md:hidden bg-omni-dark border-t border-omni-border">
          <div className="px-4 py-4 space-y-3">
            <Link href="#features" className="block text-omni-white font-medium text-sm" onClick={() => setShowMobileMenu(false)}>
              Features
            </Link>
            <Link href="#process" className="block text-omni-white font-medium text-sm" onClick={() => setShowMobileMenu(false)}>
              Process
            </Link>
            <Link href="#benefits" className="block text-omni-white font-medium text-sm" onClick={() => setShowMobileMenu(false)}>
              Benefits
            </Link>
            <Link href="#pricing" className="block text-omni-white font-medium text-sm" onClick={() => setShowMobileMenu(false)}>
              Pricing
            </Link>
            <Link href="#testimonials" className="block text-omni-white font-medium text-sm" onClick={() => setShowMobileMenu(false)}>
              Testimonials
            </Link>
            <Link href="/login" className="block text-omni-white font-medium text-sm" onClick={() => setShowMobileMenu(false)}>
              Sign In
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
