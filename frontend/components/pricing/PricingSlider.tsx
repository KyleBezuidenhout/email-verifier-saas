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
const SLIDER_STEPS = SLIDER_PLANS.length; // 0..8 (trial through enterprise)

function buildFeatures(plan: PlanDef): string[] {
  const features: string[] = [];

  if (plan.id === "trial") {
    features.push("1000 credits");
    features.push("0.5 credits per enrichment/verification email");
    features.push("1 credit per Sales Nav profile scraped");
    features.push(plan.support);
  } else if (plan.id === "custom") {
    features.push("5,000,000+ Sales Navigator Profiles");
    features.push("Uncapped Enrichment & Verification");
    features.push("Custom pricing per 1,000 profiles");
    features.push(plan.support);
  } else {
    features.push(`${formatSnLabel(plan.snLabel!)} Sales Navigator Profiles`);
    features.push("Uncapped Enrichment & Verification");
    features.push(plan.support);
  }
  features.push("Credits never expire");
  return features;
}

export function PricingSlider({ variant = "marketing" }: PricingSliderProps) {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [isAnnual, setIsAnnual] = useState(false);

  const isCustom = sliderIndex >= SLIDER_STEPS;
  const selectedPlan: PlanDef = isCustom ? CUSTOM_PLAN : SLIDER_PLANS[sliderIndex];
  const features = useMemo(() => buildFeatures(selectedPlan), [selectedPlan]);

  const displayPrice = useMemo(() => {
    if (isCustom || !selectedPlan.monthlyPrice) return null;
    if (selectedPlan.id === "trial") return null;
    return isAnnual ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice;
  }, [selectedPlan, isAnnual, isCustom]);

  const snLabelDisplay = isCustom
    ? "5,000,000+"
    : selectedPlan.snLabel
      ? formatSnLabel(selectedPlan.snLabel)
      : "1k";

  const savingsLabel = useMemo(() => {
    if (!selectedPlan.monthlyPrice || !selectedPlan.yearlyPrice || selectedPlan.id === "trial") return null;
    if (!isAnnual) return null;
    const saved = selectedPlan.monthlyPrice * 12 - selectedPlan.yearlyPrice;
    return `Save $${saved.toLocaleString()}`;
  }, [selectedPlan, isAnnual]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-left mb-6">
              <h2 className="text-lg md:text-xl font-bold text-dashboard-text mb-1">
                How many contacts do you want to find?
              </h2>
        <p className="text-dashboard-text-muted text-base">
          Up to <span className="text-dashboard-accent font-semibold">{snLabelDisplay}</span> per month
        </p>
      </div>

      {/* Slider + Toggle Row */}
      <div className="flex flex-col md:flex-row items-center gap-4 mb-8">
        {/* Slider */}
        <div className="flex-1 w-full">
          <input
            type="range"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={sliderIndex}
            onChange={(e) => setSliderIndex(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-dashboard-card"
            style={{
              background: `linear-gradient(to right, #0099FF 0%, #0099FF ${(sliderIndex / SLIDER_STEPS) * 100}%, #1E2228 ${(sliderIndex / SLIDER_STEPS) * 100}%, #1E2228 100%)`,
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
          <div className="flex justify-between text-xs text-dashboard-text-muted mt-1 px-1">
            <span>1k</span>
            <span>50k</span>
            <span>100k</span>
            <span>200k</span>
            <span>400k</span>
            <span>1M</span>
            <span>2M</span>
            <span>5M</span>
            <span>5M+</span>
          </div>
        </div>

        {/* Monthly / Yearly Toggle */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-sm font-medium ${!isAnnual ? "text-dashboard-text" : "text-dashboard-text-muted"}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative w-14 h-8 rounded-full transition-colors ${isAnnual ? "bg-dashboard-accent" : "bg-dashboard-card"}`}
          >
            <div
              className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${isAnnual ? "left-7" : "left-1"}`}
            />
          </button>
          <div className="flex flex-col">
            <span className={`text-sm font-medium ${isAnnual ? "text-dashboard-text" : "text-dashboard-text-muted"}`}>
              Yearly
            </span>
            <span className="text-xs text-dashboard-accent font-medium">2 months free</span>
          </div>
        </div>
      </div>

      {/* Plan Card - 3D Glass Effect */}
      <div
        className="relative p-8 lg:p-10 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(13,15,18,0.6) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: `
            0 25px 50px -12px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.05),
            inset 0 1px 0 rgba(255,255,255,0.15),
            inset 0 -1px 0 rgba(0,0,0,0.2),
            0 8px 32px rgba(0,153,255,0.1)
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
            background: 'radial-gradient(circle, rgba(0,153,255,0.25) 0%, transparent 70%)',
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

        <div className="relative grid md:grid-cols-2 gap-8 items-start">
          {/* Left: Plan Info */}
          <div>
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
                <p className="text-dashboard-text-muted mt-1">Get 1,000 Free Credits</p>
              </div>
            ) : isCustom ? (
              <div className="mb-4">
                <div className="text-3xl lg:text-4xl font-bold text-white">Custom</div>
                <p className="text-dashboard-text-muted mt-1">5,000,000+ profiles per month</p>
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl lg:text-4xl font-bold text-white">
                    ${displayPrice?.toLocaleString()}
                  </span>
                  <span className="text-dashboard-text-muted text-lg">/{isAnnual ? "yr" : "mo"}</span>
                </div>
                {savingsLabel && (
                  <p className="text-dashboard-accent text-sm font-medium mt-1">{savingsLabel}</p>
                )}
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
                href={CUSTOM_PLAN.ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block py-3.5 px-6 font-semibold text-center rounded-xl bg-dashboard-accent text-white hover:bg-dashboard-accent/90 transition-all shadow-lg shadow-dashboard-accent/20"
              >
                Book a Call
              </a>
            ) : (
              <Link
                href={variant === "dashboard" ? "/get-credits" : selectedPlan.ctaHref}
                className="inline-block py-3.5 px-6 font-semibold text-center rounded-xl transition-all bg-dashboard-accent text-white hover:bg-dashboard-accent/90 shadow-lg shadow-dashboard-accent/20"
              >
                {selectedPlan.id === "trial" ? "Get Free Credits" : selectedPlan.cta}
              </Link>
            )}
          </div>

          {/* Right: Features */}
          <div>
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

            {/* Value props */}
            <div className="mt-6 pt-4 border-t border-dashboard-border/50">
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
