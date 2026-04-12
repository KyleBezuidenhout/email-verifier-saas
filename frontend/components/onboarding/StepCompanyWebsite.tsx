"use client";

import { useState } from "react";

interface StepCompanyWebsiteProps {
  value: string;
  onNext: (value: string) => void;
  onSkip: () => void;
}

export function StepCompanyWebsite({ value, onNext, onSkip }: StepCompanyWebsiteProps) {
  const [website, setWebsite] = useState(value);

  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          What&apos;s your company website?
        </h2>
        <p className="text-gray-400 text-sm">
          This helps us personalize your outreach
        </p>
      </div>

      <div className="max-w-sm mx-auto">
        <label htmlFor="company_website" className="block text-sm font-medium text-gray-300 mb-2 text-left">
          URL
        </label>
        <input
          id="company_website"
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && website.trim()) onNext(website.trim());
          }}
          className="glass-input w-full"
          placeholder="mycompany.com"
          autoFocus
        />
      </div>

      <div className="space-y-3 max-w-sm mx-auto">
        <button
          onClick={() => onNext(website.trim())}
          disabled={!website.trim()}
          className="w-full bg-[#0099FF] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#0099FF]/90 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          style={{ boxShadow: "0 0 24px rgba(0, 153, 255, 0.15)" }}
        >
          Continue
        </button>
        <button
          onClick={onSkip}
          className="w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
