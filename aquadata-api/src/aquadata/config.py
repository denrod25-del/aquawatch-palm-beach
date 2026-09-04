"""Environment configuration. Validated at startup; reject, don't default silently.

Only DATABASE_URL and REDIS_URL are required. Stripe is optional: without a
key the metering loop parks usage rows for later reconciliation instead of
dropping them.
"""

import os
from dataclasses import dataclass
from typing import Final

_ALLOWED_DB_SCHEMES: Final = ("postgres://", "postgresql://")


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or malformed."""


@dataclass(frozen=True)
class Settings:
    database_url: str
    redis_url: str
    stripe_api_key: str | None
    cache_ttl_seconds: int
    stripe_batch_seconds: int
    stripe_webhook_secret: str | None = None
    checkout_success_url: str | None = None
    checkout_cancel_url: str | None = None


def _require(env: dict[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} is required and not set")
    return value


def _positive_int(env: dict[str, str], name: str, default: int) -> int:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    if not raw.isdigit() or int(raw) <= 0:
        raise ConfigError(f"{name} must be a positive integer, got {raw!r}")
    return int(raw)


def load_settings(env: dict[str, str] | None = None) -> Settings:
    """Build Settings from the given mapping (defaults to os.environ)."""
    src = dict(os.environ) if env is None else env
    database_url = _require(src, "DATABASE_URL")
    if not database_url.startswith(_ALLOWED_DB_SCHEMES):
        raise ConfigError("DATABASE_URL must be a postgres:// or postgresql:// URL")
    redis_url = _require(src, "REDIS_URL")
    if not redis_url.startswith("redis://"):
        raise ConfigError("REDIS_URL must be a redis:// URL")
    stripe_key = src.get("STRIPE_API_KEY", "").strip() or None
    success_url = src.get("CHECKOUT_SUCCESS_URL", "").strip() or None
    cancel_url = src.get("CHECKOUT_CANCEL_URL", "").strip() or None
    for name, url in (("CHECKOUT_SUCCESS_URL", success_url), ("CHECKOUT_CANCEL_URL", cancel_url)):
        if url is not None and not url.startswith("https://"):
            raise ConfigError(f"{name} must be an https:// URL")
    return Settings(
        database_url=database_url,
        redis_url=redis_url,
        stripe_api_key=stripe_key,
        cache_ttl_seconds=_positive_int(src, "CACHE_TTL_SECONDS", 24 * 3600),
        stripe_batch_seconds=_positive_int(src, "STRIPE_BATCH_SECONDS", 60),
        stripe_webhook_secret=src.get("STRIPE_WEBHOOK_SECRET", "").strip() or None,
        checkout_success_url=success_url,
        checkout_cancel_url=cancel_url,
    )
