"""Stripe Checkout session creation for paid-tier signup."""

import asyncio
from typing import Any, Protocol


class CheckoutClient(Protocol):
    """Creates a subscription Checkout session; swapped for a fake in tests."""

    async def create_checkout(
        self, email: str, key_id: str, flat_price_id: str, overage_price_id: str | None
    ) -> str: ...


class StripeCheckoutClient:
    def __init__(self, api_key: str, success_url: str, cancel_url: str) -> None:
        assert api_key and success_url and cancel_url
        self._api_key = api_key
        self._success_url = success_url
        self._cancel_url = cancel_url

    async def create_checkout(
        self, email: str, key_id: str, flat_price_id: str, overage_price_id: str | None
    ) -> str:
        def _run() -> str:
            import stripe  # noqa: PLC0415 - keep the SDK out of fake-client test paths

            client = stripe.StripeClient(self._api_key)
            line_items: list[dict[str, object]] = [{"price": flat_price_id, "quantity": 1}]
            if overage_price_id is not None:
                # Metered prices must not carry a quantity.
                line_items.append({"price": overage_price_id})
            params: Any = {
                "mode": "subscription",
                "customer_email": email,
                "client_reference_id": key_id,
                "line_items": line_items,
                "success_url": self._success_url,
                "cancel_url": self._cancel_url,
            }
            session = client.checkout.sessions.create(params=params)
            url = session.url
            assert isinstance(url, str) and url.startswith("https://")
            return url

        return await asyncio.to_thread(_run)
