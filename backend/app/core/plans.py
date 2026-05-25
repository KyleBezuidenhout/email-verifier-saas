"""
Plan definitions and helpers for the billing system.

Each user has a `plan` field (default "trial"). Plans determine:
  - credit_price: $/credit for top-ups
  - enrichment_cost: 1 credit per valid/catchall email found (all plans)
  - monthly_price / yearly_price: display prices (billing is admin-managed for now)
  - sn_label: marketing label for "profiles per month"
  - support: support tier description

Unified pipeline: scraping is free (no credit deduction). Credits are reserved
upfront based on estimated_leads, then reconciled after enrichment to charge
only for valid + catchall emails found.
"""

from decimal import Decimal
from typing import Optional

PLAN_NAMES = [
    "trial", "test_downgrade", "test", "basic", "starter", "business",
    "business_plus", "agency", "agency_plus", "enterprise", "custom",
]

PLANS = {
    "trial": {
        "credit_price": Decimal("0.0022"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 0,
        "yearly_price": 0,
        "sn_label": 500,
        "support": "Email Support",
    },
    "test_downgrade": {
        "credit_price": Decimal("0.004"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 1,
        "yearly_price": 10,
        "sn_label": 250,
        "support": "Email Support",
    },
    "test": {
        "credit_price": Decimal("0.005"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 5,
        "yearly_price": 50,
        "sn_label": 1_000,
        "support": "Email Support",
    },
    "basic": {
        "credit_price": Decimal("0.015"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 75,
        "yearly_price": 750,
        "sn_label": 5_000,
        "support": "Email Support",
    },
    "starter": {
        "credit_price": Decimal("0.0133"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 199,
        "yearly_price": 1990,
        "sn_label": 15_000,
        "support": "Email Support",
    },
    "business": {
        "credit_price": Decimal("0.011"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 329,
        "yearly_price": 3290,
        "sn_label": 30_000,
        "support": "Slack Support",
    },
    "business_plus": {
        "credit_price": Decimal("0.009"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 449,
        "yearly_price": 4490,
        "sn_label": 50_000,
        "support": "Priority Slack Support",
    },
    "agency": {
        "credit_price": Decimal("0.007"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 699,
        "yearly_price": 6990,
        "sn_label": 100_000,
        "support": "Priority Slack Support + Deliverability Consulting",
    },
    "agency_plus": {
        "credit_price": Decimal("0.0015"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 2997,
        "yearly_price": 29970,
        "sn_label": 2_000_000,
        "support": "Dedicated Slack Support + Deliverability Consulting",
    },
    "enterprise": {
        "credit_price": Decimal("0.00099"),
        "enrichment_cost": Decimal("1"),
        "monthly_price": 4997,
        "yearly_price": 49970,
        "sn_label": 5_000_000,
        "support": "Dedicated Slack Support + Deliverability Consulting",
    },
    "custom": {
        "credit_price": None,
        "enrichment_cost": Decimal("1"),
        "monthly_price": None,
        "yearly_price": None,
        "sn_label": None,
        "support": "Custom",
    },
}


def get_enrichment_cost(plan: str) -> Decimal:
    """Credits charged per valid/catchall email found after enrichment."""
    return PLANS.get(plan, PLANS["trial"])["enrichment_cost"]


def is_enrichment_free(plan: str) -> bool:
    """True when the plan's enrichment_cost is zero. Always false under unified pipeline."""
    return PLANS.get(plan, PLANS["trial"])["enrichment_cost"] == Decimal("0")


def get_credit_price(plan: str, custom_price: Optional[Decimal] = None) -> Decimal:
    """Per-credit dollar price for top-ups. Raises ValueError for misconfigured custom plans."""
    if plan == "custom":
        if custom_price is None:
            raise ValueError("Custom plan requires custom_credit_price to be set")
        return Decimal(str(custom_price))
    cfg = PLANS.get(plan, PLANS["trial"])
    return cfg["credit_price"]


def is_valid_plan(plan: str) -> bool:
    return plan in PLAN_NAMES


# Fixed rate for one-time credit top-ups: $0.015 per email
TOPUP_CREDIT_RATE = Decimal("0.015")

# Maps Whop plan_id -> (internal_plan_name, billing_interval)
WHOP_PLAN_MAP = {
    # Monthly plans (live)
    "plan_McMRrFPETaE9m":  ("test_downgrade", "monthly"),  # TEMPORARY: remove after verifying downgrades
    "plan_sb5AjBy8y7x9P":  ("test", "monthly"),
    "plan_umRQyYI3wpbHI":  ("basic", "monthly"),
    "plan_rv5pWEfhAojcc":  ("starter", "monthly"),
    "plan_MwGQg04mxi2KG":  ("business", "monthly"),
    "plan_IggPcV4phfmAP":  ("business_plus", "monthly"),
    "plan_PPVkUA9flLJsI":  ("agency", "monthly"),
    "plan_olIs2XDrKakV3":  ("agency_plus", "monthly"),
    # Yearly plans — add here when created in Whop dashboard
}

# Reverse map: (plan_name, interval) -> whop_plan_id
REVERSE_PLAN_MAP = {v: k for k, v in WHOP_PLAN_MAP.items()}

# Credits granted per billing cycle.
# Yearly entries equal the MONTHLY amount — yearly subscribers receive
# 12 monthly drips (one per ~30 days) rather than all credits upfront.
PLAN_CREDITS = {
    ("test_downgrade", "monthly"):   250,  # TEMPORARY: remove after verifying downgrades
    ("test_downgrade", "yearly"):    250,
    ("test", "monthly"):           1_000,
    ("test", "yearly"):            1_000,
    ("basic", "monthly"):          5_000,
    ("basic", "yearly"):           5_000,
    ("starter", "monthly"):        15_000,
    ("starter", "yearly"):         15_000,
    ("business", "monthly"):       30_000,
    ("business", "yearly"):        30_000,
    ("business_plus", "monthly"):  50_000,
    ("business_plus", "yearly"):   50_000,
    ("agency", "monthly"):         100_000,
    ("agency", "yearly"):          100_000,
    ("agency_plus", "monthly"):    200_000,
    ("agency_plus", "yearly"):     200_000,
    ("enterprise", "monthly"):     500_000,
    ("enterprise", "yearly"):      500_000,
}


def get_plan_credits(plan: str, interval: str = "monthly") -> int:
    """Credits granted for a plan+interval combo."""
    return PLAN_CREDITS.get((plan, interval), 0)


def resolve_whop_plan(whop_plan_id: str):
    """Resolve a Whop plan ID to (internal_plan_name, billing_interval) or None."""
    return WHOP_PLAN_MAP.get(whop_plan_id)
