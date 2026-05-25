"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export default function OnboardingPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }

    // If onboarding already completed, go to tutorial (if not seen) or dashboard
    if (!loading && user && user.onboarding_completed) {
      if (!user.has_seen_tutorial) {
        router.replace("/tutorial");
      } else {
        router.replace("/dashboard");
      }
      return;
    }

    // Auto-complete onboarding and redirect to tutorial
    if (!loading && user && !user.onboarding_completed) {
      const completeOnboarding = async () => {
        try {
          await apiClient.updateUser({ onboarding_completed: true });
          await refreshUser();
          router.replace("/tutorial");
        } catch {
          // If API fails, still redirect to tutorial
          router.replace("/tutorial");
        }
      };
      completeOnboarding();
    }
  }, [user, loading, router, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-gray-400 text-sm">Getting things ready...</p>
      </div>
    </div>
  );
}
