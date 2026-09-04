"""ZIP validation edge cases (test plan item 1).

Strict boundary rule: exactly five ASCII digits, no coercion, no trimming.
"""

import pytest

from aquadata.core.validation import ZipValidationError, is_valid_zip, validate_zip

VALID_ZIPS = [
    "33411",  # Palm Beach County
    "00501",  # leading zeros (Holtsville NY) must survive
    "00000",  # structurally valid even if unassigned
    "99950",  # highest assigned ZIP
]

INVALID_ZIPS = [
    "3341",  # 4 digits
    "334115",  # 6 digits
    "3341a",  # alpha
    "abcde",  # all alpha
    "33411-1234",  # ZIP+4 must be rejected, not truncated
    "33411-",  # trailing hyphen
    " 33411",  # leading whitespace — no trimming
    "33411 ",  # trailing whitespace — no trimming
    "33 411",  # interior whitespace
    "",  # empty
    "３３４１１",  # full-width unicode digits — ASCII only
    "٣٣٤١١",  # arabic-indic digits — ASCII only
    "+3341",  # sign
    "33.41",  # decimal
]


@pytest.mark.parametrize("zip_code", VALID_ZIPS)
def test_valid_zips_accepted(zip_code: str) -> None:
    assert is_valid_zip(zip_code)
    assert validate_zip(zip_code) == zip_code


@pytest.mark.parametrize("zip_code", INVALID_ZIPS)
def test_invalid_zips_rejected(zip_code: str) -> None:
    assert not is_valid_zip(zip_code)
    with pytest.raises(ZipValidationError):
        validate_zip(zip_code)


@pytest.mark.parametrize("bad_type", [33411, 33411.0, None, ["33411"], b"33411"])
def test_non_string_input_rejected(bad_type: object) -> None:
    """Reject, don't coerce: ints and bytes never become ZIPs."""
    assert not is_valid_zip(bad_type)
    with pytest.raises(ZipValidationError):
        validate_zip(bad_type)


def test_validate_zip_returns_same_object_unmodified() -> None:
    raw = "00501"
    assert validate_zip(raw) is raw
