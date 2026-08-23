"""Paid signup end to end: Checkout link, suspended key, webhook activation,
subscription-cancel suspension. Real Postgres; Stripe replaced by a fake
checkout client and genuinely signed webhook payloads."""

import hashlib
import hmac
import json
import time
from collections.abc import AsyncIterator

import httpx
import pytest_asyncio
from conftest import TEST_WEBHOOK_SECRET
from fastapi import FastAPI

from aquadata.db.queries import DbPool


class FakeCheckoutClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, str | None]] = []

    async def create_checkout(
        self, email: str, key_id: str, flat_price_id: str, overage_price_id: str | None
    ) -> str:
        self.calls.append((email, key_id, flat_price_id, overage_price_id))
        return f"https://checkout.stripe.test/session-for-{key_id}"


def _signed_headers(payload: bytes) -> dict[str, str]:
    timestamp = int(time.time())
    digest = hmac.new(
        TEST_WEBHOOK_SECRET.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    return {
        "Stripe-Signature": f"t={timestamp},v1={digest}",
        "Content-Type": "application/json",
    }


def _event(event_type: str, obj: dict[str, object]) -> bytes:
    return json.dumps({"type": event_type, "data": {"object": obj}}).encode()


@pytest_asyncio.fixture
async def paid_ready(api_app: FastAPI, db_pool: DbPool) -> AsyncIterator[FakeCheckoutClient]:
    """Starter tier provisioned + fake checkout installed; restored afterwards."""
    await db_pool.execute(
        """UPDATE api.products
           SET stripe_price_id = 'price_flat_starter',
               stripe_overage_price_id = 'price_over_starter'
           WHERE code = 'starter'"""
    )
    fake = FakeCheckoutClient()
    api_app.state.checkout = fake
    yield fake
    api_app.state.checkout = None
    await db_pool.execute(
        """UPDATE api.products
           SET stripe_price_id = NULL, stripe_overage_price_id = NULL
           WHERE code = 'starter'"""
    )


async def test_paid_signup_then_webhook_activation_lifecycle(
    api_client: httpx.AsyncClient, paid_ready: FakeCheckoutClient
) -> None:
    response = await api_client.post(
        "/v1/keys/signup", json={"email": "paid-flow@example.com", "product_code": "starter"}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    key, key_id = body["api_key"], body["key_id"]
    assert key.startswith("ak_live_")
    assert body["checkout_url"] == f"https://checkout.stripe.test/session-for-{key_id}"
    assert paid_ready.calls == [
        ("paid-flow@example.com", key_id, "price_flat_starter", "price_over_starter")
    ]

    # Key exists but is suspended until checkout completes.
    denied = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": key})
    assert denied.status_code == 403
    assert denied.json()["error"] == "key_inactive"

    completed = _event(
        "checkout.session.completed",
        {"client_reference_id": key_id, "customer": "cus_flow1", "subscription": "sub_flow1"},
    )
    hook = await api_client.post(
        "/v1/stripe/webhook", content=completed, headers=_signed_headers(completed)
    )
    assert hook.status_code == 200 and hook.json() == {"received": True}

    allowed = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": key})
    assert allowed.status_code == 200

    cancelled = _event("customer.subscription.deleted", {"customer": "cus_flow1"})
    hook2 = await api_client.post(
        "/v1/stripe/webhook", content=cancelled, headers=_signed_headers(cancelled)
    )
    assert hook2.status_code == 200
    suspended = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": key})
    assert suspended.status_code == 403


async def test_webhook_rejects_bad_signature(api_client: httpx.AsyncClient) -> None:
    payload = _event("checkout.session.completed", {"client_reference_id": "x"})
    response = await api_client.post(
        "/v1/stripe/webhook",
        content=payload,
        headers={"Stripe-Signature": "t=1,v1=deadbeef", "Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_signature"


async def test_webhook_ignores_unknown_events(api_client: httpx.AsyncClient) -> None:
    payload = _event("invoice.paid", {"customer": "cus_whatever"})
    response = await api_client.post(
        "/v1/stripe/webhook", content=payload, headers=_signed_headers(payload)
    )
    assert response.status_code == 200 and response.json() == {"received": True}


async def test_paid_signup_without_provisioned_prices_is_503(
    api_app: FastAPI, api_client: httpx.AsyncClient
) -> None:
    """Checkout configured but stripe-setup not run yet -> explicit 503."""
    api_app.state.checkout = FakeCheckoutClient()
    try:
        response = await api_client.post(
            "/v1/keys/signup", json={"email": "early@example.com", "product_code": "starter"}
        )
    finally:
        api_app.state.checkout = None
    assert response.status_code == 503
    assert "stripe-setup" in response.json()["detail"]
