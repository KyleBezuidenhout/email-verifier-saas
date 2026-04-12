"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { StepCompanyWebsite } from "@/components/onboarding/StepCompanyWebsite";
import { StepJobRole } from "@/components/onboarding/StepJobRole";
import { StepCompanySize } from "@/components/onboarding/StepCompanySize";
import { StepEmailVolume } from "@/components/onboarding/StepEmailVolume";
import { StepGoals } from "@/components/onboarding/StepGoals";
import { StepReferralSource } from "@/components/onboarding/StepReferralSource";
import Image from "next/image";

const TOTAL_STEPS = 6;

interface OnboardingData {
  company_website: string;
  job_role: string;
  company_size: string;
  daily_cold_emails: number | null;
  onboarding_goals: string[];
  referral_source: string;
}

export default function OnboardingPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<OnboardingData>({
    company_website: "",
    job_role: "",
    company_size: "",
    daily_cold_emails: null,
    onboarding_goals: [],
    referral_source: "",
  });

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
    if (!loading && user && user.onboarding_completed) {
      router.replace("/sales-nav-scraper");
    }
  }, [user, loading, router]);

  const finishOnboarding = async (finalData: OnboardingData) => {
    setSubmitting(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { onboarding_completed: true };
      if (finalData.company_website) payload.company_website = finalData.company_website;
      if (finalData.job_role) payload.job_role = finalData.job_role;
      if (finalData.company_size) payload.company_size = finalData.company_size;
      if (finalData.daily_cold_emails !== null) payload.daily_cold_emails = finalData.daily_cold_emails;
      if (finalData.onboarding_goals.length > 0) payload.onboarding_goals = finalData.onboarding_goals;
      if (finalData.referral_source) payload.referral_source = finalData.referral_source;

      await apiClient.updateUser(payload as Parameters<typeof apiClient.updateUser>[0]);
      await refreshUser();
      const redirect = localStorage.getItem("bv_post_auth_redirect") || "/sales-nav-scraper";
      localStorage.removeItem("bv_post_auth_redirect");
      router.replace(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      finishOnboarding(data);
    }
  };

  const skipStep = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      finishOnboarding(data);
    }
  };

  const skipAll = () => {
    finishOnboarding(data);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-400 text-sm">Setting up your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black py-8 px-4 sm:px-6 lg:px-8">
      {/* Header with logo + progress */}
      <div className="w-full max-w-md mx-auto space-y-6 mb-8">
        <div className="flex items-center justify-center">
          <Image src="/icon.svg" alt="BillionVerifier" width={40} height={40} />
        </div>
        <OnboardingProgress currentStep={step + 1} totalSteps={TOTAL_STEPS} />
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center pt-4 sm:pt-12">
        <div className="w-full max-w-lg">
          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm text-center max-w-sm mx-auto">
              {error}
            </div>
          )}

          {step === 0 && (
            <StepCompanyWebsite
              value={data.company_website}
              onNext={(val) => { setData({ ...data, company_website: val }); goNext(); }}
              onSkip={skipStep}
            />
          )}
          {step === 1 && (
            <StepJobRole
              value={data.job_role}
              onNext={(val) => { setData({ ...data, job_role: val }); goNext(); }}
              onSkip={skipStep}
            />
          )}
          {step === 2 && (
            <StepCompanySize
              value={data.company_size}
              onNext={(val) => { setData({ ...data, company_size: val }); goNext(); }}
              onSkip={skipStep}
            />
          )}
          {step === 3 && (
            <StepEmailVolume
              value={data.daily_cold_emails}
              onNext={(val) => { setData({ ...data, daily_cold_emails: val }); goNext(); }}
              onSkip={skipStep}
            />
          )}
          {step === 4 && (
            <StepGoals
              value={data.onboarding_goals}
              onNext={(val) => { setData({ ...data, onboarding_goals: val }); goNext(); }}
              onSkip={skipStep}
            />
          )}
          {step === 5 && (
            <StepReferralSource
              value={data.referral_source}
              onNext={(val) => {
                const updated = { ...data, referral_source: val };
                setData(updated);
                finishOnboarding(updated);
              }}
              onSkip={() => finishOnboarding(data)}
            />
          )}
        </div>
      </div>

      {/* Skip all link at bottom */}
      <div className="w-full max-w-md mx-auto mt-8 text-center">
        <button
          onClick={skipAll}
          className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
        >
          Skip onboarding
        </button>
      </div>
    </div>
  );
}
