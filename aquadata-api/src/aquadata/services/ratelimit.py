"""Sliding-window rate limiting in Redis, atomic via a Lua script.

Limits are per API key (never per IP). Free tier is a 24h window; paid tiers
use a 30-day sliding window. The check-and-add is a single EVAL so two
concurrent requests can never both slip under the limit.
"""

import uuid
from dataclasses import dataclass
from typing import Final

import redis.asyncio as aioredis

WINDOW_SECONDS: Final[dict[str, int]] = {
    "day": 24 * 3600,
    "month": 30 * 24 * 3600,
}

_SLIDING_WINDOW_LUA: Final = """
local cutoff = tonumber(ARGV[1]) - tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return {1, tonumber(ARGV[3]) - count - 1, 0}
end
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
local retry_ms = 0
if oldest[2] then
  retry_ms = math.floor(tonumber(oldest[2]) + tonumber(ARGV[2]) - tonumber(ARGV[1]))
end
return {0, 0, retry_ms}
"""


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_seconds: int


class RateLimiter:
    def __init__(self, client: aioredis.Redis) -> None:
        self._client = client
        self._script = client.register_script(_SLIDING_WINDOW_LUA)

    async def check(
        self, key_id: str, limit: int, window_seconds: int, now_ms: int
    ) -> RateLimitResult:
        """Consume one slot for key_id if under limit; atomic in Redis."""
        assert limit > 0 and window_seconds > 0 and now_ms > 0
        member = f"{now_ms}:{uuid.uuid4().hex[:12]}"
        raw = await self._script(
            keys=[f"rl:{key_id}"],
            args=[now_ms, window_seconds * 1000, limit, member],
        )
        assert isinstance(raw, list) and len(raw) == 3  # noqa: PLR2004 - lua returns a triple
        allowed, remaining, retry_ms = (int(v) for v in raw)
        # Ceil to whole seconds so Retry-After never tells clients to come back early.
        retry_after = (retry_ms + 999) // 1000 if not allowed else 0
        return RateLimitResult(
            allowed=bool(allowed),
            remaining=remaining,
            retry_after_seconds=max(retry_after, 1) if not allowed else 0,
        )
