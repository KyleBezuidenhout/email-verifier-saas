from typing import List, Dict, Optional
import unicodedata
import re

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

# Extended prevalence scores for patterns 17-32 (fallback set)
# These are only used when all 16 primary patterns return invalid
# Scores are frequency_percent * 100 for integer precision
EXTENDED_PREVALENCE_MAP = {
    # 17. {last}{first} = lastnamefirstname@domain
    "lastnamefirstname": {
        "1-50": 45, "51-200": 35, "201-500": 35, "500+": 40,
        "default": 39,  # 0.39%
    },
    
    # 18. {first}.{l} = firstname.l@domain (e.g., adam.s)
    "firstname.l": {
        "1-50": 40, "51-200": 40, "201-500": 40, "500+": 45,
        "default": 41,  # 0.41%
    },
    
    # 19. {l}.{first} = l.firstname@domain (e.g., s.adam)
    "l.firstname": {
        "1-50": 35, "51-200": 30, "201-500": 30, "500+": 35,
        "default": 33,  # 0.33%
    },
    
    # 20. {f}-{last} = f-lastname@domain (e.g., a-smith)
    "f-lastname": {
        "1-50": 30, "51-200": 25, "201-500": 25, "500+": 30,
        "default": 28,  # 0.28%
    },
    
    # 21. {l}-{first} = l-firstname@domain (e.g., s-adam)
    "l-firstname": {
        "1-50": 25, "51-200": 22, "201-500": 22, "500+": 25,
        "default": 24,  # 0.24%
    },
    
    # 22. {first}{f} = firstnamef@domain (e.g., adama) - unusual pattern
    "firstnamef": {
        "1-50": 22, "51-200": 20, "201-500": 20, "500+": 22,
        "default": 21,  # 0.21%
    },
    
    # 23. {last}{l} = lastnamel@domain (e.g., smiths) - unusual pattern
    "lastnamel": {
        "1-50": 20, "51-200": 18, "201-500": 18, "500+": 20,
        "default": 19,  # 0.19%
    },
    
    # 24. {f}.{l} = f.l@domain (e.g., a.s)
    "f.l": {
        "1-50": 18, "51-200": 15, "201-500": 15, "500+": 18,
        "default": 17,  # 0.17%
    },
    
    # 25. {f}_{l} = f_l@domain (e.g., a_s)
    "f_l": {
        "1-50": 15, "51-200": 12, "201-500": 12, "500+": 15,
        "default": 14,  # 0.14%
    },
    
    # 26. {first}-{l} = firstname-l@domain (e.g., adam-s)
    "firstname-l": {
        "1-50": 12, "51-200": 10, "201-500": 10, "500+": 12,
        "default": 11,  # 0.11%
    },
    
    # 27. {last}-{l} = lastname-l@domain (e.g., smith-s) - unusual pattern
    "lastname-l": {
        "1-50": 10, "51-200": 8, "201-500": 8, "500+": 10,
        "default": 9,  # 0.09%
    },
    
    # 28. {l}{f} = lf@domain (e.g., sa)
    "lf": {
        "1-50": 8, "51-200": 6, "201-500": 6, "500+": 8,
        "default": 7,  # 0.07%
    },
    
    # 29. {l}_{f} = l_f@domain (e.g., s_a)
    "l_f": {
        "1-50": 6, "51-200": 4, "201-500": 4, "500+": 6,
        "default": 5,  # 0.05%
    },
    
    # 30. {l}-{f} = l-f@domain (e.g., s-a)
    "l-f": {
        "1-50": 4, "51-200": 2, "201-500": 2, "500+": 4,
        "default": 3,  # 0.03%
    },
    
    # 31. {l}.{f} = l.f@domain (e.g., s.a)
    "l.f": {
        "1-50": 2, "51-200": 1, "201-500": 1, "500+": 2,
        "default": 2,  # 0.02%
    },
    
    # 32. {f}{last}_{l} = flastname_l@domain (e.g., asmith_s)
    "flastname_l": {
        "1-50": 1, "51-200": 1, "201-500": 1, "500+": 1,
        "default": 1,  # 0.01%
    },
}

