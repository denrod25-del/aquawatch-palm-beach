"""API key generation and hashing.

Keys are ``ak_live_`` + 32 random hex chars (128 bits of entropy).
Only the SHA-256 hex digest is ever stored or logged; the raw key exists
in memory at issue time and in the client's hands, nowhere else.
"""

import hashlib
import hmac
import re
import secrets
from typing import Final

KEY_PREFIX: Final = "ak_live_"
_RANDOM_BYTES: Final = 16  # token_hex(16) -> 32 hex chars
_KEY_RE: Final = re.compile(r"ak_live_[0-9a-f]{32}", re.ASCII)
_HASH_RE: Final = re.compile(r"[0-9a-f]{64}", re.ASCII)


class KeyFormatError(ValueError):
    """Raised when a value is not a well-formed AquaData API key."""


def generate_api_key() -> str:
    """Return a fresh key. The caller must show it once and store only the hash."""
    key = KEY_PREFIX + secrets.token_hex(_RANDOM_BYTES)
    assert _KEY_RE.fullmatch(key) is not None
    return key


def is_well_formed_key(raw: object) -> bool:
    """Return True only for a str matching ak_live_ + 32 lowercase hex chars."""
    return isinstance(raw, str) and _KEY_RE.fullmatch(raw) is not None


def hash_api_key(raw_key: str) -> str:
    """SHA-256 hex digest of a well-formed key; rejects anything malformed.

    Rejecting first means garbage can never be hashed into a lookup that
    silently misses — a malformed credential is a 401 at the boundary.
    """
    if not is_well_formed_key(raw_key):
        raise KeyFormatError("value is not a well-formed API key")
    digest = hashlib.sha256(raw_key.encode("ascii")).hexdigest()
    assert _HASH_RE.fullmatch(digest) is not None
    return digest


def hashes_equal(stored_hash: str, candidate_hash: str) -> bool:
    """Constant-time comparison of two stored key hashes."""
    return hmac.compare_digest(stored_hash, candidate_hash)
