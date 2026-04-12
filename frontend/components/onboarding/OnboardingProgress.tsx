"use client";

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
}

export function OnboardingProgress({ currentStep, totalSteps }: OnboardingProgressProps) {
  return (
    <div className="flex gap-1.5 w-full max-w-md mx-auto">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i < currentStep ? "bg-[#0099FF]" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}
