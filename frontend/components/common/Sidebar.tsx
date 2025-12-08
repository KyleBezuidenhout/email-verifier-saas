"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string | null; // null means disabled/coming soon
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
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
    name: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: "Find Valid Emails",
    href: "/find-valid-emails",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    name: "Verify Emails",
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
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

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
    <aside className="fixed left-0 top-0 h-screen w-[250px] bg-dashbrd-bg border-r border-dashbrd-border z-40">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b border-dashbrd-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-bold text-dashbrd-text">
              Email<span className="text-dashbrd-accent">Verifier</span>
            </span>
          </Link>
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
        </nav>

        {/* User Profile Section */}
        {user && (
          <div className="p-4 border-t border-dashbrd-border">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-dashbrd-card border border-dashbrd-border">
              <div className="w-10 h-10 rounded-full bg-dashbrd-accent/20 flex items-center justify-center text-dashbrd-accent font-semibold text-sm">
                {getInitials(user.full_name, user.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dashbrd-text truncate">
                  {user.full_name || "User"}
                </p>
                <p className="text-xs text-dashbrd-text-muted truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

