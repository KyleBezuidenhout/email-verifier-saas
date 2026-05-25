export interface PlanDef {
  id: string;
  name: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  snLabel: number | null;
  creditPrice: number | null;
  perThousand: string | null;
  cta: string;
  ctaHref: string;
  support: string;
  enrichmentFree: boolean;
}

export const PLANS: PlanDef[] = [
  {
    id: "trial",
    name: "Trial",
    monthlyPrice: 0,
    yearlyPrice: 0,
    snLabel: 500,
    creditPrice: 0.0022,
    perThousand: null,
    cta: "Sign Up",
    ctaHref: "/register",
    support: "Email Support",
    enrichmentFree: false,
  },
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 75,
    yearlyPrice: 750,
    snLabel: 5_000,
    creditPrice: 0.015,
    perThousand: "$15.00",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Email Support",
    enrichmentFree: true,
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 199,
    yearlyPrice: 1_990,
    snLabel: 15_000,
    creditPrice: 0.0133,
    perThousand: "$13.30",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Email Support",
    enrichmentFree: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 329,
    yearlyPrice: 3_290,
    snLabel: 30_000,
    creditPrice: 0.011,
    perThousand: "$11.00",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Slack Support",
    enrichmentFree: true,
  },
  {
    id: "business_plus",
    name: "Business Plus",
    monthlyPrice: 449,
    yearlyPrice: 4_490,
    snLabel: 50_000,
    creditPrice: 0.009,
    perThousand: "$9.00",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Priority Slack Support",
    enrichmentFree: true,
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 699,
    yearlyPrice: 6_990,
    snLabel: 100_000,
    creditPrice: 0.007,
    perThousand: "$7.00",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Priority Slack Support + Deliverability Consulting",
    enrichmentFree: true,
  },
  {
    id: "custom",
    name: "Custom",
    monthlyPrice: null,
    yearlyPrice: null,
    snLabel: null,
    creditPrice: null,
    perThousand: null,
    cta: "Book a Call",
    ctaHref: "https://calendly.com",
    support: "Custom",
    enrichmentFree: true,
  },
];

export function getPlanById(id: string): PlanDef | undefined {
  return PLANS.find((p) => p.id === id);
}

export function formatCredits(credits: number): string {
  if (credits % 1 === 0) return credits.toLocaleString();
  return credits.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatSnLabel(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString()}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString()}k`;
  return n.toLocaleString();
}
