"use client";

import { useState } from "react";
import { SelectableBlock } from "./SelectableBlock";

const VOLUME_OPTIONS = [
  { label: "Less than 100", value: 50 },
  { label: "100 - 500", value: 300 },
  { label: "500 - 1,000", value: 750 },
  { label: "1,000 - 5,000", value: 3000 },
  { label: "5,000 - 10,000", value: 7500 },
  { label: "10,000+", value: 10000 },
];

interface StepEmailVolumeProps {
  value: number | null;
  onNext: (value: number) => void;
  onSkip: () => void;
}

export function StepEmailVolume({ value, onNext, onSkip }: StepEmailVolumeProps) {
  const [selected, setSelected] = useState<number | null>(value);

  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          How many cold emails do you send daily?
        </h2>
        <p className="text-gray-400 text-sm">
          This helps us optimize your experience
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
        {VOLUME_OPTIONS.map((opt) => (
          <SelectableBlock
            key={opt.value}
            label={opt.label}
            selected={selected === opt.value}
            onClick={() => setSelected(selected === opt.value ? null : opt.value)}
          />
        ))}
      </div>

      <div className="space-y-3 max-w-sm mx-auto">
        <button
          onClick={() => selected !== null && onNext(selected)}
          disabled={selected === null}
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
