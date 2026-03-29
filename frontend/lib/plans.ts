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
    snLabel: 1_000,
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
    monthlyPrice: 197,
    yearlyPrice: 1_970,
    snLabel: 50_000,
    creditPrice: 0.0039,
    perThousand: "$3.90",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support",
    enrichmentFree: true,
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 297,
    yearlyPrice: 2_970,
    snLabel: 100_000,
    creditPrice: 0.0029,
    perThousand: "$2.90",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support",
    enrichmentFree: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 497,
    yearlyPrice: 4_970,
    snLabel: 200_000,
    creditPrice: 0.0024,
    perThousand: "$2.40",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support",
    enrichmentFree: true,
  },
  {
    id: "business_plus",
    name: "Business Plus",
    monthlyPrice: 897,
    yearlyPrice: 8_970,
    snLabel: 400_000,
    creditPrice: 0.0022,
    perThousand: "$2.20",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support",
    enrichmentFree: true,
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 1_697,
    yearlyPrice: 16_970,
    snLabel: 1_000_000,
    creditPrice: 0.0017,
    perThousand: "$1.70",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support + Deliverability Consulting",
    enrichmentFree: true,
  },
  {
    id: "agency_plus",
    name: "Agency Plus",
    monthlyPrice: 2_997,
    yearlyPrice: 29_970,
    snLabel: 2_000_000,
    creditPrice: 0.0015,
    perThousand: "$1.50",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support + Deliverability Consulting",
    enrichmentFree: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 4_997,
    yearlyPrice: 49_970,
    snLabel: 5_000_000,
    creditPrice: 0.00099,
    perThousand: "$0.99",
    cta: "Get started",
    ctaHref: "/register",
    support: "Dedicated Slack Support + Deliverability Consulting",
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
