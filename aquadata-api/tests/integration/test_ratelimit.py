"""Rate limiting against real Redis (test plan item 4)."""

import asyncio
import time
import uuid

import httpx
import redis.asyncio as aioredis

from aquadata.core.keys import generate_api_key, hash_api_key
from aquadata.db.queries import DbPool
from aquadata.services.ratelimit import RateLimiter


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


async def test_429_fires_at_limit_plus_one(redis_client: aioredis.Redis) -> None:
    limiter = RateLimiter(redis_client)
    key_id = f"test:{uuid.uuid4()}"
    for i in range(3):
        result = await limiter.check(key_id, limit=3, window_seconds=60, now_ms=_now_ms())
        assert result.allowed, f"request {i + 1} should pass"
    denied = await limiter.check(key_id, limit=3, window_seconds=60, now_ms=_now_ms())
    assert not denied.allowed
    assert denied.retry_after_seconds >= 1


async def test_window_resets(redis_client: aioredis.Redis) -> None:
    limiter = RateLimiter(redis_client)
    key_id = f"test:{uuid.uuid4()}"
    assert (await limiter.check(key_id, 1, 1, _now_ms())).allowed
    assert not (await limiter.check(key_id, 1, 1, _now_ms())).allowed
    await asyncio.sleep(1.1)
    assert (await limiter.check(key_id, 1, 1, _now_ms())).allowed


async def test_limits_are_per_key_not_shared(redis_client: aioredis.Redis) -> None:
    limiter = RateLimiter(redis_client)
    key_a, key_b = f"test:{uuid.uuid4()}", f"test:{uuid.uuid4()}"
    assert (await limiter.check(key_a, 1, 60, _now_ms())).allowed
    assert not (await limiter.check(key_a, 1, 60, _now_ms())).allowed
    assert (await limiter.check(key_b, 1, 60, _now_ms())).allowed  # unaffected


async def _make_key_with_tiny_limit(db_pool: DbPool, limit: int) -> str:
    """Insert a throwaway product with a tiny daily limit plus one key on it."""
    code = f"tiny{uuid.uuid4().hex[:8]}"
    await db_pool.execute(
        """INSERT INTO api.products
           (code, name, monthly_price_cents, included_calls, limit_period, active)
           VALUES ($1, 'Test Tiny', 0, $2, 'day', true)""",
        code,
        limit,
    )
    raw_key = generate_api_key()
    await db_pool.execute(
        "INSERT INTO api.keys (key_hash, product_code, email) VALUES ($1, $2, $3)",
        hash_api_key(raw_key),
        code,
        "tiny@example.com",
    )
    return raw_key


async def test_endpoint_429_with_retry_after(
    api_client: httpx.AsyncClient, db_pool: DbPool
) -> None:
    raw_key = await _make_key_with_tiny_limit(db_pool, limit=3)
    for _ in range(3):
        ok = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": raw_key})
        assert ok.status_code == 200
    denied = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": raw_key})
    assert denied.status_code == 429
    assert denied.json()["error"] == "rate_limited"
    assert int(denied.headers["Retry-After"]) >= 1


async def test_endpoint_limits_are_per_key(
    api_client: httpx.AsyncClient, db_pool: DbPool
) -> None:
    """Exhausting one key must not affect another (same 'IP' in-process)."""
    key_a = await _make_key_with_tiny_limit(db_pool, limit=1)
    key_b = await _make_key_with_tiny_limit(db_pool, limit=1)
    assert (
        await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": key_a})
    ).status_code == 200
    assert (
        await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": key_a})
    ).status_code == 429
    assert (
        await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": key_b})
    ).status_code == 200
