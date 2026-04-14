"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { MarketingPage } from "@/components/marketing/MarketingPage";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  // Show marketing page for non-authenticated users
  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
          <p className="text-center text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (user) {
    return null; // Will redirect to dashboard
  }

  return <MarketingPage />;
}


