"""Stripe webhook signature verification edge cases."""

import hashlib
import hmac

from aquadata.api.webhook import SIGNATURE_TOLERANCE_SECONDS, verify_stripe_signature

SECRET = "whsec_unit_secret"  # noqa: S105 - test-only value
PAYLOAD = b'{"type":"checkout.session.completed"}'
NOW = 1_700_000_000


def _sign(payload: bytes, secret: str, timestamp: int) -> str:
    digest = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_valid_signature_accepted() -> None:
    header = _sign(PAYLOAD, SECRET, NOW)
    assert verify_stripe_signature(PAYLOAD, header, SECRET, now=NOW)


def test_wrong_secret_rejected() -> None:
    header = _sign(PAYLOAD, "whsec_other", NOW)
    assert not verify_stripe_signature(PAYLOAD, header, SECRET, now=NOW)


def test_tampered_payload_rejected() -> None:
    header = _sign(PAYLOAD, SECRET, NOW)
    assert not verify_stripe_signature(PAYLOAD + b" ", header, SECRET, now=NOW)


def test_stale_timestamp_rejected() -> None:
    stale = NOW - SIGNATURE_TOLERANCE_SECONDS - 1
    header = _sign(PAYLOAD, SECRET, stale)
    assert not verify_stripe_signature(PAYLOAD, header, SECRET, now=NOW)
    edge = NOW - SIGNATURE_TOLERANCE_SECONDS
    assert verify_stripe_signature(PAYLOAD, _sign(PAYLOAD, SECRET, edge), SECRET, now=NOW)


def test_malformed_headers_rejected() -> None:
    for header in ("", "v1=abc", "t=notanumber,v1=abc", f"t={NOW}", "junk"):
        assert not verify_stripe_signature(PAYLOAD, header, SECRET, now=NOW)


def test_multiple_v1_candidates_any_match_accepts() -> None:
    good = _sign(PAYLOAD, SECRET, NOW)
    digest = good.split("v1=")[1]
    header = f"t={NOW},v1={'0' * 64},v1={digest}"
    assert verify_stripe_signature(PAYLOAD, header, SECRET, now=NOW)
