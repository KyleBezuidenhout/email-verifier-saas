"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, formatSnLabel, type PlanDef } from "@/lib/plans";

interface PricingSliderProps {
  variant?: "marketing" | "dashboard";
}

const TRIAL_PLAN = PLANS.find((p) => p.id === "trial")!;
const SLIDER_PLANS = PLANS.filter((p) => p.id !== "custom" && p.id !== "trial");
const CUSTOM_PLAN = PLANS.find((p) => p.id === "custom")!;
const REGULAR_PLAN_COUNT = SLIDER_PLANS.length + 1; // +1 for trial at start
const TOTAL_STEPS = REGULAR_PLAN_COUNT; // 0..5 for trial + regular plans, position 6 is custom

function buildFeatures(plan: PlanDef): string[] {
  const features: string[] = [];

  if (plan.id === "trial") {
    features.push("500 emails");
    features.push("Email support");
  } else if (plan.id === "custom") {
    features.push("100,000+ emails per month");
    features.push("Priority Slack Support + Deliverability Consulting");
  } else {
    features.push(`${formatSnLabel(plan.snLabel!)} emails per month`);
    features.push(plan.support);
  }
  return features;
}

export function PricingSlider({ variant = "marketing" }: PricingSliderProps) {
  const [sliderIndex, setSliderIndex] = useState(0);

  const isCustom = sliderIndex >= REGULAR_PLAN_COUNT;
  const selectedPlan: PlanDef = isCustom 
    ? CUSTOM_PLAN 
    : sliderIndex === 0 
      ? TRIAL_PLAN 
      : SLIDER_PLANS[sliderIndex - 1];
  const features = useMemo(() => buildFeatures(selectedPlan), [selectedPlan]);

  const displayPrice = useMemo(() => {
    if (isCustom || !selectedPlan.monthlyPrice) return null;
    if (selectedPlan.id === "trial") return null;
    return selectedPlan.monthlyPrice;
  }, [selectedPlan, isCustom]);

  const snLabelDisplay = isCustom
    ? "100k+"
    : selectedPlan.snLabel
      ? formatSnLabel(selectedPlan.snLabel)
      : "500";

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header + Toggle Row */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
        <div className="text-left">
          <h2 className="text-lg md:text-xl font-bold text-dashboard-text mb-1">
            How many emails do you want to find?
          </h2>
          <p className="text-dashboard-text-muted text-base">
            Up to <span className="text-dashboard-accent font-semibold">{snLabelDisplay}</span>{selectedPlan.id !== "trial" && " per month"}
          </p>
        </div>

      </div>

      {/* Plan Card - HowItWorks Style */}
      <div className="relative rounded-3xl p-px bg-gradient-to-b from-white/[0.15] via-white/[0.05] to-transparent shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="relative rounded-[23px] bg-[#0a0a0a] border border-white/[0.12] p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-center">
          {/* Left: Plan Info */}
          <div className="flex-1">
            {/* Badge */}
            {selectedPlan.id !== "trial" && selectedPlan.id !== "custom" && (
              <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-dashboard-accent/10 text-dashboard-accent border border-dashboard-accent/20 mb-4">
                {selectedPlan.name}
              </span>
            )}

            {/* Price */}
            {selectedPlan.id === "trial" ? (
              <div className="mb-4">
                <div className="text-3xl lg:text-4xl font-bold text-white">Free</div>
                <p className="text-dashboard-text-muted mt-1">Get 500 Emails</p>
              </div>
            ) : isCustom ? (
              <div className="mb-4">
                <div className="text-3xl lg:text-4xl font-bold text-white">Custom</div>
                <p className="text-dashboard-text-muted mt-1">Custom pricing</p>
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl lg:text-4xl font-bold text-white">
                    ${displayPrice?.toLocaleString()}
                  </span>
                  <span className="text-dashboard-text-muted text-lg">/mo</span>
                </div>
                {selectedPlan.creditPrice && (
                  <p className="text-dashboard-text-muted text-sm mt-1">
                    ${selectedPlan.creditPrice.toFixed(3)} per email
                  </p>
                )}
              </div>
            )}

            {/* CTA */}
            {isCustom ? (
              <a
                href="https://calendly.com/billionverifier-support/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-500 text-black px-6 py-3 font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-blue-600"
              >
                Let's Talk
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            ) : (
              <Link
                href={variant === "dashboard" ? "/get-credits" : selectedPlan.ctaHref}
                className="inline-flex items-center gap-2 bg-blue-500 text-black px-6 py-3 font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-blue-600"
              >
                {selectedPlan.id === "trial" ? "Sign up for free" : selectedPlan.cta}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            )}
          </div>

          {/* Right: Slider + Labels + Features */}
          <div className="flex-1">
            {/* Slider */}
            <div className="mb-4 -mt-2">
              <input
                type="range"
                min={0}
                max={TOTAL_STEPS}
                step={1}
                value={sliderIndex}
                onChange={(e) => setSliderIndex(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-dashboard-card"
                style={{
                  background: `linear-gradient(to right, #0099FF 0%, #0099FF ${(sliderIndex / TOTAL_STEPS) * 100}%, #1E2228 ${(sliderIndex / TOTAL_STEPS) * 100}%, #1E2228 100%)`,
                }}
              />
              <style jsx>{`
                input[type="range"]::-webkit-slider-thumb {
                  appearance: none;
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  background: #0099FF;
                  cursor: pointer;
                  box-shadow: 0 0 12px rgba(0, 153, 255, 0.5);
                  border: 2px solid #fff;
                }
                input[type="range"]::-moz-range-thumb {
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  background: #0099FF;
                  cursor: pointer;
                  box-shadow: 0 0 12px rgba(0, 153, 255, 0.5);
                  border: 2px solid #fff;
                }
              `}</style>
            </div>

            {/* Slider Scale Labels */}
            <div className="relative h-6 mb-6">
              {[
                { label: "500", position: 0 },
                { label: "5k", position: 1 },
                { label: "15k", position: 2 },
                { label: "30k", position: 3 },
                { label: "50k", position: 4 },
                { label: "100k", position: 5 },
                { label: "100k+", position: 6 },
              ].map(({ label, position }) => (
                <span
                  key={label}
                  className="absolute text-xs text-dashboard-text-muted transform -translate-x-1/2"
                  style={{
                    left: `${(position / TOTAL_STEPS) * 100}%`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            <p className="text-dashboard-text font-semibold text-sm mb-4 uppercase tracking-wide">
              What&apos;s included
            </p>
            <ul className="space-y-3">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-dashboard-accent flex-shrink-0 mt-0.5" />
                  <span className="text-dashboard-text text-sm leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
