"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, formatSnLabel, type PlanDef } from "@/lib/plans";

interface PricingSliderProps {
  variant?: "marketing" | "dashboard";
}

const SLIDER_PLANS = PLANS.filter((p) => p.id !== "custom");
const CUSTOM_PLAN = PLANS.find((p) => p.id === "custom")!;
const REGULAR_PLAN_COUNT = SLIDER_PLANS.length; // 7 plans (trial through agency_plus)
const TOTAL_STEPS = REGULAR_PLAN_COUNT; // 0..6 for regular plans, position 7 is custom

function buildFeatures(plan: PlanDef): string[] {
  const features: string[] = [];

  if (plan.id === "trial") {
    features.push("0.5 credits per email enrichment or verification");
    features.push("1 credit per Sales Nav profile scraped");
  } else if (plan.id === "custom") {
    features.push("400,000+ Sales Navigator Profiles");
    features.push("Dedicated Slack Support + Deliverability Consulting");
    features.push("1 Enterprise Sales Nav Seat");
  } else {
    features.push(`${formatSnLabel(plan.snLabel!)} Sales Navigator Profiles`);
    features.push(plan.support);
    if (plan.id === "agency_plus") {
      features.push("1 Enterprise Sales Nav Seat");
    }
  }
  return features;
}

export function PricingSlider({ variant = "marketing" }: PricingSliderProps) {
  const [sliderIndex, setSliderIndex] = useState(0);

  const isCustom = sliderIndex >= REGULAR_PLAN_COUNT;
  const selectedPlan: PlanDef = isCustom ? CUSTOM_PLAN : SLIDER_PLANS[sliderIndex];
  const features = useMemo(() => buildFeatures(selectedPlan), [selectedPlan]);

  const displayPrice = useMemo(() => {
    if (isCustom || !selectedPlan.monthlyPrice) return null;
    if (selectedPlan.id === "trial") return null;
    return selectedPlan.monthlyPrice;
  }, [selectedPlan, isCustom]);

  const snLabelDisplay = isCustom
    ? "400,000+"
    : selectedPlan.snLabel
      ? formatSnLabel(selectedPlan.snLabel)
      : "2k";

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header + Toggle Row */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
        <div className="text-left">
          <h2 className="text-lg md:text-xl font-bold text-dashboard-text mb-1">
            How many contacts do you want to find?
          </h2>
          <p className="text-dashboard-text-muted text-base">
            Up to <span className="text-dashboard-accent font-semibold">{snLabelDisplay}</span> per month
          </p>
        </div>

      </div>

      {/* Plan Card - 3D Glass Effect */}
      <div
        className="relative p-8 lg:p-10 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(13,15,18,0.6) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: `
            0 25px 50px -12px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.05),
            inset 0 1px 0 rgba(255,255,255,0.15),
            inset 0 -1px 0 rgba(0,0,0,0.2),
            0 4px 16px rgba(0,153,255,0.05)
          `,
          transform: 'translateZ(0)',
        }}
      >
        {/* Top highlight shine */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
          }}
        />

        {/* Corner glow accent */}
        <div
          className="absolute -top-20 -right-20 w-60 h-60 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0,153,255,0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Bottom inner shadow for depth */}
        <div
          className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.3), transparent)',
          }}
        />

        {/* Glass edge reflection */}
        <div
          className="absolute inset-y-0 left-0 w-px pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.2), transparent)',
          }}
        />

        <div className="relative flex flex-col md:flex-row gap-8 items-center">
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
                <p className="text-dashboard-text-muted mt-1">Get 2,000 Free Credits</p>
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
                {selectedPlan.perThousand && (
                  <p className="text-dashboard-text-muted text-sm mt-1">
                    {selectedPlan.perThousand} per 1,000 profiles
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
                className="inline-flex items-center gap-2 bg-landing-accent text-landing-bg px-6 py-3 font-semibold text-sm tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
              >
                Let's Talk
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            ) : (
              <Link
                href={variant === "dashboard" ? "/get-credits" : selectedPlan.ctaHref}
                className="inline-flex items-center gap-2 bg-landing-accent text-landing-bg px-6 py-3 font-semibold text-sm tracking-wide glow-accent hover-glow-accent transition-all duration-300 hover:bg-landing-accent/90"
              >
                {selectedPlan.id === "trial" ? "Get Free Credits" : selectedPlan.cta}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            )}
          </div>

          {/* Right: Slider + Labels + Features */}
          <div className="flex-1">
            {/* Slider */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={TOTAL_STEPS}
                step={1}
                value={sliderIndex}
                onChange={(e) => setSliderIndex(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-dashboard-card"
                style={{
                  background: `linear-gradient(to right, #0099FF 0%, #0099FF ${(sliderIndex / TOTAL_STEPS) * 100}%, #1E2228 ${(sliderIndex / TOTAL_STEPS) * 100}%, #1E2228 100%)`,
                }}
              />
              <style jsx>{`
                input[type="range"]::-webkit-slider-thumb {
                  appearance: none;
                  width: 22px;
                  height: 22px;
                  border-radius: 50%;
                  background: #0099FF;
                  cursor: pointer;
                  box-shadow: 0 0 16px rgba(0, 153, 255, 0.5);
                  border: 2px solid #fff;
                }
                input[type="range"]::-moz-range-thumb {
                  width: 22px;
                  height: 22px;
                  border-radius: 50%;
                  background: #0099FF;
                  cursor: pointer;
                  box-shadow: 0 0 16px rgba(0, 153, 255, 0.5);
                  border: 2px solid #fff;
                }
              `}</style>
            </div>

            {/* Slider Scale Labels */}
            <div className="relative h-6 mb-6">
              {[
                { label: "2k", position: 0 },
                { label: "25k", position: 1 },
                { label: "50k", position: 2 },
                { label: "100k", position: 3 },
                { label: "150k", position: 4 },
                { label: "250k", position: 5 },
                { label: "400k", position: 6 },
                { label: "400k+", position: 7 },
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
  );
}