# Extended pattern order by company size (17-32)
# Order differs slightly between company sizes based on prevalence data
EXTENDED_PATTERN_ORDER = {
    "1-50": [
        "lastnamefirstname",  # 17
        "firstname.l",        # 18
        "l.firstname",        # 19
        "f-lastname",         # 20
        "l-firstname",        # 21
        "firstnamef",         # 22
        "lastnamel",          # 23
        "f.l",                # 24
        "f_l",                # 25
        "firstname-l",        # 26
        "lastname-l",         # 27
        "lf",                 # 28
        "l_f",                # 29
        "l-f",                # 30
        "l.f",                # 31
        "flastname_l",        # 32
    ],
    "51-200": [
        "firstname.l",        # 17
        "lastnamefirstname",  # 18
        "l.firstname",        # 19
        "f-lastname",         # 20
        "l-firstname",        # 21
        "firstnamef",         # 22
        "lastnamel",          # 23
        "f.l",                # 24
        "f_l",                # 25
        "firstname-l",        # 26
        "lastname-l",         # 27
        "lf",                 # 28
        "l_f",                # 29
        "l-f",                # 30
        "l.f",                # 31
        "flastname_l",        # 32
    ],
    "201-500": [
        "firstname.l",        # 17
        "lastnamefirstname",  # 18
        "l.firstname",        # 19
        "f-lastname",         # 20
        "l-firstname",        # 21
        "firstnamef",         # 22
        "lastnamel",          # 23
        "f.l",                # 24
        "f_l",                # 25
        "firstname-l",        # 26
        "lastname-l",         # 27
        "lf",                 # 28
        "l_f",                # 29
        "l-f",                # 30
        "l.f",                # 31
        "flastname_l",        # 32
    ],
    "500+": [
        "firstname.l",        # 17
        "lastnamefirstname",  # 18
        "l.firstname",        # 19
        "f-lastname",         # 20
        "l-firstname",        # 21
        "firstnamef",         # 22
        "lastnamel",          # 23
        "f.l",                # 24
        "f_l",                # 25
        "firstname-l",        # 26
        "lastname-l",         # 27
        "lf",                 # 28
        "l_f",                # 29
        "l-f",                # 30
        "l.f",                # 31
        "flastname_l",        # 32
    ],
    "default": [
        "firstname.l",        # 17
        "lastnamefirstname",  # 18
        "l.firstname",        # 19
        "f-lastname",         # 20
        "l-firstname",        # 21
        "firstnamef",         # 22
        "lastnamel",          # 23
        "f.l",                # 24
        "f_l",                # 25
        "firstname-l",        # 26
        "lastname-l",         # 27
        "lf",                 # 28
        "l_f",                # 29
        "l-f",                # 30
        "l.f",                # 31
        "flastname_l",        # 32
    ],
}


def clean_first_name(first_name: str) -> str:
    """
    Clean first name by removing trailing initials (e.g., "n.", "m.").
    
    Examples:
        "Chelsey n." -> "Chelsey"
        "John m." -> "John"
        "Sarah j." -> "Sarah"
        "Mary-Anne" -> "Mary-Anne" (unchanged)
    """
    if not first_name:
        return first_name
    
    # Strip whitespace
    cleaned = first_name.strip()
    
    # Remove trailing pattern: space + single letter + optional period
    # Pattern matches: " n.", " n", " m.", " m", etc.
    cleaned = re.sub(r'\s+[a-zA-Z]\.?\s*$', '', cleaned)
    
    return cleaned.strip()


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


def get_extended_prevalence_score(pattern: str, company_size_key: str) -> int:
    """Get extended prevalence score for a pattern and company size."""
    pattern_data = EXTENDED_PREVALENCE_MAP.get(pattern, {})
    
    # Try company-specific score first, fall back to default
    if company_size_key != "default" and company_size_key in pattern_data:
        return pattern_data[company_size_key]
    
    return pattern_data.get("default", 0)


def generate_extended_email_permutations(
    first_name: str,
    last_name: str,
    domain: str,
    company_size: Optional[str] = None
) -> List[Dict[str, any]]:
    """
    Generate extended email permutations (17-32) with prevalence scores.
    These are only used as a fallback when all 16 primary patterns return invalid.
    Permutations are returned in company-size-specific order (highest prevalence first).
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

    # Extended patterns (17-32) - all possible patterns
    extended_patterns = {
        "lastnamefirstname": f"{last}{first}@{domain}",          # 17. {last}{first}
        "firstname.l": f"{first}.{l}@{domain}",                  # 18. {first}.{l}
        "l.firstname": f"{l}.{first}@{domain}",                  # 19. {l}.{first}
        "f-lastname": f"{f}-{last}@{domain}",                    # 20. {f}-{last}
        "l-firstname": f"{l}-{first}@{domain}",                  # 21. {l}-{first}
        "firstnamef": f"{first}{f}@{domain}",                    # 22. {first}{f}
        "lastnamel": f"{last}{l}@{domain}",                      # 23. {last}{l}
        "f.l": f"{f}.{l}@{domain}",                              # 24. {f}.{l}
        "f_l": f"{f}_{l}@{domain}",                              # 25. {f}_{l}
        "firstname-l": f"{first}-{l}@{domain}",                  # 26. {first}-{l}
        "lastname-l": f"{last}-{l}@{domain}",                    # 27. {last}-{l}
        "lf": f"{l}{f}@{domain}",                                # 28. {l}{f}
        "l_f": f"{l}_{f}@{domain}",                              # 29. {l}_{f}
        "l-f": f"{l}-{f}@{domain}",                              # 30. {l}-{f}
        "l.f": f"{l}.{f}@{domain}",                              # 31. {l}.{f}
        "flastname_l": f"{f}{last}_{l}@{domain}",                # 32. {f}{last}_{l}
    }

    # Get the pattern order for this company size
    pattern_order = EXTENDED_PATTERN_ORDER.get(company_size_key, EXTENDED_PATTERN_ORDER["default"])

    # Build permutations in the correct order for this company size
    permutations = []
    for pattern_name in pattern_order:
        email = extended_patterns.get(pattern_name)
        if email:
            score = get_extended_prevalence_score(pattern_name, company_size_key)
            permutations.append({
                "email": email,
                "pattern": pattern_name,
                "prevalence_score": score,
            })

    return permutations
