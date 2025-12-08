from typing import List, Dict, Optional
import unicodedata

# Prevalence scores by company size (based on frequency data)
# Higher score = higher likelihood = verified first
# Scores are frequency_percent * 100 for integer precision

PREVALENCE_MAP = {
    # Pattern: {company_size: score, ...}
    
    # {first} = firstname@domain
    "firstname": {
        "1-50": 4191,      # Rank 1 (41.91%)
        "51-200": 1699,    # Rank 3 (16.99%)
        "201-500": 743,    # Rank 3 (7.43%)
        "500+": 657,       # Rank 3 (6.57%)
        "default": 1822,   # Generic Rank 3 (18.22%)
    },
    
    # {f}{last} = flastname@domain (e.g., jsmith)
    "flastname": {
        "1-50": 2663,      # Rank 2 (26.63%)
        "51-200": 4176,    # Rank 1 (41.76%)
        "201-500": 4475,   # Rank 1 (44.75%)
        "500+": 2175,      # Rank 2 (21.75%)
        "default": 3372,   # Generic Rank 2 (33.72%)
    },
    
    # {first}.{last} = firstname.lastname@domain
    "firstname.lastname": {
        "1-50": 2266,      # Rank 3 (22.66%)
        "51-200": 3045,    # Rank 2 (30.45%)
        "201-500": 3516,   # Rank 2 (35.16%)
        "500+": 5631,      # Rank 1 (56.31%)
        "default": 3614,   # Generic Rank 1 (36.14%)
    },
    
    # {first}{l} = firstnamel@domain (e.g., johns)
    "firstnamel": {
        "1-50": 267,       # Rank 4 (2.67%)
        "51-200": 356,     # Rank 4 (3.56%)
        "201-500": 344,    # Rank 4 (3.44%)
        "500+": 145,       # Rank 9 (1.45%)
        "default": 278,    # Generic Rank 4 (2.78%)
    },
    
    # {last} = lastname@domain
    "lastname": {
        "1-50": 207,       # Rank 5 (2.07%)
        "51-200": 95,      # Rank 10 (0.95%)
        "201-500": 95,     # Rank 10 (0.95%)
        "500+": 125,       # Rank 10 (1.25%)
        "default": 131,    # Generic Rank 10 (1.31%)
    },
    
    # {last}.{first} = lastname.firstname@domain
    "lastname.firstname": {
        "1-50": 185,       # Rank 6 (1.85%)
        "51-200": 165,     # Rank 6 (1.65%)
        "201-500": 185,    # Rank 6 (1.85%)
        "500+": 215,       # Rank 6 (2.15%)
        "default": 188,    # Generic Rank 6 (1.88%)
    },
    
    # {last}{f} = lastnamef@domain (e.g., smithj)
    "lastnamef": {
        "1-50": 165,       # Rank 7 (1.65%)
        "51-200": 125,     # Rank 8 (1.25%)
        "201-500": 145,    # Rank 8 (1.45%)
        "500+": 165,       # Rank 8 (1.65%)
        "default": 150,    # Generic Rank 9 (1.50%)
    },
    
    # {first}_{last} = firstname_lastname@domain
    "firstname_lastname": {
        "1-50": 145,       # Rank 8 (1.45%)
        "51-200": 115,     # Rank 9 (1.15%)
        "201-500": 125,    # Rank 9 (1.25%)
        "500+": 355,       # Rank 4 (3.55%)
        "default": 185,    # Generic Rank 7 (1.85%)
    },
    
    # {f}.{last} = f.lastname@domain (e.g., j.smith)
    "f.lastname": {
        "1-50": 125,       # Rank 9 (1.25%)
        "51-200": 145,     # Rank 7 (1.45%)
        "201-500": 165,    # Rank 7 (1.65%)
        "500+": 185,       # Rank 7 (1.85%)
        "default": 155,    # Generic Rank 8 (1.55%)
    },
    
    # {first}{last} = firstnamelastname@domain (e.g., johnsmith)
    "firstnamelastname": {
        "1-50": 115,       # Rank 10 (1.15%)
        "51-200": 183,     # Rank 5 (1.83%)
        "201-500": 234,    # Rank 5 (2.34%)
        "500+": 340,       # Rank 5 (3.40%)
        "default": 218,    # Generic Rank 5 (2.18%)
    },
    
    # {l}{first} = lfirstname@domain (e.g., sjohn)
    "lfirstname": {
        "1-50": 95,        # Rank 11 (0.95%)
        "51-200": 50,      # Rank 15 (0.50%)
        "201-500": 50,     # Rank 15 (0.50%)
        "500+": 55,        # Rank 15 (0.55%)
        "default": 63,     # Generic Rank 14 (0.63%)
    },
    
    # {last}_{first} = lastname_firstname@domain
    "lastname_firstname": {
        "1-50": 85,        # Rank 12 (0.85%)
        "51-200": 85,      # Rank 11 (0.85%)
        "201-500": 85,     # Rank 11 (0.85%)
        "500+": 95,        # Rank 11 (0.95%)
        "default": 88,     # Generic Rank 11 (0.88%)
    },
    
    # {f}_{last} = f_lastname@domain (e.g., j_smith)
    "f_lastname": {
        "1-50": 75,        # Rank 13 (0.75%)
        "51-200": 75,      # Rank 12 (0.75%)
        "201-500": 75,     # Rank 12 (0.75%)
        "500+": 85,        # Rank 12 (0.85%)
        "default": 78,     # Generic Rank 12 (0.78%)
    },
    
    # {first}-{last} = firstname-lastname@domain
    "firstname-lastname": {
        "1-50": 65,        # Rank 14 (0.65%)
        "51-200": 65,      # Rank 13 (0.65%)
        "201-500": 65,     # Rank 13 (0.65%)
        "500+": 75,        # Rank 13 (0.75%)
        "default": 68,     # Generic Rank 13 (0.68%)
    },
    
    # {last}-{first} = lastname-firstname@domain
    "lastname-firstname": {
        "1-50": 55,        # Rank 15 (0.55%)
        "51-200": 55,      # Rank 14 (0.55%)
        "201-500": 55,     # Rank 14 (0.55%)
        "500+": 65,        # Rank 14 (0.65%)
        "default": 58,     # Generic Rank 15 (0.58%)
    },
    
    # {first}.{l} = firstname.l@domain (e.g., adam.h) - RARE PATTERN
    # Not in frequency data but some companies use it
    "firstname.l": {
        "1-50": 45,        # Rank 16 (rare)
        "51-200": 45,      # Rank 16 (rare)
        "201-500": 45,     # Rank 16 (rare)
        "500+": 45,        # Rank 16 (rare)
        "default": 45,     # Generic Rank 16 (rare)
    },
}


