"use client";

import { useEffect, useState } from "react";

export function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState<string | null>(null);

  useEffect(() => {
    setImpersonating(localStorage.getItem("impersonating"));
  }, []);

  if (!impersonating) return null;

  const handleReturn = () => {
    const adminToken = localStorage.getItem("admin_token");
    if (adminToken) {
      document.cookie = `token=${adminToken}; path=/; max-age=604800; SameSite=Lax`;
      localStorage.removeItem("admin_token");
      localStorage.removeItem("impersonating");
      window.location.href = "/admin-console";
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-black text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-4">
      <span>
        Viewing as <strong>{impersonating}</strong>
      </span>
      <button
        onClick={handleReturn}
        className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-xs font-semibold transition-colors"
      >
        Return to Admin
      </button>
    </div>
  );
}
