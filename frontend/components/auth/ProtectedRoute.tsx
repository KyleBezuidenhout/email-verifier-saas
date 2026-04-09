"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!loading && user && user.oauth_provider && !user.company_website) {
      router.push("/onboarding");
    } else if (!loading && user && !user.has_seen_tutorial && pathname !== "/tutorial") {
      router.push("/tutorial");
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (user.oauth_provider && !user.company_website) {
    return null;
  }

  if (!user.has_seen_tutorial && pathname !== "/tutorial") {
    return null;
  }

  return <>{children}</>;
}


