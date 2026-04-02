"use client";

import { useAuth } from "@/context/AuthContext";
import { getPlanById, formatCredits } from "@/lib/plans";
import { CreditsPlanGrid } from "@/components/pricing/CreditsPlanGrid";

export default function GetCreditsPage() {
  const { user } = useAuth();

  const userPlan = user?.plan || "trial";
  const planDef = getPlanById(userPlan);

  return (
    <div className="min-h-screen">
      {/* Plan Banner */}
      <div className="px-6 lg:px-8 py-8 border-b border-dashboard-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-dashboard-text">Get More Credits</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 rounded-full text-sm font-semibold bg-dashboard-accent/10 text-dashboard-accent border border-dashboard-accent/20">
              {planDef?.name ?? "Trial"} Plan
            </span>
            {user && (
              <span className="text-dashboard-text-muted text-sm">
                {formatCredits(user.credits)} credits
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PRICING PLANS SECTION */}
      <section className="px-6 lg:px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <CreditsPlanGrid currentPlanId={userPlan} />
        </div>
      </section>
    </div>
  );
}
