"""
Robust full-name parser for the enrichment API.

Rules (user-specified):
1. Normalize input (trim, remove wrapping quotes, collapse spaces, title-case ALL CAPS).
2. Strip leading titles/honorifics.
3. Strip trailing suffixes.
4. Remove middle initials and middle names.
5. first_name = first valid person-name token.
6. last_name = last token (may be multi-part, see 7).
7. Multi-part surnames (e.g. "van zyl", "de la cruz") → collapsed: "vanzyl", "delacruz".
8. If not confidently splittable → raise ValueError.
"""
import re
from dataclasses import dataclass
from typing import Optional

HONORIFICS = {
    "dr", "mr", "mrs", "ms", "miss", "prof", "professor",
    "rev", "reverend", "sir", "madam", "lord", "lady",
    "capt", "captain", "sgt", "sergeant", "cpl", "corporal",
    "lt", "lieutenant", "col", "colonel", "gen", "general",
    "hon", "judge", "justice",
}

SUFFIXES = {
    "jr", "jr.", "sr", "sr.",
    "ii", "iii", "iv", "v",
    "phd", "ph.d", "ph.d.", "md", "m.d", "m.d.",
    "esq", "esq.",
    "cpa", "dds", "dvm",
}

SURNAME_PREFIXES = {
    "van", "von", "de", "del", "della", "di", "du", "la", "le", "el",
    "al", "bin", "ibn", "abu", "mac", "mc", "o'",
    "dos", "das", "da", "den", "der", "het", "ten", "ter",
    "op", "af",
}


@dataclass
class ParsedName:
    first_name: str
    last_name: str
    original: str


def _normalize(raw: str) -> str:
    s = raw.strip()
    s = s.strip("\"'`""''")
    s = re.sub(r"\s+", " ", s).strip()
    if s.isupper() and len(s) > 1:
        s = s.title()
    return s


def _strip_honorifics(tokens: list[str]) -> list[str]:
    while tokens and tokens[0].lower().rstrip(".") in HONORIFICS:
        tokens = tokens[1:]
    return tokens


def _strip_suffixes(tokens: list[str]) -> list[str]:
    while tokens and tokens[-1].lower().rstrip(",. ") in SUFFIXES:
        tokens = tokens[:-1]
    return tokens


def _is_middle_initial(token: str) -> bool:
    clean = token.rstrip(".")
    return len(clean) == 1 and clean.isalpha()


def parse_full_name(
    name: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
) -> ParsedName:
    """
    Parse a full name string into first_name + last_name.
    Accepts either `name` or `first_name`+`last_name` (the latter bypasses splitting).

    Raises ValueError if the name cannot be confidently split.
    """
    if first_name and last_name:
        fn = first_name.strip().lower()
        ln = last_name.strip().lower()
        if not fn or not ln:
            raise ValueError("first_name and last_name must be non-empty")
        return ParsedName(
            first_name=fn,
            last_name=ln,
            original=f"{first_name.strip()} {last_name.strip()}",
        )

    if not name or not name.strip():
        raise ValueError("name is required when first_name/last_name are not provided")

    original = name.strip()
    normalized = _normalize(original)
    tokens = normalized.split()
    tokens = _strip_honorifics(tokens)
    tokens = _strip_suffixes(tokens)

    if len(tokens) < 2:
        raise ValueError(f"Cannot split name into first/last: '{original}'")

    _first = tokens[0]
    remaining = tokens[1:]

    remaining = [t for t in remaining if not _is_middle_initial(t)]

    if not remaining:
        raise ValueError(f"Cannot split name into first/last after removing initials: '{original}'")

    surname_parts: list[str] = []
    i = 0
    while i < len(remaining):
        if remaining[i].lower() in SURNAME_PREFIXES and i < len(remaining) - 1:
            surname_parts.append(remaining[i].lower())
            i += 1
        elif surname_parts:
            surname_parts.append(remaining[i].lower())
            break
        else:
            i += 1

    if surname_parts:
        last = "".join(surname_parts)
    else:
        last = remaining[-1].lower()

    first = _first.lower()

    first = re.sub(r"[^a-z]", "", first)
    last = re.sub(r"[^a-z]", "", last)

    if not first or not last:
        raise ValueError(f"Name produced empty first or last: '{original}'")

    return ParsedName(first_name=first, last_name=last, original=original)
