"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    const autoCloseTimer = window.setTimeout(() => {
      setShowMenu(false);
    }, 10000);

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      window.clearTimeout(autoCloseTimer);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showMenu]);

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
      "/get-credits": "Get More Credits",
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
    <header className="h-[70px] bg-dashboard-surface/80 backdrop-blur-sm border-b border-dashboard-border flex items-center justify-between px-6">
      {/* Page Title / Breadcrumb */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-dashboard-text">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right side: Settings and user menu */}
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="p-2 rounded-lg hover:bg-dashboard-card text-dashboard-text-muted hover:text-dashboard-text transition-colors"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-dashboard-card transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-dashboard-accent/20 flex items-center justify-center text-dashboard-accent font-semibold text-xs">
              {getInitials(user.full_name, user.email)}
            </div>
            <span className="text-sm font-medium text-dashboard-text hidden md:block">
              {user.full_name || user.email.split("@")[0]}
            </span>
            <svg className="w-4 h-4 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-36 bg-dashboard-card border border-dashboard-border rounded-lg py-1 z-50 shadow-lg">
              <button
                onClick={() => {
                  handleLogout();
                  setShowMenu(false);
                }}
                className="block w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-dashboard-surface-alt transition-colors"
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

