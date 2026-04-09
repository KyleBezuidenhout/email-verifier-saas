import re

_BAD_UNICODE_RE = re.compile(r'[\x00\uFFFE\uFFFF]|[\uD800-\uDFFF]')
MAX_EXTRA_VALUE_LEN = 10_000


def sanitize_text(val: str, max_len: int = MAX_EXTRA_VALUE_LEN) -> str:
    """Strip characters that break PostgreSQL jsonb/text storage and cap length."""
    s = str(val).strip()
    s = _BAD_UNICODE_RE.sub('', s)
    if len(s) > max_len:
        s = s[:max_len]
    return s
