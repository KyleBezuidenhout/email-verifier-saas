"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, formatSnLabel, type PlanDef } from "@/lib/plans";

interface CreditsPlanGridProps {
  currentPlanId?: string;
}

function buildFeatures(plan: PlanDef): string[] {
  const features: string[] = [];

  if (plan.id === "trial") {
    features.push("5,000 credits");
    features.push("0.5 credits per enrichment/verification email");
    features.push("1 credit per Sales Nav profile scraped");
    features.push(plan.support);
  } else if (plan.id === "custom") {
    features.push("5,000,000+ Sales Navigator Profiles");
    features.push("Uncapped Enrichment & Verification");
    features.push("Custom pricing per 1,000 profiles");
    features.push("Priority support");
  } else {
    features.push(`${formatSnLabel(plan.snLabel!)} Sales Navigator Profiles`);
    features.push("Uncapped Enrichment & Verification");
    features.push(plan.support);
  }

  features.push("Credits never expire");
  return features;
}

function getPlanVolume(plan: PlanDef): string {
  if (plan.id === "custom") return "5M+";
  if (!plan.snLabel) return "N/A";
  return formatSnLabel(plan.snLabel);
}

function getCtaLabel(plan: PlanDef, isCurrentPlan: boolean): string {
  if (plan.id === "custom") return "Book a Call";
  if (plan.id === "trial") return "Get Free Credits";
  if (isCurrentPlan) return "Manage Subscription";
  return "Change Plan";
}

const glassCardStyle = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(13,15,18,0.6) 100%)",
  backdropFilter: "blur(24px) saturate(180%)",
  WebkitBackdropFilter: "blur(24px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: `
    0 25px 50px -12px rgba(0,0,0,0.5),
    0 0 0 1px rgba(255,255,255,0.05),
    inset 0 1px 0 rgba(255,255,255,0.15),
    inset 0 -1px 0 rgba(0,0,0,0.2),
    0 4px 16px rgba(0,153,255,0.05)
  `,
  transform: "translateZ(0)",
} as const;

export function CreditsPlanGrid({ currentPlanId }: CreditsPlanGridProps) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const features = buildFeatures(plan);
          const ctaLabel = getCtaLabel(plan, isCurrentPlan);

          return (
            <div
              key={plan.id}
              className="relative p-6 lg:p-7 rounded-2xl overflow-hidden h-full"
              style={glassCardStyle}
            >
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }}
              />
              <div
                className="absolute -top-20 -right-20 w-48 h-48 pointer-events-none"
                style={{
                  background: "radial-gradient(circle, rgba(0,153,255,0.12) 0%, transparent 70%)",
                  filter: "blur(40px)",
                }}
              />

              <div className="relative flex flex-col h-full">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <p className="text-dashboard-text text-xl font-semibold">{plan.name}</p>
                  {isCurrentPlan && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-dashboard-accent/10 text-dashboard-accent border border-dashboard-accent/20 whitespace-nowrap">
                      Current Plan
                    </span>
                  )}
                </div>

                <div className="mb-5">
                  <p className="text-5xl font-bold text-dashboard-text leading-none">{getPlanVolume(plan)}</p>
                  <p className="text-dashboard-text-muted mt-1">Credits per month</p>
                  {plan.creditPrice && (
                    <p className="text-dashboard-text-muted text-sm mt-1">${plan.creditPrice.toFixed(4)} per email validated</p>
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-dashboard-text font-semibold text-xs mb-3 uppercase tracking-wide">What&apos;s included</p>
                  <ul className="space-y-2.5">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check className="w-4.5 h-4.5 text-dashboard-accent flex-shrink-0 mt-0.5" />
                        <span className="text-dashboard-text text-sm leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.id === "custom" ? (
                  <a
                    href="https://calendly.com/billionverifier-support/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center justify-center bg-landing-accent/80 hover:bg-landing-accent transition-colors text-landing-bg font-semibold py-3 px-4 rounded-lg text-sm"
                  >
                    {ctaLabel}
                  </a>
                ) : (
                  <Link
                    href="/get-credits"
                    className="mt-6 inline-flex items-center justify-center bg-landing-accent/80 hover:bg-landing-accent transition-colors text-landing-bg font-semibold py-3 px-4 rounded-lg text-sm"
                  >
                    {ctaLabel}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
