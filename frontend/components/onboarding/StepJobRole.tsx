"use client";

import { useState } from "react";
import { SelectableBlock } from "./SelectableBlock";

const ROLE_OPTIONS = [
  "Founder / CEO",
  "Sales / SDR / BDR",
  "Marketing",
  "Agency Owner",
  "RevOps / Growth",
  "Other",
];

interface StepJobRoleProps {
  value: string;
  onNext: (value: string) => void;
  onSkip: () => void;
}

export function StepJobRole({ value, onNext, onSkip }: StepJobRoleProps) {
  const [selected, setSelected] = useState(value);

  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          What&apos;s your role?
        </h2>
        <p className="text-gray-400 text-sm">
          This helps us tailor your experience
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
        {ROLE_OPTIONS.map((role) => (
          <SelectableBlock
            key={role}
            label={role}
            selected={selected === role}
            onClick={() => setSelected(selected === role ? "" : role)}
          />
        ))}
      </div>

      <div className="space-y-3 max-w-sm mx-auto">
        <button
          onClick={() => onNext(selected)}
          disabled={!selected}
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
