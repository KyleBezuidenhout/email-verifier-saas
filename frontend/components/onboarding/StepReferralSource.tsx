"use client";

import { useState } from "react";

interface StepReferralSourceProps {
  value: string;
  onNext: (value: string) => void;
  onSkip: () => void;
}

export function StepReferralSource({ value, onNext, onSkip }: StepReferralSourceProps) {
  const [source, setSource] = useState(value);

  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          How did you hear about us?
        </h2>
        <p className="text-gray-400 text-sm">
          This helps us improve how we reach people like you
        </p>
      </div>

      <div className="max-w-sm mx-auto">
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && source.trim()) onNext(source.trim());
          }}
          className="glass-input w-full"
          placeholder="Google search, Twitter, a friend, etc."
          maxLength={150}
          autoFocus
        />
      </div>

      <div className="space-y-3 max-w-sm mx-auto">
        <button
          onClick={() => onNext(source.trim())}
          disabled={!source.trim()}
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
