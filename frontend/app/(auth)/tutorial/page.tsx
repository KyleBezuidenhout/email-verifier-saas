"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export default function TutorialPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    if (!loading && user && user.has_seen_tutorial) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleContinue = async () => {
    setSubmitting(true);
    try {
      await apiClient.updateUser({ has_seen_tutorial: true });
      await refreshUser();
      router.replace("/dashboard");
    } catch {
      router.replace("/dashboard");
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">
            Welcome to BillionVerifier
          </h2>
          <p className="mt-3 text-gray-400">
            Watch this quick walkthrough to get the most out of the platform
          </p>
        </div>

        <div className="glass-surface p-3 rounded-xl">
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            onEnded={() => setVideoEnded(true)}
            className="w-full rounded-lg"
            style={{ aspectRatio: "16 / 9", background: "#000" }}
          >
            <source src="/videos/onboarding-intro.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleContinue}
            disabled={submitting}
            className="bg-[#0099FF] text-white py-3 px-10 rounded-lg hover:bg-[#0099FF]/90 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black font-medium transition-all text-base disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: "0 0 20px rgba(0, 153, 255, 0.2)" }}
          >
            {submitting ? <LoadingSpinner size="sm" /> : videoEnded ? "Get Started" : "Skip Tutorial"}
          </button>
          {!videoEnded && (
            <p className="text-xs text-gray-500">
              You can always find this video later in your settings
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
