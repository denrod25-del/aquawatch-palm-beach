"""stripe-setup provisioning: meter, products, prices, DB write-back, idempotency."""

from aquadata.db.queries import DbPool
from aquadata.services.stripe_setup import METER_EVENT_NAME, run_setup


class FakeSetupClient:
    """Deterministic ids; counts creations so idempotency is observable."""

    def __init__(self) -> None:
        self.meter_calls = 0
        self.flat_price_calls: list[tuple[str, int]] = []
        self.metered_price_calls: list[tuple[str, str, int]] = []
        self.products: dict[str, str] = {}

    async def ensure_meter(self, event_name: str) -> str:
        assert event_name == METER_EVENT_NAME
        self.meter_calls += 1
        return "mtr_fake1"

    async def ensure_product(self, code: str, name: str) -> str:
        assert name
        return self.products.setdefault(code, f"prod_{code}")

    async def ensure_flat_price(self, product_id: str, monthly_cents: int) -> str:
        self.flat_price_calls.append((product_id, monthly_cents))
        return f"price_flat_{product_id}"

    async def ensure_metered_price(
        self, product_id: str, meter_id: str, micro_usd_per_call: int, included_calls: int
    ) -> str:
        assert meter_id == "mtr_fake1"
        self.metered_price_calls.append((product_id, micro_usd_per_call, included_calls))
        return f"price_over_{product_id}"


async def _clear_price_ids(db_pool: DbPool) -> None:
    await db_pool.execute(
        "UPDATE api.products SET stripe_price_id = NULL, stripe_overage_price_id = NULL"
        " WHERE code IN ('starter', 'pro')"
    )


async def test_setup_provisions_paid_tiers_and_stores_ids(db_pool: DbPool) -> None:
    await _clear_price_ids(db_pool)
    client = FakeSetupClient()
    result = await run_setup(db_pool, client)

    assert result.meter_id == "mtr_fake1"
    assert {t.code for t in result.tiers} == {"starter", "pro"}
    # Approved pricing flows from DB rows into Stripe: $19/$49 flat, 2000 micro-USD
    # overage with the tier's included allowance free (graduated tiers).
    assert sorted(c for _, c in client.flat_price_calls) == [1900, 4900]
    assert sorted((m, inc) for _, m, inc in client.metered_price_calls) == [
        (2000, 5000),   # starter: first 5k calls covered by the flat fee
        (2000, 50000),  # pro: first 50k calls covered by the flat fee
    ]

    rows = await db_pool.fetch(
        """SELECT code, stripe_price_id, stripe_overage_price_id
           FROM api.products WHERE code IN ('starter', 'pro') ORDER BY code"""
    )
    for row in rows:
        assert row["stripe_price_id"] == f"price_flat_prod_{row['code']}"
        assert row["stripe_overage_price_id"] == f"price_over_prod_{row['code']}"


async def test_setup_is_idempotent_via_stored_ids(db_pool: DbPool) -> None:
    await _clear_price_ids(db_pool)
    client = FakeSetupClient()
    await run_setup(db_pool, client)
    first_flat, first_metered = len(client.flat_price_calls), len(client.metered_price_calls)

    again = await run_setup(db_pool, client)
    assert len(client.flat_price_calls) == first_flat  # stored ids short-circuit creation
    assert len(client.metered_price_calls) == first_metered
    assert {t.code for t in again.tiers} == {"starter", "pro"}


async def test_setup_never_touches_free_tier(db_pool: DbPool) -> None:
    await run_setup(db_pool, FakeSetupClient())
    free = await db_pool.fetchrow(
        "SELECT stripe_price_id, stripe_overage_price_id FROM api.products WHERE code='free'"
    )
    assert free is not None
    assert free["stripe_price_id"] is None
    assert free["stripe_overage_price_id"] is None
