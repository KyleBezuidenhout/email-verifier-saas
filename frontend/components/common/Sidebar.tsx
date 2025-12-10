"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string | null; // null means disabled/coming soon
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: "Sales Nav Scraper",
    href: "/sales-nav-scraper",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    name: "Enrich",
    href: "/find-valid-emails",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    name: "Verify",
    href: "/verify-emails",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: "API Docs (Coming Soon)",
    href: null, // Disabled - coming soon
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: "Settings",
    href: "/settings",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    name: "Get More Credits",
    href: "/get-credits",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    name: "Support",
    href: "/support",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Get user initials for avatar
  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name[0]?.toUpperCase() || "U";
    }
    return email?.[0]?.toUpperCase() || "U";
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowLogoutModal(true);
  };

  const handleGoToHomePage = async () => {
    try {
      await logout();
      setShowLogoutModal(false);
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
      // Still redirect even if logout fails
      setShowLogoutModal(false);
      router.push("/");
    }
  };

  return (
    <>
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLogoutModal(false)}
          />
          {/* Modal */}
          <div className="relative bg-apple-surface border border-apple-border rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="text-center">
              {/* Icon */}
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-apple-accent/10 flex items-center justify-center">
                <svg 
                  className="w-8 h-8 text-apple-accent" 
                  fill="#007AFF" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
              </div>
              {/* Title */}
              <h3 className="text-xl font-semibold text-apple-text mb-2">
                Leave Dashboard?
              </h3>
              <p className="text-apple-text-muted text-sm mb-6">
                You will be logged out and redirected to the home page.
              </p>
              {/* Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleGoToHomePage}
                  className="w-full px-4 py-3 bg-apple-accent text-white font-medium rounded-xl hover:bg-apple-accent/90 transition-colors"
                >
                  Go to Home Page
                </button>
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full px-4 py-3 bg-apple-surface border border-apple-border text-apple-text font-medium rounded-xl hover:bg-apple-card transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <aside className="fixed left-0 top-0 h-screen w-[250px] bg-apple-bg border-r border-apple-border z-40">
      <div className="flex flex-col h-full">
        {/* Logo - Clickable to logout and go home */}
        <div className="p-6 border-b border-apple-border">
          <button 
            onClick={handleLogoClick}
            className="flex items-center justify-center gap-2 group w-full cursor-pointer"
          >
            <svg 
              className="w-6 h-6 transition-opacity group-hover:opacity-70" 
              fill="#007AFF" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            <span 
              className="text-[#007AFF] font-bold text-lg tracking-tight group-hover:opacity-70 transition-opacity"
              style={{ fontFamily: '"Helvetica Neue", "Arial", sans-serif', fontWeight: 700 }}
            >
              Billion Verifier
            </span>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            if (item.href === null) {
              return (
                <div
                  key={item.name}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-dashbrd-text-muted/50 cursor-not-allowed opacity-60"
                  title="Coming soon"
                >
                  {item.icon}
                  <span className="text-sm">{item.name}</span>
                </div>
              );
            }
            
            // TypeScript now knows item.href is string (not null) after the check above
            const href = item.href; // Type narrowing helper
            const isActive = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative ${
                  isActive
                    ? "bg-dashbrd-accent/10 text-dashbrd-accent font-medium border-l-2 border-dashbrd-accent"
                    : "text-dashbrd-text-muted hover:bg-dashbrd-card hover:text-dashbrd-text"
                }`}
              >
                {item.icon}
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}

          {/* Admin Console - Only visible to admins */}
          {user?.is_admin && (
            <Link
              href="/admin-console"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative mt-4 border-t border-apple-border pt-4 ${
                pathname === "/admin-console"
                  ? "bg-red-500/10 text-red-400 font-medium border-l-2 border-red-400"
                  : "text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-sm">Admin Console</span>
            </Link>
          )}
        </nav>

        {/* Credit Balance & User Profile Section */}
        {user && (
          <div className="p-4 border-t border-apple-border">
            {/* Credit Balance */}
            <div className="mb-3 px-3 py-2 rounded-lg bg-apple-accent/10 border border-apple-accent/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-apple-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-apple-text-muted">Credits</span>
                </div>
                <span className="text-sm font-bold text-apple-accent">
                  {user.is_admin ? "∞" : (user.credits?.toLocaleString() || 0)}
                </span>
              </div>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-apple-surface border border-apple-border">
              <div className="w-10 h-10 rounded-full bg-apple-accent/20 flex items-center justify-center text-apple-accent font-semibold text-sm">
                {getInitials(user.full_name, user.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-text truncate">
                  {user.full_name || "User"}
                </p>
                <p className="text-xs text-apple-text-muted truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}

