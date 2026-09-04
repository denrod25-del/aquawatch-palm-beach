"""Boundary validation for request inputs.

Strict tier: reject, never coerce. A ZIP is exactly five ASCII digits —
leading zeros preserved, ZIP+4 rejected, no trimming, no int round-trips.
"""

import re
from typing import Final

# re.ASCII: bare \d would also match unicode digits (e.g. full-width or
# arabic-indic), which must be rejected at the boundary.
_ZIP_RE: Final = re.compile(r"\d{5}", re.ASCII)


class ZipValidationError(ValueError):
    """Raised when input is not a structurally valid 5-digit ZIP code."""


def is_valid_zip(raw: object) -> bool:
    """Return True only for a str of exactly five ASCII digits."""
    return isinstance(raw, str) and _ZIP_RE.fullmatch(raw) is not None


def validate_zip(raw: object) -> str:
    """Return the ZIP unchanged, or raise ZipValidationError.

    Never mutates the input: callers receive exactly what passed the check,
    so leading zeros survive and nothing is silently trimmed.
    """
    if not is_valid_zip(raw):
        raise ZipValidationError(
            "zip must be exactly 5 ASCII digits (e.g. '33411'); ZIP+4 is not accepted"
        )
    assert isinstance(raw, str)  # narrowed by is_valid_zip
    return raw
