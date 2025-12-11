from typing import List, Dict, Optional
import unicodedata

# Prevalence scores by company size (based on frequency data)
# Higher score = higher likelihood = verified first
# Scores are frequency_percent * 100 for integer precision
# 16 patterns only (primary set)

PREVALENCE_MAP = {
    # Pattern: {company_size: score, ...}
    
    # 1. {first} = firstname@domain
    "firstname": {
        "1-50": 4191, "51-200": 1699, "201-500": 743, "500+": 657,
        "default": 1823,  # Generic avg: 18.225%
    },
    
    # 2. {f}{last} = flastname@domain (e.g., asmith)
    "flastname": {
        "1-50": 2663, "51-200": 4176, "201-500": 4475, "500+": 2175,
        "default": 3372,  # Generic avg: 33.7225%
    },
    
    # 3. {first}.{last} = firstname.lastname@domain
    "firstname.lastname": {
        "1-50": 2266, "51-200": 3045, "201-500": 3516, "500+": 5631,
        "default": 3615,  # Generic avg: 36.145%
    },
    
    # 4. {first}{l} = firstnamel@domain (e.g., adams)
    "firstnamel": {
        "1-50": 267, "51-200": 356, "201-500": 344, "500+": 145,
        "default": 278,  # Generic avg: 2.78%
    },
    
    # 5. {last} = lastname@domain
    "lastname": {
        "1-50": 207, "51-200": 95, "201-500": 95, "500+": 125,
        "default": 131,  # Generic avg: 1.305%
    },
    
    # 6. {last}.{first} = lastname.firstname@domain
    "lastname.firstname": {
        "1-50": 185, "51-200": 165, "201-500": 185, "500+": 215,
        "default": 188,  # Generic avg: 1.875%
    },
    
    # 7. {last}{f} = lastnamef@domain (e.g., smitha)
    "lastnamef": {
        "1-50": 165, "51-200": 125, "201-500": 145, "500+": 165,
        "default": 150,  # Generic avg: 1.50%
    },
    
    # 8. {first}_{last} = firstname_lastname@domain
    "firstname_lastname": {
        "1-50": 145, "51-200": 115, "201-500": 125, "500+": 355,
        "default": 185,  # Generic avg: 1.85%
    },
    
    # 9. {f}.{last} = f.lastname@domain (e.g., a.smith)
    "f.lastname": {
        "1-50": 125, "51-200": 145, "201-500": 165, "500+": 185,
        "default": 155,  # Generic avg: 1.55%
    },
    
    # 10. {first}{last} = firstnamelastname@domain (e.g., adamsmith)
    "firstnamelastname": {
        "1-50": 115, "51-200": 183, "201-500": 234, "500+": 340,
        "default": 218,  # Generic avg: 2.18%
    },
    
    # 11. {l}{first} = lfirstname@domain (e.g., sadam)
    "lfirstname": {
        "1-50": 95, "51-200": 50, "201-500": 50, "500+": 55,
        "default": 63,  # Generic avg: 0.625%
    },
    
    # 12. {last}_{first} = lastname_firstname@domain
    "lastname_firstname": {
        "1-50": 85, "51-200": 85, "201-500": 85, "500+": 95,
        "default": 88,  # Generic avg: 0.875%
    },
    
    # 13. {f}_{last} = f_lastname@domain (e.g., a_smith)
    "f_lastname": {
        "1-50": 75, "51-200": 75, "201-500": 75, "500+": 85,
        "default": 78,  # Generic avg: 0.775%
    },
    
    # 14. {first}-{last} = firstname-lastname@domain
    "firstname-lastname": {
        "1-50": 65, "51-200": 65, "201-500": 65, "500+": 75,
        "default": 68,  # Generic avg: 0.675%
    },
    
    # 15. {last}-{first} = lastname-firstname@domain
    "lastname-firstname": {
        "1-50": 55, "51-200": 55, "201-500": 55, "500+": 65,
        "default": 58,  # Generic avg: 0.575%
    },
    
    # 16. {f}{l} = fl@domain (e.g., as)
    "fl": {
        "1-50": 50, "51-200": 45, "201-500": 45, "500+": 50,
        "default": 48,  # Generic avg: 0.475%
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
    Generate 16 email permutations with prevalence scores.
    Permutations are returned sorted by prevalence score (highest first).
    Early exit on VALID, verify all 16 if catchall found.
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

    # 16 patterns (primary set only)
    patterns = [
        ("firstname", f"{first}@{domain}"),                          # 1. {first}
        ("flastname", f"{f}{last}@{domain}"),                        # 2. {f}{last}
        ("firstname.lastname", f"{first}.{last}@{domain}"),          # 3. {first}.{last}
        ("firstnamel", f"{first}{l}@{domain}"),                      # 4. {first}{l}
        ("lastname", f"{last}@{domain}"),                            # 5. {last}
        ("lastname.firstname", f"{last}.{first}@{domain}"),          # 6. {last}.{first}
        ("lastnamef", f"{last}{f}@{domain}"),                        # 7. {last}{f}
        ("firstname_lastname", f"{first}_{last}@{domain}"),          # 8. {first}_{last}
        ("f.lastname", f"{f}.{last}@{domain}"),                      # 9. {f}.{last}
        ("firstnamelastname", f"{first}{last}@{domain}"),            # 10. {first}{last}
        ("lfirstname", f"{l}{first}@{domain}"),                      # 11. {l}{first}
        ("lastname_firstname", f"{last}_{first}@{domain}"),          # 12. {last}_{first}
        ("f_lastname", f"{f}_{last}@{domain}"),                      # 13. {f}_{last}
        ("firstname-lastname", f"{first}-{last}@{domain}"),          # 14. {first}-{last}
        ("lastname-firstname", f"{last}-{first}@{domain}"),          # 15. {last}-{first}
        ("fl", f"{f}{l}@{domain}"),                                  # 16. {f}{l}
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
