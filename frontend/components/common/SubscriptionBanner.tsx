"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; message: string; cta?: string; ctaHref?: string }> = {
  past_due: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    message: "Your payment is past due. Please update your payment method to avoid losing access.",
    cta: "Update Payment",
    ctaHref: "/get-credits",
  },
  cancelling: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    message: "Your subscription is set to cancel at the end of the billing period.",
    cta: "Reactivate",
  },
  disputed: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    message: "Your account has been frozen due to a payment dispute. Please contact support.",
  },
  cancelled: {
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    text: "text-zinc-400",
    message: "Your subscription has been cancelled. Upgrade to regain full access.",
    cta: "Get a Plan",
    ctaHref: "/get-credits",
  },
};

export function SubscriptionBanner() {
  const { user } = useAuth();

  if (!user?.subscription_status) return null;

  const config = STATUS_CONFIG[user.subscription_status];
  if (!config) return null;

  const handleManage = () => {
    if (user.manage_url) {
      window.open(user.manage_url, "_blank");
    }
  };

  return (
    <div className={`${config.bg} ${config.border} border-b px-4 py-2.5 flex items-center justify-between`}>
      <p className={`${config.text} text-sm font-medium`}>{config.message}</p>
      {config.cta && (
        config.ctaHref ? (
          <Link
            href={config.ctaHref}
            className={`${config.text} text-sm font-semibold hover:underline shrink-0 ml-4`}
          >
            {config.cta} &rarr;
          </Link>
        ) : (
          <button
            onClick={handleManage}
            className={`${config.text} text-sm font-semibold hover:underline shrink-0 ml-4`}
          >
            {config.cta} &rarr;
          </button>
        )
      )}
    </div>
  );
}
