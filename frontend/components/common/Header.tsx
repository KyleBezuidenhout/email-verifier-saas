"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/common/ThemeProvider";

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!user) {
    return null; // Don't show header for non-authenticated users
  }

  // Get page title from pathname
  const getPageTitle = () => {
    const pathMap: Record<string, string> = {
      "/dashboard": "Dashboard",
      "/find-valid-emails": "Find Valid Emails",
      "/sales-nav-scraper": "Sales Nav Scraper",
      "/verify-emails": "Verify Emails",
      "/settings": "Settings",
    };
    
    for (const [path, title] of Object.entries(pathMap)) {
      if (pathname === path || pathname?.startsWith(path + "/")) {
        return title;
      }
    }
    return "Dashboard";
  };

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

  return (
    <header className="h-[70px] bg-apple-bg border-b border-apple-border flex items-center justify-between px-6">
      {/* Page Title / Breadcrumb */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-apple-text">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right side: Notifications, Theme toggle, and User menu */}
      <div className="flex items-center gap-3">
        {/* Notification bell placeholder */}
        <button
          className="p-2 rounded-lg hover:bg-apple-surface text-apple-text-muted hover:text-apple-text transition-colors relative"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-apple-surface text-apple-text-muted hover:text-apple-text transition-colors"
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
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-apple-surface transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-apple-accent/20 flex items-center justify-center text-apple-accent font-semibold text-xs">
              {getInitials(user.full_name, user.email)}
            </div>
            <span className="text-sm font-medium text-apple-text hidden md:block">
              {user.full_name || user.email.split("@")[0]}
            </span>
            <svg className="w-4 h-4 text-apple-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-apple-surface border border-apple-border rounded-xl py-2 z-50 shadow-lg">
              <div className="px-4 py-3 border-b border-apple-border">
                <p className="text-sm font-medium text-apple-text">{user.full_name || "User"}</p>
                <p className="text-xs text-apple-text-muted mt-0.5">{user.email}</p>
              </div>
              <Link
                href="/settings"
                className="block px-4 py-2 text-sm text-apple-text hover:bg-apple-surface-hover transition-colors"
                onClick={() => setShowMenu(false)}
              >
                Settings
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  setShowMenu(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-apple-error hover:bg-apple-surface-hover transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

