"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/common/ThemeProvider";

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!user) {
    return null; // Don't show header for non-authenticated users
  }

  return (
    <header className="h-[70px] bg-omni-black border-b border-omni-border flex items-center justify-between px-6">
      {/* Logo - can be empty or minimal since sidebar has logo */}
      <div className="flex-1"></div>

      {/* Right side: Theme toggle and User menu */}
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
    </header>
  );
}

