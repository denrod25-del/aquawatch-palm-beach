"""Integration fixtures: real Postgres 16 + real Redis, no mocks.

Creates a throwaway database, applies the actual migrations, and loads the
actual Palm Beach seed data once per session.
"""

import os
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import pytest_asyncio
import redis.asyncio as aioredis

from aquadata.db.migrate import apply_migrations, load_migrations
from aquadata.db.seed import run_seed

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
REPO_ROOT = PROJECT_ROOT.parent
DATA_DIR = REPO_ROOT / "client" / "src" / "data"
MIGRATIONS_DIR = PROJECT_ROOT / "migrations"

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://aquadata@127.0.0.1:5432/aquadata_test"
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6379/9")
SEED_SNAPSHOT_DATE = "2025-07-01"

_ADMIN_URL = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
_TEST_DB_NAME = TEST_DATABASE_URL.rsplit("/", 1)[1]


@pytest_asyncio.fixture(scope="session")
async def db_pool() -> AsyncIterator[asyncpg.Pool]:
    admin = await asyncpg.connect(_ADMIN_URL)
    try:
        await admin.execute(f'DROP DATABASE IF EXISTS "{_TEST_DB_NAME}"')
        await admin.execute(f'CREATE DATABASE "{_TEST_DB_NAME}"')
    finally:
        await admin.close()

    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        applied = await apply_migrations(conn, load_migrations(MIGRATIONS_DIR))
        assert applied, "fresh database must apply all migrations"
    finally:
        await conn.close()

    counts = await run_seed(TEST_DATABASE_URL, DATA_DIR, SEED_SNAPSHOT_DATE)
    assert counts["utilities"] == 6

    pool = await asyncpg.create_pool(TEST_DATABASE_URL, min_size=1, max_size=5)
    assert pool is not None
    yield pool
    await pool.close()


@pytest_asyncio.fixture(scope="session")
async def redis_client() -> AsyncIterator[aioredis.Redis]:
    client = aioredis.Redis.from_url(TEST_REDIS_URL)
    await client.flushdb()
    yield client
    await client.flushdb()
    await client.aclose()
