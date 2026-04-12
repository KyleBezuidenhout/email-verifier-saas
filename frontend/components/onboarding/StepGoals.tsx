"use client";

import { useState } from "react";
import { SelectableBlock } from "./SelectableBlock";

const GOAL_OPTIONS = [
  "Build Prospect Lists for Email Campaigns",
  "Clean & Enrich CRM Data",
  "Verify an Existing Email List",
  "Pull Profiles for LinkedIn Outreach",
  "Enrich your Lead Lists with email & company data",
];

interface StepGoalsProps {
  value: string[];
  onNext: (value: string[]) => void;
  onSkip: () => void;
}

export function StepGoals({ value, onNext, onSkip }: StepGoalsProps) {
  const [selected, setSelected] = useState<string[]>(value);

  const toggle = (goal: string) => {
    setSelected((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          What are you looking to accomplish?
        </h2>
        <p className="text-gray-400 text-sm">
          Select all that apply
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-md mx-auto">
        {GOAL_OPTIONS.map((goal) => (
          <SelectableBlock
            key={goal}
            label={goal}
            selected={selected.includes(goal)}
            onClick={() => toggle(goal)}
          />
        ))}
      </div>

      <div className="space-y-3 max-w-sm mx-auto">
        <button
          onClick={() => onNext(selected)}
          disabled={selected.length === 0}
          className="w-full bg-[#0099FF] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#0099FF]/90 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          style={{ boxShadow: "0 0 24px rgba(0, 153, 255, 0.15)" }}
        >
          Let&apos;s go
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
