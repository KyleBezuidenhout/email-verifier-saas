"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string | null; // null means disabled/coming soon
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  // Dashboard hidden temporarily - uncomment to re-enable
  // {
  //   name: "Dashboard",
  //   href: "/dashboard",
  //   icon: (
  //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  //     </svg>
  //   ),
  // },
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
    name: "Google Maps Scraper",
    href: "/local-lead-scraper",
    adminOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    name: "Website Scraper",
    href: "/website-scraper",
    adminOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
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
    name: "Catchall Verifier",
    href: "/verify-catchalls",
    adminOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
      </svg>
    ),
  },
  {
    name: "API Docs",
    href: "/api-docs",
    adminOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: "Tutorial",
    href: "/watch-tutorial",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  {
    name: "Get More Credits",
    href: "/get-credits",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const bottomNavNames = new Set(["Tutorial", "Support", "Get More Credits"]);
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.is_admin);
  const primaryNavItems = visibleNavItems.filter((item) => !bottomNavNames.has(item.name));
  const bottomNavItems = visibleNavItems.filter((item) => bottomNavNames.has(item.name));

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

  const handleLogoClick = () => {
    window.location.href = "https://www.billionverifier.io/";
  };

  const renderNavItem = (item: NavItem) => {
    if (item.href === null) {
      return (
        <div
          key={item.name}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-dashboard-text-muted/50 cursor-not-allowed opacity-60"
          title="Coming soon"
        >
          {item.icon}
          <span className="text-sm">{item.name}</span>
        </div>
      );
    }

    const href = item.href;
    const isActive = pathname === href || pathname?.startsWith(href + "/");

    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative ${
          isActive
            ? "bg-dashboard-accent/10 text-dashboard-accent font-medium border-l-2 border-dashboard-accent"
            : "text-dashboard-text-muted hover:bg-dashboard-card hover:text-dashboard-text"
        }`}
      >
        {item.icon}
        <span className="text-sm">{item.name}</span>
        {item.adminOnly && (
          <svg
            className="w-4 h-4 ml-auto text-dashboard-text-muted/50 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="Hidden from clients"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
          </svg>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[250px] bg-dashboard-surface border-r border-dashboard-border z-40">
      <div className="flex flex-col h-full">
        {/* Logo - Clickable to logout and go home */}
        <div className="p-6 border-b border-dashboard-border">
          <button 
            onClick={handleLogoClick}
            className="flex items-center justify-center gap-2 group w-full cursor-pointer"
          >
            <svg 
              className="w-6 h-6 transition-opacity group-hover:opacity-70" 
              fill="#0099FF" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            <span 
              className="text-dashboard-accent font-bold text-lg tracking-tight group-hover:opacity-70 transition-opacity"
              style={{ fontFamily: '"Helvetica Neue", "Arial", sans-serif', fontWeight: 700 }}
            >
              Billion Verifier
            </span>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 flex flex-col">
          <div className="space-y-1">
            {primaryNavItems.map(renderNavItem)}

            {/* Admin Console - Only visible to admins */}
            {user?.is_admin && (
              <Link
                href="/admin-console"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative mt-4 border-t border-dashboard-border pt-4 ${
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
          </div>

          <div className="mt-auto pt-6 space-y-1">
            {bottomNavItems.map(renderNavItem)}
          </div>
        </nav>

        {/* Credit Balance & User Profile Section */}
        {user && (
          <div className="p-4 border-t border-dashboard-border">
            {/* Credit Balance */}
            <div className="mb-3 px-3 py-2 rounded-lg bg-dashboard-accent/10 border border-dashboard-accent/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-dashboard-text-muted">Credits</span>
                </div>
                <span className="text-sm font-bold text-dashboard-accent">
                  {user.is_admin ? "∞" : (user.credits?.toLocaleString() || 0)}
                </span>
              </div>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-dashboard-card border border-dashboard-border">
              <div className="w-10 h-10 rounded-full bg-dashboard-accent/20 flex items-center justify-center text-dashboard-accent font-semibold text-sm">
                {getInitials(user.full_name, user.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dashboard-text truncate">
                  {user.full_name || "User"}
                </p>
                <p className="text-xs text-dashboard-text-muted truncate">
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

