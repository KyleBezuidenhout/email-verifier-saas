from typing import List, Dict, Optional

import unicodedata

# Prevalence scores by company size
PREVALENCE_MAP = {
    "firstname": {"1-50": 600, "51-200": 120, "201-500": 120, "500+": 57, "default": 200},
    "flastname": {"1-50": 200, "51-200": 430, "201-500": 430, "500+": 350, "default": 250},
    "firstname.lastname": {"1-50": 180, "51-200": 330, "201-500": 330, "500+": 500, "default": 350},
    "firstname.l": {"default": 25},
    "firstnamelastname": {"default": 25},
    "firstname_lastname": {"default": 20},
    "f.lastname": {"default": 15},
    "lastname": {"default": 15},
    "lastname.firstname": {"default": 5},
    "firstnamel": {"default": 5},
    "lastnamef": {"default": 5},
    "lastname_firstname": {"default": 5},
    "f_lastname": {"default": 5},
    "firstname-lastname": {"default": 5},
    "lastname-firstname": {"default": 5},
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
    """Map company size to prevalence key."""
    if not company_size:
        return "default"

    

    size_str = str(company_size).strip()

    

    if "1-50" in size_str or "1-10" in size_str or "2-10" in size_str:
        return "1-50"
    elif "51-200" in size_str or "51-500" in size_str:
        return "51-200"
    elif "201-500" in size_str:
        return "201-500"
    elif "500+" in size_str or "501+" in size_str or "1001-" in size_str:
        return "500+"

    

    try:
        size_num = int(size_str)
        if 1 <= size_num <= 50:
            return "1-50"
        elif 51 <= size_num <= 200:
            return "51-200"
        elif 201 <= size_num <= 500:
            return "201-500"
        elif size_num > 500:
            return "500+"
    except ValueError:
        pass

    

    return "default"


def get_prevalence_score(pattern: str, company_size_key: str) -> int:
    """Get prevalence score for a pattern and company size."""
    pattern_data = PREVALENCE_MAP.get(pattern, {})
    return pattern_data.get(company_size_key, pattern_data.get("default", 0))


def generate_email_permutations(
    first_name: str,
    last_name: str,
    domain: str,
    company_size: Optional[str] = None
) -> List[Dict[str, any]]:
    """Generate all 15 email permutations with prevalence scores."""

    

    first = normalize_name(first_name)
    last = normalize_name(last_name)
    domain = normalize_domain(domain)
    company_size_key = get_company_size_key(company_size)

    

    if not first or not last or not domain:
        return []

    

    f = first[0]
    l = last[0]

    

    patterns = [
        ("firstname", f"{first}@{domain}"),
        ("flastname", f"{f}{last}@{domain}"),
        ("firstname.lastname", f"{first}.{last}@{domain}"),
        ("firstname.l", f"{first}.{l}@{domain}"),
        ("firstnamelastname", f"{first}{last}@{domain}"),
        ("firstname_lastname", f"{first}_{last}@{domain}"),
        ("f.lastname", f"{f}.{last}@{domain}"),
        ("lastname", f"{last}@{domain}"),
        ("lastname.firstname", f"{last}.{first}@{domain}"),
        ("firstnamel", f"{first}{l}@{domain}"),
        ("lastnamef", f"{last}{f}@{domain}"),
        ("lastname_firstname", f"{last}_{first}@{domain}"),
        ("f_lastname", f"{f}_{last}@{domain}"),
        ("firstname-lastname", f"{first}-{last}@{domain}"),
        ("lastname-firstname", f"{last}-{first}@{domain}"),
    ]

    

    permutations = []
    for pattern_name, email in patterns:
        score = get_prevalence_score(pattern_name, company_size_key)
        permutations.append({
            "email": email,
            "pattern": pattern_name,
            "prevalence_score": score,
        })

    

    return permutations


