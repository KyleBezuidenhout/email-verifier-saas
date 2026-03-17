from typing import List, Dict, Optional
import unicodedata
import re

# =============================================================================
# 8 FIXED EMAIL PATTERNS (Ranked by Prevalence)
# =============================================================================
# Based on analysis of 20,000 verified valid emails, these 8 patterns cover
# 99.78% of all valid email addresses across all company sizes.
#
# The remaining 24 patterns from the old 32-pattern system collectively cover
# less than 0.22% of valid emails with elevated catch-all false positive risk.
#
# Patterns are verified in this exact order with early-exit on valid/catchall.
# =============================================================================

PATTERNS = [
    # Pattern 1: firstname (41.63% coverage)
    # Highest-yield pattern. Dominant in small companies (1-50 employees: 71.48%)
    # where first-name collisions are rare.
    {"name": "firstname", "format": "{first}"},
    
    # Pattern 2: flastname (21.38% raw, 14.55% weighted)
    # Dominant in mid-market (51-500 employees) where disambiguation is needed.
    # First initial + last name is the natural response to first-name collisions.
    {"name": "flastname", "format": "{f}{last}"},
    
    # Pattern 3: firstname.lastname (enterprise standard)
    # Dominant at 1,001+ employees (48-56% at enterprise scale).
    # Critical for completeness - enterprise contacts depend on this pattern.
    {"name": "firstname.lastname", "format": "{first}.{last}"},
    
    # Pattern 4: firstnamel (3.17%)
    # Full first name + last initial. Common in mid-sized businesses (11-500).
    {"name": "firstnamel", "format": "{first}{l}"},
    
    # Pattern 5: firstnamelastname (2.06%)
    # No separator - common in early-stage tech companies and consumer brands.
    # Low catch-all false positive risk due to absence of separator.
    {"name": "firstnamelastname", "format": "{first}{last}"},
    
    # Pattern 6: lastname (1.05%)
    # Rare overall but concentrated in professional services (law, accounting)
    # and European companies. High-value senior decision-makers.
    {"name": "lastname", "format": "{last}"},
    
    # Pattern 7: fl (0.85%)
    # Bare initials - legacy convention from older enterprise IT systems.
    # Low marginal cost due to early-exit logic (only probed on prior misses).
    {"name": "fl", "format": "{f}{l}"},
    
    # Pattern 8: f.lastname (0.77%)
    # First initial + dot + last name. Punches above weight in 1,000-5,000 range.
    # Final default pattern - meaningful enterprise yield at negligible cost.
    {"name": "f.lastname", "format": "{f}.{last}"},
]


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


def generate_email_permutations(
    first_name: str,
    last_name: str,
    domain: str,
    company_size: Optional[str] = None  # Kept for backward compatibility, ignored
) -> List[Dict[str, any]]:
    """
    Generate 8 email permutations in fixed prevalence order.
    
    Permutations are returned in ranked order (highest prevalence first).
    Early exit on VALID, verify all 8 if catchall found.
    
    Args:
        first_name: Person's first name
        last_name: Person's last name
        domain: Company domain (e.g., "company.com")
        company_size: DEPRECATED - ignored, kept for backward compatibility
    
    Returns:
        List of dicts with keys: email, pattern, prevalence_score
    """
    first = normalize_name(first_name)
    last = normalize_name(last_name)
    domain = normalize_domain(domain)

    if not first or not last or not domain:
        return []

    # First initial and last initial
    f = first[0]
    l = last[0]

    # Generate all 8 patterns in fixed order
    permutations = []
    for rank, pattern in enumerate(PATTERNS, start=1):
        # Build email from pattern format
        email_local = pattern["format"].format(first=first, last=last, f=f, l=l)
        email = f"{email_local}@{domain}"
        
        permutations.append({
            "email": email,
            "pattern": pattern["name"],
            "prevalence_score": 100 - rank,  # Higher score = higher prevalence (99, 98, 97...)
        })

    return permutations