def normalize_name(name: str) -> str:
    """Remove accents and convert to lowercase ASCII."""
    name = unicodedata.normalize('NFKD', name)
    name = name.encode('ASCII', 'ignore').decode('ASCII')
    return name.lower().strip()


def normalize_domain(website: str) -> str:
    """Extract clean domain from website URL."""
    domain = website.lower().strip()
    domain = domain.replace('http://', '').replace('https://', '')
    domain = domain.replace('www.', '')
    domain = domain.split('/')[0]
    return domain


def get_company_size_key(company_size: Optional[str]) -> str:
    """Map company size to prevalence key. Returns 'default' only if no company size provided."""
    if not company_size:
        return "default"

    size_str = str(company_size).strip().lower()

    # Direct matches
    if "1-50" in size_str or "1-10" in size_str or "2-10" in size_str or "11-50" in size_str:
        return "1-50"
    elif "51-200" in size_str or "51-100" in size_str or "101-200" in size_str:
        return "51-200"
    elif "201-500" in size_str or "201-300" in size_str or "301-500" in size_str:
        return "201-500"
    elif "500+" in size_str or "501+" in size_str or "501-1000" in size_str or "1001-" in size_str or "1000+" in size_str or "5000+" in size_str or "10000+" in size_str:
        return "500+"

    # Try numeric parsing
    try:
        # Extract first number from string
        import re
        numbers = re.findall(r'\d+', size_str)
        if numbers:
            size_num = int(numbers[0])
            if 1 <= size_num <= 50:
                return "1-50"
            elif 51 <= size_num <= 200:
                return "51-200"
            elif 201 <= size_num <= 500:
                return "201-500"
            elif size_num > 500:
                return "500+"
    except (ValueError, IndexError):
        pass

    # Fallback to default only if we couldn't determine size
    return "default"


def get_prevalence_score(pattern: str, company_size_key: str) -> int:
    """Get prevalence score for a pattern and company size."""
    pattern_data = PREVALENCE_MAP.get(pattern, {})
    
    # Try company-specific score first, fall back to default
    if company_size_key != "default" and company_size_key in pattern_data:
        return pattern_data[company_size_key]
    
    return pattern_data.get("default", 0)


def generate_email_permutations(
    first_name: str,
    last_name: str,
    domain: str,
    company_size: Optional[str] = None
) -> List[Dict[str, any]]:
    """
    Generate all 16 email permutations with prevalence scores.
    Permutations are returned sorted by prevalence score (highest first).
    """

    first = normalize_name(first_name)
    last = normalize_name(last_name)
    domain = normalize_domain(domain)
    company_size_key = get_company_size_key(company_size)

    if not first or not last or not domain:
        return []

    # First initial and last initial
    f = first[0]
    l = last[0]

    # All 16 patterns (15 from frequency data + 1 rare pattern)
    patterns = [
        ("firstname", f"{first}@{domain}"),                    # {first}
        ("flastname", f"{f}{last}@{domain}"),                  # {f}{last}
        ("firstname.lastname", f"{first}.{last}@{domain}"),    # {first}.{last}
        ("firstnamel", f"{first}{l}@{domain}"),                # {first}{l}
        ("lastname", f"{last}@{domain}"),                      # {last}
        ("lastname.firstname", f"{last}.{first}@{domain}"),    # {last}.{first}
        ("lastnamef", f"{last}{f}@{domain}"),                  # {last}{f}
        ("firstname_lastname", f"{first}_{last}@{domain}"),    # {first}_{last}
        ("f.lastname", f"{f}.{last}@{domain}"),                # {f}.{last}
        ("firstnamelastname", f"{first}{last}@{domain}"),      # {first}{last}
        ("lfirstname", f"{l}{first}@{domain}"),                # {l}{first}
        ("lastname_firstname", f"{last}_{first}@{domain}"),    # {last}_{first}
        ("f_lastname", f"{f}_{last}@{domain}"),                # {f}_{last}
        ("firstname-lastname", f"{first}-{last}@{domain}"),    # {first}-{last}
        ("lastname-firstname", f"{last}-{first}@{domain}"),    # {last}-{first}
        ("firstname.l", f"{first}.{l}@{domain}"),              # {first}.{l} - rare pattern (e.g., adam.h@)
    ]

    # Build permutations with scores
    permutations = []
    for pattern_name, email in patterns:
        score = get_prevalence_score(pattern_name, company_size_key)
        permutations.append({
            "email": email,
            "pattern": pattern_name,
            "prevalence_score": score,
        })

    # Sort by prevalence score (highest first) - this determines verification order
    permutations.sort(key=lambda x: x["prevalence_score"], reverse=True)

    return permutations
