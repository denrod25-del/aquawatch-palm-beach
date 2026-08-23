"""Stripe webhook: signature verification + key lifecycle transitions.

- ``checkout.session.completed``   -> activate the suspended key created at
  signup (matched by client_reference_id) and store customer/subscription.
- ``customer.subscription.deleted`` -> suspend every key on that customer.

Signature scheme is Stripe's documented v1: HMAC-SHA256 over
``"{t}.{raw_body}"`` with the endpoint secret, compared constant-time,
with a timestamp tolerance to stop replay.
"""

import hashlib
import hmac
import json
import logging
import time
from typing import Any, Final

from aquadata.db.queries import DbPool

logger = logging.getLogger("aquadata.webhook")

SIGNATURE_TOLERANCE_SECONDS: Final = 300


def verify_stripe_signature(
    payload: bytes, signature_header: str, secret: str, now: int | None = None
) -> bool:
    """True only for a well-formed, in-tolerance, matching v1 signature."""
    timestamp: str | None = None
    candidates: list[str] = []
    for part in signature_header.split(","):
        name, _, value = part.strip().partition("=")
        if name == "t" and value.isdigit():
            timestamp = value
        elif name == "v1" and value:
            candidates.append(value)
    if timestamp is None or not candidates:
        return False
    current = int(time.time()) if now is None else now
    if abs(current - int(timestamp)) > SIGNATURE_TOLERANCE_SECONDS:
        return False
    signed = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, candidate) for candidate in candidates)


async def _activate_key(pool: DbPool, obj: dict[str, Any]) -> bool:
    key_id = obj.get("client_reference_id")
    customer = obj.get("customer")
    subscription = obj.get("subscription")
    if not isinstance(key_id, str) or not isinstance(customer, str):
        logger.warning("checkout.session.completed without key/customer reference")
        return False
    result = await pool.execute(
        """UPDATE api.keys
           SET status = 'active', stripe_customer_id = $2, stripe_subscription_id = $3
           WHERE id = $1::uuid AND status = 'suspended'""",
        key_id,
        customer,
        subscription if isinstance(subscription, str) else None,
    )
    activated = result.endswith("1")
    if activated:
        logger.info("activated key after checkout", extra={"extra_fields": {"key_id": key_id}})
    return activated


async def _suspend_customer_keys(pool: DbPool, obj: dict[str, Any]) -> bool:
    customer = obj.get("customer")
    if not isinstance(customer, str):
        return False
    result = await pool.execute(
        """UPDATE api.keys SET status = 'suspended'
           WHERE stripe_customer_id = $1 AND status = 'active'""",
        customer,
    )
    logger.info(
        "subscription ended; keys suspended",
        extra={"extra_fields": {"update_result": result}},
    )
    return not result.endswith(" 0")


async def handle_stripe_event(pool: DbPool, payload: bytes) -> bool:
    """Apply one verified event; returns True if any key changed state."""
    event = json.loads(payload)
    if not isinstance(event, dict):
        return False
    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})
    if not isinstance(obj, dict):
        return False
    if event_type == "checkout.session.completed":
        return await _activate_key(pool, obj)
    if event_type == "customer.subscription.deleted":
        return await _suspend_customer_keys(pool, obj)
    return False  # other events are acknowledged and ignored
