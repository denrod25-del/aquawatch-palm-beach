"""Auth + rate-limit dependency. Raw keys are hashed immediately, never logged."""

import time
from dataclasses import dataclass

from fastapi import HTTPException, Request

from aquadata.core.keys import hash_api_key, is_well_formed_key
from aquadata.services.ratelimit import WINDOW_SECONDS, RateLimiter

_INVALID_KEY = HTTPException(
    status_code=401, detail={"error": "invalid_api_key", "detail": "Unknown or malformed API key."}
)


@dataclass(frozen=True)
class KeyContext:
    key_id: str
    product_code: str
    included_calls: int
    limit_period: str


async def require_api_key(request: Request) -> KeyContext:
    """Authenticate via X-API-Key, then enforce the tier's sliding-window limit."""
    raw = request.headers.get("X-API-Key")
    if raw is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "missing_api_key", "detail": "Pass your key in the X-API-Key header."},
        )
    if not is_well_formed_key(raw):
        raise _INVALID_KEY

    pool = request.app.state.pool
    row = await pool.fetchrow(
        """SELECT k.id::text AS key_id, k.status, k.product_code,
                  p.included_calls, p.limit_period, p.active AS product_active
           FROM api.keys k JOIN api.products p ON p.code = k.product_code
           WHERE k.key_hash = $1""",
        hash_api_key(raw),
    )
    if row is None:
        raise _INVALID_KEY
    if row["status"] != "active" or not row["product_active"]:
        raise HTTPException(
            status_code=403,
            detail={"error": "key_inactive", "detail": f"API key is {row['status']}."},
        )

    limiter: RateLimiter = request.app.state.limiter
    window = WINDOW_SECONDS[row["limit_period"]]
    result = await limiter.check(
        row["key_id"], row["included_calls"], window, now_ms=time.time_ns() // 1_000_000
    )
    if not result.allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limited",
                "detail": f"{row['included_calls']} calls per {row['limit_period']} exceeded.",
            },
            headers={"Retry-After": str(result.retry_after_seconds)},
        )

    context = KeyContext(
        key_id=row["key_id"],
        product_code=row["product_code"],
        included_calls=row["included_calls"],
        limit_period=row["limit_period"],
    )
    request.state.key_context = context
    return context
