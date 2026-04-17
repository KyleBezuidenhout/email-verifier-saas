"use client";

import { useState } from "react";
import { Check, Star } from "lucide-react";
import { PLANS, formatSnLabel, type PlanDef } from "@/lib/plans";
import { apiClient } from "@/lib/api";

interface CreditsPlanGridProps {
  currentPlanId?: string;
  subscriptionStatus?: string;
  manageUrl?: string | null;
}

function buildFeatures(plan: PlanDef): string[] {
  const features: string[] = [];

  if (plan.id === "trial") {
    features.push("1 credit per valid/catchall email found");
  } else if (plan.id === "custom") {
    features.push("100,000+ emails per month");
    features.push("Priority Slack Support + Deliverability Consulting");
  } else {
    features.push(`${formatSnLabel(plan.snLabel!)} emails per month`);
    features.push(plan.support);
  }

  return features;
}

function getPlanVolume(plan: PlanDef): string {
  if (plan.id === "custom") return "100k+";
  if (!plan.snLabel) return "N/A";
  return formatSnLabel(plan.snLabel);
}

function getCtaLabel(plan: PlanDef, isCurrentPlan: boolean): string {
  if (plan.id === "custom") return "Let's Talk";
  if (plan.id === "trial") return "Free Trial";
  if (isCurrentPlan) return "Manage Subscription";
  if (plan.monthlyPrice && plan.monthlyPrice > 0) {
    return `$${plan.monthlyPrice.toLocaleString()}/mo`;
  }
  return "Get Started";
}

const cardStyle = {
  background: "#0a0a0a",
  border: "1px solid rgba(255,255,255,0.12)",
} as const;

const PLAN_ORDER = PLANS.map((p) => p.id);

function isLowerTier(planId: string, currentPlanId: string): boolean {
  if (planId === "custom" || currentPlanId === "custom") return false;
  const planIndex = PLAN_ORDER.indexOf(planId);
  const currentIndex = PLAN_ORDER.indexOf(currentPlanId);
  return planIndex < currentIndex;
}

export function CreditsPlanGrid({ currentPlanId, subscriptionStatus, manageUrl }: CreditsPlanGridProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (plan: PlanDef) => {
    setLoadingPlan(plan.id);
    try {
      const resp = await apiClient.createSubscriptionCheckout(plan.id, "monthly");
      window.location.href = resp.checkout_url;
    } catch {
      setLoadingPlan(null);
    }
  };

  const handleManage = async () => {
    if (manageUrl) {
      window.open(manageUrl, "_blank");
      return;
    }
    try {
      const resp = await apiClient.getBillingPortalUrl();
      window.open(resp.url, "_blank");
    } catch {
      // no-op
    }
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {PLANS.filter((p) => p.id !== "trial").map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const isLower = currentPlanId ? isLowerTier(plan.id, currentPlanId) : false;
          const features = buildFeatures(plan);
          const ctaLabel = getCtaLabel(plan, isCurrentPlan);
          const isLoading = loadingPlan === plan.id;

          return (
            <div
              key={plan.id}
              className="relative rounded-2xl p-px bg-gradient-to-b from-white/[0.15] via-white/[0.05] to-transparent overflow-hidden h-full"
            >
              {plan.id === "business_plus" && !isCurrentPlan && (
                <div className="absolute top-3 right-3 z-10">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">Most Popular</span>
                  </div>
                </div>
              )}
              <div
                className="relative rounded-[15px] p-6 lg:p-7 h-full flex flex-col"
                style={cardStyle}
              >

                <div className="flex items-start justify-between gap-3 mb-4">
                  <p className="text-dashboard-text text-xl font-semibold">{plan.name}</p>
                  {isCurrentPlan && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-dashboard-accent/10 text-dashboard-accent border border-dashboard-accent/20 whitespace-nowrap">
                      Current
                    </span>
                  )}
                </div>

                <div className="mb-5">
                  <p className="text-4xl font-bold text-dashboard-text leading-none">{getPlanVolume(plan)}</p>
                  <p className="text-dashboard-text-muted mt-1">
                    {plan.id === "trial" ? "Credits" : "Credits per month"}
                  </p>
                  {plan.id === "custom" && (
                    <p className="text-sm mt-1 text-dashboard-text">Custom pricing</p>
                  )}
                  {plan.creditPrice && plan.id !== "trial" && (
                    <p className="text-sm mt-1">
                      <span className="text-dashboard-text">${plan.creditPrice.toFixed(4)}</span>
                      <span className="text-dashboard-text-muted"> per email found</span>
                    </p>
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-dashboard-text-muted font-semibold text-sm mb-3">What&apos;s included</p>
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
                    className="mt-6 inline-flex items-center justify-center border border-dashboard-accent text-dashboard-accent bg-transparent hover:bg-dashboard-accent/10 transition-colors font-semibold py-3 px-4 rounded-lg text-sm"
                  >
                    {ctaLabel}
                  </a>
                ) : isCurrentPlan && subscriptionStatus === "active" ? (
                  <button
                    type="button"
                    onClick={handleManage}
                    className="mt-6 inline-flex items-center justify-center border border-dashboard-accent text-dashboard-accent bg-transparent hover:bg-dashboard-accent/10 transition-colors font-semibold py-3 px-4 rounded-lg text-sm"
                  >
                    Manage Subscription
                  </button>
                ) : plan.id === "trial" ? (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="mt-6 inline-flex items-center justify-center bg-dashboard-card/50 text-dashboard-text-muted border border-dashboard-border/60 font-semibold py-3 px-4 rounded-lg text-sm cursor-default pointer-events-none"
                  >
                    {ctaLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={isLoading}
                    className="mt-6 inline-flex items-center justify-center border border-dashboard-accent text-dashboard-accent bg-transparent hover:bg-dashboard-accent/10 transition-colors font-semibold py-3 px-4 rounded-lg text-sm disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Redirecting...
                      </span>
                    ) : (
                      ctaLabel
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
