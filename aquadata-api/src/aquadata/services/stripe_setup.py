"""One-command Stripe provisioning: `aquadata stripe-setup`.

Creates (idempotently) the Billing Meter that `stripe_meter.py` reports
usage to, one Stripe Product per paid tier, a flat monthly Price, and a
metered overage Price bound to the meter — then stores the price ids back
in ``api.products``. Pricing numbers come from the database rows, never
from code, so a price change is a DB update + re-run.

Idempotency layers:
1. price ids already stored in ``api.products`` are reused, never recreated;
2. the client's ensure_* calls look up by event name / metadata before
   creating, so even a lost DB write cannot duplicate Stripe objects.
"""

import asyncio
from dataclasses import dataclass
from typing import Final, Protocol

from aquadata.db.queries import DbPool

METER_EVENT_NAME: Final = "aquadata_api_call"
_PRODUCT_METADATA_KEY: Final = "aquadata_code"


class StripeSetupClient(Protocol):
    """The provisioning slice of the Stripe API; swapped for a fake in tests."""

    async def ensure_meter(self, event_name: str) -> str: ...

    async def ensure_product(self, code: str, name: str) -> str: ...

    async def ensure_flat_price(self, product_id: str, monthly_cents: int) -> str: ...

    async def ensure_metered_price(
        self, product_id: str, meter_id: str, micro_usd_per_call: int, included_calls: int
    ) -> str: ...


@dataclass(frozen=True)
class TierSetup:
    code: str
    stripe_price_id: str
    stripe_overage_price_id: str | None


@dataclass(frozen=True)
class SetupResult:
    meter_id: str
    tiers: tuple[TierSetup, ...]


async def run_setup(pool: DbPool, client: StripeSetupClient) -> SetupResult:
    """Provision Stripe for every active paid tier; returns what is now live."""
    meter_id = await client.ensure_meter(METER_EVENT_NAME)
    rows = await pool.fetch(
        """SELECT code, name, monthly_price_cents, included_calls,
                  overage_price_micro_usd, stripe_price_id, stripe_overage_price_id
           FROM api.products
           WHERE active AND monthly_price_cents > 0
           ORDER BY code"""
    )
    tiers: list[TierSetup] = []
    for row in rows:
        product_id = await client.ensure_product(row["code"], row["name"])
        price_id = row["stripe_price_id"] or await client.ensure_flat_price(
            product_id, int(row["monthly_price_cents"])
        )
        overage_id = row["stripe_overage_price_id"]
        if overage_id is None and row["overage_price_micro_usd"] is not None:
            overage_id = await client.ensure_metered_price(
                product_id,
                meter_id,
                int(row["overage_price_micro_usd"]),
                int(row["included_calls"]),
            )
        await pool.execute(
            """UPDATE api.products
               SET stripe_price_id = $2, stripe_overage_price_id = $3
               WHERE code = $1""",
            row["code"],
            price_id,
            overage_id,
        )
        tiers.append(TierSetup(row["code"], price_id, overage_id))
    return SetupResult(meter_id=meter_id, tiers=tuple(tiers))


class StripeProvisioningClient:
    """Real client (sync Stripe SDK offloaded to a thread)."""

    def __init__(self, api_key: str) -> None:
        assert api_key
        self._api_key = api_key

    def _client(self) -> object:
        import stripe  # noqa: PLC0415 - keep the SDK out of fake-client test paths

        return stripe.StripeClient(self._api_key)

    async def ensure_meter(self, event_name: str) -> str:
        def _run() -> str:
            client = self._client()
            meters = client.billing.meters.list(params={"status": "active"})  # type: ignore[attr-defined]
            for meter in meters.auto_paging_iter():
                if meter.event_name == event_name:
                    return str(meter.id)
            created = client.billing.meters.create(  # type: ignore[attr-defined]
                params={
                    "display_name": "AquaData API calls",
                    "event_name": event_name,
                    "default_aggregation": {"formula": "sum"},
                    "customer_mapping": {
                        "type": "by_id",
                        "event_payload_key": "stripe_customer_id",
                    },
                    "value_settings": {"event_payload_key": "value"},
                }
            )
            return str(created.id)

        return await asyncio.to_thread(_run)

    async def ensure_product(self, code: str, name: str) -> str:
        def _run() -> str:
            client = self._client()
            products = client.products.list(params={"active": True, "limit": 100})  # type: ignore[attr-defined]
            for product in products.auto_paging_iter():
                if (product.metadata or {}).get(_PRODUCT_METADATA_KEY) == code:
                    return str(product.id)
            created = client.products.create(  # type: ignore[attr-defined]
                params={"name": f"AquaData API — {name}",
                        "metadata": {_PRODUCT_METADATA_KEY: code}}
            )
            return str(created.id)

        return await asyncio.to_thread(_run)

    async def ensure_flat_price(self, product_id: str, monthly_cents: int) -> str:
        assert monthly_cents > 0

        def _run() -> str:
            client = self._client()
            prices = client.prices.list(  # type: ignore[attr-defined]
                params={"product": product_id, "active": True, "limit": 100}
            )
            for price in prices.auto_paging_iter():
                recurring = price.recurring or {}
                if (
                    recurring.get("interval") == "month"
                    and recurring.get("usage_type") != "metered"
                    and price.unit_amount == monthly_cents
                ):
                    return str(price.id)
            created = client.prices.create(  # type: ignore[attr-defined]
                params={
                    "product": product_id,
                    "currency": "usd",
                    "unit_amount": monthly_cents,
                    "recurring": {"interval": "month"},
                }
            )
            return str(created.id)

        return await asyncio.to_thread(_run)

    async def ensure_metered_price(
        self, product_id: str, meter_id: str, micro_usd_per_call: int, included_calls: int
    ) -> str:
        """Graduated tiers: the first ``included_calls`` units in each billing
        period cost $0 (covered by the flat monthly price), and only calls
        beyond that bill at the overage rate — so the batcher can report every
        billable call without double-charging the included allowance."""
        assert micro_usd_per_call > 0 and included_calls > 0
        # Stripe prices are in decimal cents: 2000 micro-USD/call -> "0.2".
        decimal_cents = f"{micro_usd_per_call / 10_000:g}"

        def _run() -> str:
            client = self._client()
            prices = client.prices.list(  # type: ignore[attr-defined]
                params={"product": product_id, "active": True, "limit": 100}
            )
            for price in prices.auto_paging_iter():
                recurring = price.recurring or {}
                if recurring.get("usage_type") == "metered" and recurring.get("meter") == meter_id:
                    return str(price.id)
            created = client.prices.create(  # type: ignore[attr-defined]
                params={
                    "product": product_id,
                    "currency": "usd",
                    "billing_scheme": "tiered",
                    "tiers_mode": "graduated",
                    "tiers": [
                        {"up_to": included_calls, "unit_amount": 0},
                        {"up_to": "inf", "unit_amount_decimal": decimal_cents},
                    ],
                    "recurring": {
                        "interval": "month",
                        "usage_type": "metered",
                        "meter": meter_id,
                    },
                }
            )
            return str(created.id)

        return await asyncio.to_thread(_run)
