"""
Plan definitions and helpers for the billing system.

Each user has a `plan` field (default "trial"). Plans determine:
  - credit_price: $/credit for top-ups
  - sn_cost: credits consumed per Sales Nav profile scraped
  - enrichment_cost: credits consumed per enrichment/verification email (0 = free)
  - monthly_price / yearly_price: display prices (billing is admin-managed for now)
  - sn_label: marketing label for "profiles per month"
  - support: support tier description
"""

from decimal import Decimal
from typing import Optional

PLAN_NAMES = [
    "trial", "basic", "starter", "business", "business_plus",
    "agency", "agency_plus", "enterprise", "custom",
]

PLANS = {
    "trial": {
        "credit_price": Decimal("0.0022"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0.5"),
        "monthly_price": 0,
        "yearly_price": 0,
        "sn_label": 2000,
        "support": "Email Support",
    },
    "basic": {
        "credit_price": Decimal("0.0039"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 197,
        "yearly_price": 1970,
        "sn_label": 50_000,
        "support": "Dedicated Slack Support",
    },
    "starter": {
        "credit_price": Decimal("0.0029"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 297,
        "yearly_price": 2970,
        "sn_label": 100_000,
        "support": "Dedicated Slack Support",
    },
    "business": {
        "credit_price": Decimal("0.0024"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 497,
        "yearly_price": 4970,
        "sn_label": 200_000,
        "support": "Dedicated Slack Support",
    },
    "business_plus": {
        "credit_price": Decimal("0.0022"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 897,
        "yearly_price": 8970,
        "sn_label": 400_000,
        "support": "Dedicated Slack Support",
    },
    "agency": {
        "credit_price": Decimal("0.0017"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 1697,
        "yearly_price": 16970,
        "sn_label": 1_000_000,
        "support": "Dedicated Slack Support + Deliverability Consulting",
    },
    "agency_plus": {
        "credit_price": Decimal("0.0015"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 2997,
        "yearly_price": 29970,
        "sn_label": 2_000_000,
        "support": "Dedicated Slack Support + Deliverability Consulting",
    },
    "enterprise": {
        "credit_price": Decimal("0.00099"),
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": 4997,
        "yearly_price": 49970,
        "sn_label": 5_000_000,
        "support": "Dedicated Slack Support + Deliverability Consulting",
    },
    "custom": {
        "credit_price": None,
        "sn_cost": Decimal("1"),
        "enrichment_cost": Decimal("0"),
        "monthly_price": None,
        "yearly_price": None,
        "sn_label": None,
        "support": "Custom",
    },
}


def get_enrichment_cost(plan: str) -> Decimal:
    """Credits consumed per enrichment/verification email for this plan."""
    return PLANS.get(plan, PLANS["trial"])["enrichment_cost"]


def is_enrichment_free(plan: str) -> bool:
    """True for all paid plans; False only for trial."""
    return plan != "trial"


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


# Fixed rate for one-time credit top-ups: $0.005 per credit
TOPUP_CREDIT_RATE = Decimal("0.005")

# Maps Whop plan_id -> (internal_plan_name, billing_interval)
WHOP_PLAN_MAP = {
    # Monthly plans (live)
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
    ("basic", "monthly"):         50_000,
    ("basic", "yearly"):          50_000,
    ("starter", "monthly"):       100_000,
    ("starter", "yearly"):        100_000,
    ("business", "monthly"):      200_000,
    ("business", "yearly"):       200_000,
    ("business_plus", "monthly"): 400_000,
    ("business_plus", "yearly"):  400_000,
    ("agency", "monthly"):        1_000_000,
    ("agency", "yearly"):         1_000_000,
    ("agency_plus", "monthly"):   2_000_000,
    ("agency_plus", "yearly"):    2_000_000,
    ("enterprise", "monthly"):    5_000_000,
    ("enterprise", "yearly"):     5_000_000,
}


def get_plan_credits(plan: str, interval: str = "monthly") -> int:
    """Credits granted for a plan+interval combo."""
    return PLAN_CREDITS.get((plan, interval), 0)


def resolve_whop_plan(whop_plan_id: str):
    """Resolve a Whop plan ID to (internal_plan_name, billing_interval) or None."""
    return WHOP_PLAN_MAP.get(whop_plan_id)
