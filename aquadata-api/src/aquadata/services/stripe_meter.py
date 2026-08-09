"""Stripe metered-billing batcher and reconciliation.

Billing integrity never depends on Stripe uptime:

1. ``collect``   — one atomic SQL statement moves unreported billable usage
   into ``api.stripe_reports`` with a deterministic idempotency key derived
   from the usage row-id span. Double-fires find nothing left to claim
   (``FOR UPDATE SKIP LOCKED`` + the NULL filter), so a batch is created
   exactly once.
2. ``push_pending`` — sends pending/failed reports to Stripe with the stored
   idempotency key and exponential backoff. Failures stay in the table with
   the error recorded; nothing is dropped.
3. Reconciliation  — ``run_once`` (collect + push) replayed any time, from
   the 60s loop, the CLI, or cron after an outage.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Final, Protocol

from aquadata.db.queries import DbPool

logger = logging.getLogger("aquadata.stripe")

MAX_ATTEMPTS: Final = 10
_BACKOFF_CAP_SECONDS: Final = 3600

_COLLECT_SQL: Final = """
WITH candidate AS (
    SELECT u.id, u.ts, u.key_id
    FROM api.usage u
    JOIN api.keys k ON k.id = u.key_id
    JOIN api.products p ON p.code = k.product_code
    WHERE u.stripe_reported_at IS NULL
      AND p.monthly_price_cents > 0
      AND k.stripe_customer_id IS NOT NULL
    FOR UPDATE OF u SKIP LOCKED
),
marked AS (
    UPDATE api.usage u SET stripe_reported_at = now()
    FROM candidate c WHERE u.id = c.id AND u.ts = c.ts
    RETURNING u.key_id, u.id, u.ts
)
INSERT INTO api.stripe_reports (idempotency_key, key_id, window_start, window_end, quantity)
SELECT key_id::text || ':' || min(id) || '-' || max(id),
       key_id, min(ts), max(ts) + interval '1 microsecond', count(*)
FROM marked GROUP BY key_id
RETURNING id
"""

_PENDING_SQL: Final = """
SELECT r.id, r.idempotency_key, r.quantity, k.stripe_customer_id
FROM api.stripe_reports r
JOIN api.keys k ON k.id = r.key_id
WHERE r.status IN ('pending', 'failed')
  AND r.attempts < $1
  AND (r.last_attempt_at IS NULL
       OR r.last_attempt_at
          + make_interval(secs => least($2, power(2, r.attempts))) <= now())
ORDER BY r.id
"""


class MeterClient(Protocol):
    """The one Stripe operation we need; swapped for a fake in tests."""

    async def send_usage(
        self, stripe_customer_id: str, quantity: int, idempotency_key: str
    ) -> None: ...


@dataclass(frozen=True)
class PushResult:
    sent: int
    failed: int


class StripeMeter:
    def __init__(self, pool: DbPool, client: MeterClient) -> None:
        self._pool = pool
        self._client = client

    async def collect(self) -> int:
        """Stage unreported paid usage into reports; returns new report count."""
        rows = await self._pool.fetch(_COLLECT_SQL)
        if rows:
            logger.info("staged %d stripe report(s)", len(rows))
        return len(rows)

    async def push_pending(self) -> PushResult:
        """Send due pending/failed reports; each outcome is persisted."""
        reports = await self._pool.fetch(_PENDING_SQL, MAX_ATTEMPTS, _BACKOFF_CAP_SECONDS)
        sent = failed = 0
        for report in reports:
            try:
                await self._client.send_usage(
                    report["stripe_customer_id"],
                    int(report["quantity"]),
                    report["idempotency_key"],
                )
            except Exception as exc:  # noqa: BLE001 - failure is a tracked outcome
                failed += 1
                await self._pool.execute(
                    """UPDATE api.stripe_reports
                       SET status = 'failed', attempts = attempts + 1,
                           last_attempt_at = now(), last_error = $2
                       WHERE id = $1""",
                    report["id"],
                    str(exc)[:500],
                )
            else:
                sent += 1
                await self._pool.execute(
                    """UPDATE api.stripe_reports
                       SET status = 'sent', attempts = attempts + 1,
                           last_attempt_at = now(), sent_at = now(), last_error = NULL
                       WHERE id = $1""",
                    report["id"],
                )
        if sent or failed:
            logger.info("stripe push: %d sent, %d failed", sent, failed)
        return PushResult(sent=sent, failed=failed)

    async def run_once(self) -> PushResult:
        """One batch cycle; also the reconciliation entry point."""
        await self.collect()
        return await self.push_pending()

    async def run_forever(self, interval_seconds: int) -> None:
        assert interval_seconds > 0
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("stripe batch cycle failed; retrying next interval")
            await asyncio.sleep(interval_seconds)


class StripeMeterEventClient:
    """Real client: Stripe Billing Meter Events (sync SDK via thread offload)."""

    def __init__(self, api_key: str, event_name: str = "aquadata_api_call") -> None:
        assert api_key
        self._api_key = api_key
        self._event_name = event_name

    async def send_usage(
        self, stripe_customer_id: str, quantity: int, idempotency_key: str
    ) -> None:
        # Deferred so the fake-client test path never imports the SDK.
        import stripe  # noqa: PLC0415

        def _send() -> None:
            client = stripe.StripeClient(self._api_key)
            client.billing.meter_events.create(
                params={
                    "event_name": self._event_name,
                    "identifier": idempotency_key,
                    "payload": {
                        "stripe_customer_id": stripe_customer_id,
                        "value": str(quantity),
                    },
                }
            )

        await asyncio.to_thread(_send)
