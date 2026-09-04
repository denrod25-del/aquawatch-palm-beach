"""Self-serve key signup.

Free tier: key issued instantly, active. Paid tiers: key issued instantly
but ``suspended``, alongside a Stripe Checkout link — the webhook flips it
to ``active`` when checkout completes, and back to ``suspended`` if the
subscription is later cancelled.
"""

import re
from typing import Any, Final

import asyncpg
from fastapi import HTTPException

from aquadata.core.keys import generate_api_key, hash_api_key
from aquadata.db.queries import DbPool
from aquadata.services.stripe_checkout import CheckoutClient

_EMAIL_RE: Final = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", re.ASCII)
_MAX_EMAIL_LEN: Final = 254

_SHOW_ONCE_NOTE: Final = (
    "Store this key now — it is only stored hashed and cannot be shown again."
)


def validate_email(raw: str) -> str:
    email = raw.strip().lower()
    if not email or len(email) > _MAX_EMAIL_LEN or _EMAIL_RE.fullmatch(email) is None:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_email", "detail": "A valid email address is required."},
        )
    return email


async def _insert_key(pool: DbPool, raw_key: str, product_code: str, email: str,
                      status: str) -> str:
    key_id = await pool.fetchval(
        """INSERT INTO api.keys (key_hash, product_code, email, status)
           VALUES ($1, $2, $3, $4) RETURNING id::text""",
        hash_api_key(raw_key),
        product_code,
        email,
        status,
    )
    assert isinstance(key_id, str)
    return key_id


async def _paid_signup(
    pool: DbPool, checkout: CheckoutClient | None, product: Any, email: str
) -> dict[str, Any]:
    if checkout is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "checkout_unavailable",
                "detail": "Paid signup requires Stripe configuration (STRIPE_API_KEY, "
                "CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL). Use the free tier or "
                "contact support.",
            },
        )
    if product["stripe_price_id"] is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "checkout_unavailable",
                "detail": "Stripe prices are not provisioned for this tier yet — "
                "run `aquadata stripe-setup`.",
            },
        )
    raw_key = generate_api_key()
    key_id = await _insert_key(pool, raw_key, product["code"], email, status="suspended")
    checkout_url = await checkout.create_checkout(
        email, key_id, product["stripe_price_id"], product["stripe_overage_price_id"]
    )
    return {
        "key_id": key_id,
        "api_key": raw_key,
        "product_code": product["code"],
        "checkout_url": checkout_url,
        "note": f"{_SHOW_ONCE_NOTE} The key activates once checkout completes.",
    }


async def signup(
    pool: DbPool, checkout: CheckoutClient | None, email_raw: str, product_code: str
) -> dict[str, Any]:
    email = validate_email(email_raw)
    product = await pool.fetchrow(
        """SELECT code, monthly_price_cents, stripe_price_id, stripe_overage_price_id, active
           FROM api.products WHERE code = $1""",
        product_code,
    )
    if product is None or not product["active"]:
        raise HTTPException(
            status_code=422,
            detail={"error": "unknown_product", "detail": f"No such tier: {product_code}."},
        )
    if product["monthly_price_cents"] > 0:
        return await _paid_signup(pool, checkout, product, email)

    raw_key = generate_api_key()
    try:
        key_id = await _insert_key(pool, raw_key, product["code"], email, status="active")
    except asyncpg.UniqueViolationError as exc:
        # keys_one_active_free_per_email_idx: one active free key per email.
        raise HTTPException(
            status_code=409,
            detail={
                "error": "free_key_exists",
                "detail": "This email already has an active free key. Revoke it or "
                "upgrade to a paid tier for more capacity.",
            },
        ) from exc
    return {
        "key_id": key_id,
        "api_key": raw_key,
        "product_code": product["code"],
        "checkout_url": None,
        "note": _SHOW_ONCE_NOTE,
    }
