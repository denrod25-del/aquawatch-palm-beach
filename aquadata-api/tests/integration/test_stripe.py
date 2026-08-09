"""Stripe metering: batching, idempotency under double-fire, reconciliation
replay (test plan item 3). Real Postgres; Stripe replaced by a fake client."""

import uuid

from aquadata.core.keys import generate_api_key, hash_api_key
from aquadata.db.queries import DbPool
from aquadata.services.stripe_meter import StripeMeter


class FakeMeterClient:
    """Records sends; can simulate outages. Dedupes on idempotency key the
    way Stripe's meter-event `identifier` does."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, int, str]] = []
        self.fail_next = 0

    async def send_usage(
        self, stripe_customer_id: str, quantity: int, idempotency_key: str
    ) -> None:
        if self.fail_next > 0:
            self.fail_next -= 1
            raise RuntimeError("simulated stripe outage")
        self.calls.append((stripe_customer_id, quantity, idempotency_key))

    def unique_keys(self) -> set[str]:
        return {c[2] for c in self.calls}


async def _make_paid_key(db_pool: DbPool) -> tuple[str, str]:
    """Starter-tier key with a Stripe customer attached; returns (key_id, cus)."""
    customer = f"cus_{uuid.uuid4().hex[:14]}"
    key_id = await db_pool.fetchval(
        """INSERT INTO api.keys (key_hash, product_code, email, stripe_customer_id)
           VALUES ($1, 'starter', 'paid@example.com', $2) RETURNING id::text""",
        hash_api_key(generate_api_key()),
        customer,
    )
    return str(key_id), customer


async def _insert_usage(db_pool: DbPool, key_id: str, count: int) -> None:
    for _ in range(count):
        await db_pool.execute(
            """INSERT INTO api.usage (key_id, endpoint, zip, status, latency_ms)
               VALUES ($1::uuid, '/v1/water-quality/{zip_code}', '33401', 200, 12)""",
            key_id,
        )


async def _report_rows(db_pool: DbPool, key_id: str) -> list[object]:
    return await db_pool.fetch(
        "SELECT * FROM api.stripe_reports WHERE key_id = $1::uuid ORDER BY id", key_id
    )


async def test_batch_collects_and_sends_once(db_pool: DbPool) -> None:
    key_id, customer = await _make_paid_key(db_pool)
    await _insert_usage(db_pool, key_id, 3)
    fake = FakeMeterClient()
    meter = StripeMeter(db_pool, fake)

    result = await meter.run_once()
    assert result.sent == 1 and result.failed == 0
    assert fake.calls == [(customer, 3, fake.calls[0][2])]

    unmarked = await db_pool.fetchval(
        "SELECT count(*) FROM api.usage WHERE key_id = $1::uuid AND stripe_reported_at IS NULL",
        key_id,
    )
    assert unmarked == 0
    reports = await _report_rows(db_pool, key_id)
    assert len(reports) == 1
    assert reports[0]["status"] == "sent" and reports[0]["quantity"] == 3


async def test_double_fire_is_idempotent(db_pool: DbPool) -> None:
    key_id, _ = await _make_paid_key(db_pool)
    await _insert_usage(db_pool, key_id, 2)
    fake = FakeMeterClient()
    meter = StripeMeter(db_pool, fake)

    first = await meter.run_once()
    second = await meter.run_once()  # double-fire: nothing left to claim
    assert first.sent == 1
    assert second.sent == 0 and second.failed == 0
    assert len(await _report_rows(db_pool, key_id)) == 1
    assert len(fake.unique_keys()) == 1


async def test_outage_then_reconciliation_replay(db_pool: DbPool) -> None:
    key_id, customer = await _make_paid_key(db_pool)
    await _insert_usage(db_pool, key_id, 5)
    fake = FakeMeterClient()
    fake.fail_next = 1
    meter = StripeMeter(db_pool, fake)

    down = await meter.run_once()
    assert down.sent == 0 and down.failed == 1
    (report,) = await _report_rows(db_pool, key_id)
    assert report["status"] == "failed" and report["attempts"] == 1
    assert "simulated stripe outage" in report["last_error"]

    # Clear the backoff clock, then reconcile: same idempotency key goes out.
    await db_pool.execute(
        "UPDATE api.stripe_reports SET last_attempt_at = now() - interval '1 hour'"
        " WHERE key_id = $1::uuid",
        key_id,
    )
    replay = await meter.run_once()
    assert replay.sent == 1 and replay.failed == 0
    (report_after,) = await _report_rows(db_pool, key_id)
    assert report_after["status"] == "sent"
    assert fake.calls == [(customer, 5, report["idempotency_key"])]


async def test_free_tier_usage_is_never_reported(db_pool: DbPool) -> None:
    free_key_id = await db_pool.fetchval(
        """INSERT INTO api.keys (key_hash, product_code, email)
           VALUES ($1, 'free', 'free@example.com') RETURNING id::text""",
        hash_api_key(generate_api_key()),
    )
    await _insert_usage(db_pool, str(free_key_id), 4)
    fake = FakeMeterClient()
    meter = StripeMeter(db_pool, fake)

    await meter.run_once()
    assert await _report_rows(db_pool, str(free_key_id)) == []
    untouched = await db_pool.fetchval(
        "SELECT count(*) FROM api.usage"
        " WHERE key_id = $1::uuid AND stripe_reported_at IS NULL",
        free_key_id,
    )
    assert untouched == 4
