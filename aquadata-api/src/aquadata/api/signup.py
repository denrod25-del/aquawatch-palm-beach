"""Self-serve key signup. Free keys are issued instantly; paid tiers get a
Stripe Checkout link and the key activates via webhook/reconciliation later."""

import re
from typing import Any, Final

from fastapi import HTTPException

from aquadata.core.keys import generate_api_key, hash_api_key
from aquadata.db.queries import DbPool

_EMAIL_RE: Final = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", re.ASCII)
_MAX_EMAIL_LEN: Final = 254


def validate_email(raw: str) -> str:
    email = raw.strip().lower()
    if not email or len(email) > _MAX_EMAIL_LEN or _EMAIL_RE.fullmatch(email) is None:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_email", "detail": "A valid email address is required."},
        )
    return email


async def signup(pool: DbPool, email_raw: str, product_code: str) -> dict[str, Any]:
    email = validate_email(email_raw)
    product = await pool.fetchrow(
        "SELECT code, monthly_price_cents, active FROM api.products WHERE code = $1",
        product_code,
    )
    if product is None or not product["active"]:
        raise HTTPException(
            status_code=422,
            detail={"error": "unknown_product", "detail": f"No such tier: {product_code}."},
        )
    if product["monthly_price_cents"] > 0:
        # Paid checkout requires Stripe configuration; wired in the metering task.
        raise HTTPException(
            status_code=503,
            detail={
                "error": "checkout_unavailable",
                "detail": "Paid signup requires Stripe configuration. Use the free tier "
                "or contact support.",
            },
        )

    raw_key = generate_api_key()
    key_id = await pool.fetchval(
        """INSERT INTO api.keys (key_hash, product_code, email)
           VALUES ($1, $2, $3) RETURNING id::text""",
        hash_api_key(raw_key),
        product["code"],
        email,
    )
    assert isinstance(key_id, str)
    return {
        "key_id": key_id,
        "api_key": raw_key,
        "product_code": product["code"],
        "checkout_url": None,
        "note": "Store this key now — it is only stored hashed and cannot be shown again.",
    }
