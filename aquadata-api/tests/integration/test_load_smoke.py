"""Load smoke (test plan item 5): 100 concurrent cached lookups, p95 < 150ms.

Runs `ab` against a real 4-worker uvicorn over TCP — the deployment shape —
with real Postgres and Redis behind it. An in-process httpx loop costs
~2-3ms CPU per request on the same box, which saturates the measurement
before the server does; ab measures without that overhead.
"""

import asyncio
import os
import re
import socket
import subprocess
import sys
import time
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest_asyncio
from conftest import TEST_DATABASE_URL, TEST_REDIS_URL

from aquadata.core.keys import generate_api_key, hash_api_key
from aquadata.db.queries import DbPool

CONCURRENCY = 100
REQUESTS = 200
P95_BUDGET_MS = 150
_STARTUP_TIMEOUT_S = 30
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    assert isinstance(port, int)
    return port


@pytest_asyncio.fixture(scope="session")
async def uvicorn_server(db_pool: DbPool) -> AsyncIterator[str]:
    """Real multi-worker uvicorn against the seeded test DB; yields base URL."""
    port = _free_port()
    env = dict(os.environ)
    env.update(
        {
            "DATABASE_URL": TEST_DATABASE_URL,
            "REDIS_URL": TEST_REDIS_URL,
            "PYTHONPATH": str(PROJECT_ROOT / "src"),
        }
    )
    process = subprocess.Popen(  # noqa: S603 - fixed argv, test-only
        [
            sys.executable, "-m", "uvicorn", "aquadata.api.main:app",
            "--host", "127.0.0.1", "--port", str(port),
            "--workers", "4", "--log-level", "warning",
        ],
        env=env,
        cwd=PROJECT_ROOT,
    )
    base_url = f"http://127.0.0.1:{port}"
    try:
        async with httpx.AsyncClient(base_url=base_url) as client:
            deadline = time.monotonic() + _STARTUP_TIMEOUT_S
            while True:
                try:
                    response = await client.get("/v1/health")
                    if response.status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                assert time.monotonic() < deadline, "uvicorn did not become healthy"
                await asyncio.sleep(0.25)
        yield base_url
    finally:
        process.terminate()
        process.wait(timeout=10)


async def _pro_key(db_pool: DbPool) -> str:
    """Pro-tier key (50k/month) so the burst is not rate-limit bound."""
    raw = generate_api_key()
    await db_pool.execute(
        "INSERT INTO api.keys (key_hash, product_code, email) VALUES ($1, 'pro', $2)",
        hash_api_key(raw),
        "load@example.com",
    )
    return raw


def _parse_ab_p95(output: str) -> int:
    match = re.search(r"^\s*95%\s+(\d+)", output, re.MULTILINE)
    assert match is not None, f"no 95% percentile in ab output:\n{output}"
    return int(match.group(1))


def _burst_p95(url: str, api_key: str) -> int:
    result = subprocess.run(  # noqa: S603 - fixed argv, test-only
        [
            "/usr/bin/ab", "-n", str(REQUESTS), "-c", str(CONCURRENCY),
            "-H", f"X-API-Key: {api_key}", url,
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    assert "Non-2xx responses" not in result.stdout, result.stdout
    return _parse_ab_p95(result.stdout)


async def test_100_concurrent_cached_lookups_under_p95(
    uvicorn_server: str, db_pool: DbPool
) -> None:
    api_key = await _pro_key(db_pool)
    url = f"{uvicorn_server}/v1/water-quality/33401"
    async with httpx.AsyncClient() as client:
        warm = await client.get(url, headers={"X-API-Key": api_key})
        assert warm.status_code == 200  # cache is hot before the bursts

    _burst_p95(url, api_key)  # warmup burst: pays per-worker one-time costs
    # Median of three measured bursts damps shared-CPU neighbor noise without
    # hiding a real regression (a slow server is slow in all three).
    p95_samples = sorted(_burst_p95(url, api_key) for _ in range(3))
    p95 = p95_samples[1]
    assert p95 < P95_BUDGET_MS, (
        f"median p95 {p95}ms (samples {p95_samples}) exceeds {P95_BUDGET_MS}ms budget"
    )
