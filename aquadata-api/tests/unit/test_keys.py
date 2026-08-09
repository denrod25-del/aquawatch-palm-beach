"""API key generation + hashing round-trip (test plan item 1)."""

import hashlib
import re

import pytest

from aquadata.core.keys import (
    KEY_PREFIX,
    KeyFormatError,
    generate_api_key,
    hash_api_key,
    hashes_equal,
    is_well_formed_key,
)


def test_generated_key_shape() -> None:
    key = generate_api_key()
    assert re.fullmatch(r"ak_live_[0-9a-f]{32}", key)
    assert key.startswith(KEY_PREFIX)


def test_generated_keys_are_unique() -> None:
    keys = {generate_api_key() for _ in range(256)}
    assert len(keys) == 256


def test_hash_round_trip() -> None:
    """generate -> hash -> stored hash matches recomputed hash of same key."""
    key = generate_api_key()
    stored = hash_api_key(key)
    assert stored == hash_api_key(key)
    assert hashes_equal(stored, hash_api_key(key))


def test_hash_is_sha256_hex_of_full_key() -> None:
    key = "ak_live_" + "ab" * 16
    expected = hashlib.sha256(key.encode("ascii")).hexdigest()
    assert hash_api_key(key) == expected
    assert re.fullmatch(r"[0-9a-f]{64}", hash_api_key(key))


def test_different_keys_hash_differently() -> None:
    a, b = generate_api_key(), generate_api_key()
    assert a != b
    assert hash_api_key(a) != hash_api_key(b)
    assert not hashes_equal(hash_api_key(a), hash_api_key(b))


@pytest.mark.parametrize(
    "bad_key",
    [
        "",
        "ak_live_",  # no hex
        "ak_live_" + "a" * 31,  # too short
        "ak_live_" + "a" * 33,  # too long
        "ak_live_" + "G" * 32,  # non-hex
        "ak_live_" + "A" * 32,  # uppercase hex not emitted by generator
        "ak_test_" + "a" * 32,  # wrong prefix
        "a" * 40,  # no prefix
        "ak_live_" + "ａ" * 32,  # full-width unicode
    ],
)
def test_malformed_keys_rejected(bad_key: str) -> None:
    assert not is_well_formed_key(bad_key)
    with pytest.raises(KeyFormatError):
        hash_api_key(bad_key)


@pytest.mark.parametrize("bad_type", [None, 123, b"ak_live_" + b"a" * 32])
def test_non_string_keys_rejected(bad_type: object) -> None:
    assert not is_well_formed_key(bad_type)
    with pytest.raises(KeyFormatError):
        hash_api_key(bad_type)  # type: ignore[arg-type]
