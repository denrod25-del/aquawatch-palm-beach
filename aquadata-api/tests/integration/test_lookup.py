"""Lookup integration tests against real Postgres (test plan item 2)."""

from conftest import DATA_DIR, SEED_SNAPSHOT_DATE, TEST_DATABASE_URL

from aquadata.db import queries
from aquadata.db.queries import DbPool
from aquadata.db.seed import run_seed


async def test_known_zip_returns_correct_utility(db_pool: DbPool) -> None:
    rows = await queries.utilities_for_zip(db_pool, "33435")
    assert [r["pws_id"] for r in rows] == ["FL4004875"]
    assert rows[0]["state"] == "FL"


async def test_multi_utility_zip_ordered_by_population(db_pool: DbPool) -> None:
    """33401 is served by PBCWUD (650k) and West Palm Beach (120k)."""
    rows = await queries.utilities_for_zip(db_pool, "33401")
    assert [r["pws_id"] for r in rows] == ["FL4004801", "FL4004852"]
    assert rows[0]["population_served"] > rows[1]["population_served"]


async def test_out_of_coverage_zip_returns_empty(db_pool: DbPool) -> None:
    """90210 is a real ZIP but outside v1 coverage — empty, not an error."""
    assert await queries.utilities_for_zip(db_pool, "90210") == []


async def test_snapshot_dates_propagate(db_pool: DbPool) -> None:
    """meta.sources must come from api.data_snapshots, not constants."""
    snapshots = await queries.current_snapshots(db_pool)
    assert set(snapshots) == {"ccr", "readings"}
    labels = queries.snapshot_source_labels(snapshots)
    assert labels == ["ccr (snapshot 2025-07-01)", "readings (snapshot 2025-07-01)"]


async def test_enforcement_and_hardness_sources_absent(db_pool: DbPool) -> None:
    """These sources are not loaded in v1 — components must report no_data."""
    snapshots = await queries.current_snapshots(db_pool)
    assert "enforcement" not in snapshots
    assert "hardness" not in snapshots


async def test_utility_detail_queries(db_pool: DbPool) -> None:
    utility = await queries.utility_by_id(db_pool, "FL4004801")
    assert utility is not None and utility["population_served"] == 650000
    violations = await queries.violations_for_pws(db_pool, "FL4004801")
    assert len(violations) == 5
    pfas = await queries.pfas_readings_for_pws(db_pool, "FL4004801")
    assert pfas, "PBCWUD has PFAS readings"
    assert all(r["unit"] == "ppt" for r in pfas)
    lead = await queries.latest_lead_reading(db_pool, "FL4004801")
    assert lead is not None


async def test_unknown_utility_returns_none(db_pool: DbPool) -> None:
    assert await queries.utility_by_id(db_pool, "FL9999999") is None


async def test_coverage_summary(db_pool: DbPool) -> None:
    coverage = await queries.coverage_summary(db_pool)
    assert coverage["states"] == [{"state": "FL", "utility_count": 6}]
    assert coverage["zip_count"] == 65


async def test_seed_is_idempotent(db_pool: DbPool) -> None:
    """Re-running the seed replaces contents without duplicating rows."""
    counts = await run_seed(TEST_DATABASE_URL, DATA_DIR, SEED_SNAPSHOT_DATE)
    assert counts["utilities"] == 6
    total = await db_pool.fetchval("SELECT count(*) FROM water.utilities")
    assert total == 6
