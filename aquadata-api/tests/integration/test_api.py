"""End-to-end API tests: auth, endpoints, billing rows, caching (test plan 2-4)."""

import httpx

from aquadata.core.keys import generate_api_key, hash_api_key
from aquadata.db.queries import DbPool


async def _usage_count(db_pool: DbPool, key: str | None = None) -> int:
    if key is None:
        value = await db_pool.fetchval("SELECT count(*) FROM api.usage")
    else:
        value = await db_pool.fetchval(
            """SELECT count(*) FROM api.usage u JOIN api.keys k ON k.id = u.key_id
               WHERE k.key_hash = $1""",
            hash_api_key(key),
        )
    return int(value)


async def test_signup_free_returns_key_once(api_client: httpx.AsyncClient) -> None:
    response = await api_client.post(
        "/v1/keys/signup", json={"email": "buyer@example.com", "product_code": "free"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["api_key"].startswith("ak_live_")
    assert body["checkout_url"] is None


async def test_signup_rejects_bad_email(api_client: httpx.AsyncClient) -> None:
    response = await api_client.post(
        "/v1/keys/signup", json={"email": "not-an-email", "product_code": "free"}
    )
    assert response.status_code == 422
    assert response.json()["error"] == "invalid_email"


async def test_signup_paid_tier_requires_stripe(api_client: httpx.AsyncClient) -> None:
    response = await api_client.post(
        "/v1/keys/signup", json={"email": "pro@example.com", "product_code": "pro"}
    )
    assert response.status_code == 503
    assert response.json()["error"] == "checkout_unavailable"


async def test_missing_key_is_401(api_client: httpx.AsyncClient) -> None:
    response = await api_client.get("/v1/water-quality/33401")
    assert response.status_code == 401
    assert response.json()["error"] == "missing_api_key"


async def test_unknown_key_is_401(api_client: httpx.AsyncClient) -> None:
    response = await api_client.get(
        "/v1/water-quality/33401", headers={"X-API-Key": generate_api_key()}
    )
    assert response.status_code == 401


async def test_malformed_key_is_401(api_client: httpx.AsyncClient) -> None:
    response = await api_client.get(
        "/v1/water-quality/33401", headers={"X-API-Key": "sk_live_totally_wrong"}
    )
    assert response.status_code == 401


async def test_water_quality_flagship_response(
    api_client: httpx.AsyncClient, api_key: str
) -> None:
    response = await api_client.get(
        "/v1/water-quality/33401", headers={"X-API-Key": api_key}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["zip"] == "33401"
    assert body["state"] == "FL"
    assert body["coverage"] == "supported"
    # Multi-utility ZIP: PBCWUD (650k) primary, West Palm Beach (120k) second.
    assert [u["pws_id"] for u in body["utilities"]] == ["FL4004801", "FL4004852"]
    assert body["utilities"][0]["is_primary"] is True
    assert body["utilities"][1]["is_primary"] is False

    score = body["score"]
    assert score["methodology_version"] == "1.0"
    assert isinstance(score["composite"], int)
    assert score["confidence"] == "partial"
    assert score["missing_components"] == ["enforcement_5yr", "hardness"]
    assert set(score["components"]) == {
        "violations_5yr", "pfas_ucmr5", "lead_copper_90th_pct", "enforcement_5yr", "hardness",
    }
    assert len(score["utilities"]) == 2  # per-utility scores for multi-PWS ZIPs

    assert body["pfas"]["detected"] is True
    pfos = next(c for c in body["pfas"]["compounds"] if c["name"].upper() == "PFOS")
    assert pfos["epa_mcl_ppt"] == 4.0
    assert body["violations"]["count_5yr"] >= 1
    assert body["hardness"] is None  # hardness layer not ingested in v1
    assert any(s.startswith("ccr (snapshot ") for s in body["meta"]["sources"])


async def test_water_quality_single_utility(api_client: httpx.AsyncClient, api_key: str) -> None:
    response = await api_client.get(
        "/v1/water-quality/33435", headers={"X-API-Key": api_key}
    )
    assert response.status_code == 200
    body = response.json()
    assert [u["pws_id"] for u in body["utilities"]] == ["FL4004875"]
    assert body["utilities"][0]["is_primary"] is True


async def test_out_of_coverage_zip_is_200_unsupported(
    api_client: httpx.AsyncClient, api_key: str
) -> None:
    response = await api_client.get(
        "/v1/water-quality/90210", headers={"X-API-Key": api_key}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["coverage"] == "unsupported_region"
    assert body["utilities"] == []
    assert body["score"] is None and body["pfas"] is None and body["violations"] is None
    assert body["meta"]["sources"]  # provenance still reported


async def test_malformed_zips_are_422(api_client: httpx.AsyncClient, api_key: str) -> None:
    for bad in ("3341", "33411-1234", "abcde", "334115"):
        response = await api_client.get(
            f"/v1/water-quality/{bad}", headers={"X-API-Key": api_key}
        )
        assert response.status_code == 422, bad
        assert response.json()["error"] == "invalid_zip"


async def test_utility_detail(api_client: httpx.AsyncClient, api_key: str) -> None:
    response = await api_client.get(
        "/v1/utilities/FL4004801", headers={"X-API-Key": api_key}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["population_served"] == 650000
    assert len(body["violations"]) == 5
    assert body["contaminants"], "full contaminant table expected"
    assert body["zip_codes"], "served ZIPs expected"


async def test_unknown_utility_404(api_client: httpx.AsyncClient, api_key: str) -> None:
    response = await api_client.get(
        "/v1/utilities/FL9999999", headers={"X-API-Key": api_key}
    )
    assert response.status_code == 404


async def test_hardness_endpoint_no_data_yet(
    api_client: httpx.AsyncClient, api_key: str
) -> None:
    response = await api_client.get("/v1/hardness/33401", headers={"X-API-Key": api_key})
    assert response.status_code == 200
    body = response.json()
    assert body["coverage"] == "supported"
    assert body["hardness"] is None and body["data_status"] == "no_data"


async def test_coverage_and_health_are_public(api_client: httpx.AsyncClient) -> None:
    coverage = await api_client.get("/v1/coverage")
    assert coverage.status_code == 200
    assert coverage.json()["states"] == [{"state": "FL", "utility_count": 6}]
    health = await api_client.get("/v1/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "checks": {"postgres": "ok", "redis": "ok"}}


async def test_usage_rows_written_on_2xx_only(
    api_client: httpx.AsyncClient, api_key: str, db_pool: DbPool
) -> None:
    before = await _usage_count(db_pool, api_key)
    ok = await api_client.get("/v1/water-quality/33401", headers={"X-API-Key": api_key})
    assert ok.status_code == 200
    bad_zip = await api_client.get("/v1/water-quality/abcde", headers={"X-API-Key": api_key})
    assert bad_zip.status_code == 422
    missing = await api_client.get("/v1/utilities/FL9999999", headers={"X-API-Key": api_key})
    assert missing.status_code == 404
    after = await _usage_count(db_pool, api_key)
    assert after == before + 1  # only the 200 billed


async def test_usage_not_written_for_public_endpoints(
    api_client: httpx.AsyncClient, db_pool: DbPool
) -> None:
    before = await _usage_count(db_pool)
    assert (await api_client.get("/v1/coverage")).status_code == 200
    assert (await api_client.get("/v1/health")).status_code == 200
    assert await _usage_count(db_pool) == before


async def test_cached_lookup_returns_identical_body(
    api_client: httpx.AsyncClient, api_key: str
) -> None:
    """Second call must come from cache: byte-identical body incl. generated_at."""
    first = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": api_key})
    second = await api_client.get("/v1/water-quality/33435", headers={"X-API-Key": api_key})
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
