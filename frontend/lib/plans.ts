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
    snLabel: 2_000,
    creditPrice: 0.0022,
    perThousand: null,
    cta: "Sign Up",
    ctaHref: "/register",
    support: "Email Support",
    enrichmentFree: false,
  },
  {
    id: "test",
    name: "Test",
    monthlyPrice: 5,
    yearlyPrice: 50,
    snLabel: 1_000,
    creditPrice: 0.005,
    perThousand: "$5.00",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Email Support",
    enrichmentFree: true,
  },
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 97,
    yearlyPrice: 970,
    snLabel: 25_000,
    creditPrice: 0.0038,
    perThousand: "$3.80",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Slack Support",
    enrichmentFree: true,
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 177,
    yearlyPrice: 1_770,
    snLabel: 50_000,
    creditPrice: 0.0035,
    perThousand: "$3.50",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Slack Support",
    enrichmentFree: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 337,
    yearlyPrice: 3_370,
    snLabel: 100_000,
    creditPrice: 0.0033,
    perThousand: "$3.30",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Slack Support",
    enrichmentFree: true,
  },
  {
    id: "business_plus",
    name: "Business Plus",
    monthlyPrice: 447,
    yearlyPrice: 4_470,
    snLabel: 150_000,
    creditPrice: 0.0030,
    perThousand: "$3.00",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Dedicated Slack Support",
    enrichmentFree: true,
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 697,
    yearlyPrice: 6_970,
    snLabel: 250_000,
    creditPrice: 0.0028,
    perThousand: "$2.80",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
    support: "Dedicated Slack Support + Deliverability Consulting",
    enrichmentFree: true,
  },
  {
    id: "agency_plus",
    name: "Agency Plus",
    monthlyPrice: 997,
    yearlyPrice: 9_970,
    snLabel: 400_000,
    creditPrice: 0.0024,
    perThousand: "$2.40",
    cta: "Get started",
    ctaHref: "/register?redirect=/get-credits",
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
