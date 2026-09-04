"""Refresh pipeline: staging, manifest validation, atomic swap (spec: data refresh)."""

import json
from pathlib import Path

import pytest
from conftest import DATA_DIR, TEST_DATABASE_URL

from aquadata.db import queries
from aquadata.db.queries import DbPool
from aquadata.db.refresh import RefreshError, run_refresh, validate_counts

GOOD_MANIFEST = {
    "utilities": 6,
    "utility_zips": 107,  # (pws_id, zip) pairs; 65 distinct ZIPs
    "violations": 10,
    "contaminant_readings": 70,
    "ccr_reports": 24,
}


def _write_manifest(tmp_path: Path, manifest: dict[str, int]) -> Path:
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path


async def test_refresh_swaps_and_registers_snapshots(
    db_pool: DbPool, tmp_path: Path
) -> None:
    manifest = _write_manifest(tmp_path, GOOD_MANIFEST)
    counts = await run_refresh(TEST_DATABASE_URL, DATA_DIR, manifest, "2025-08-01")
    assert counts["utilities"] == 6

    snapshots = await queries.current_snapshots(db_pool)
    assert {s: v["snapshot_date"].isoformat() for s, v in snapshots.items()} == {
        "ccr": "2025-08-01",
        "readings": "2025-08-01",
    }
    # New water schema serves data; previous generation is kept as water_old.
    assert len(await queries.utilities_for_zip(db_pool, "33401")) == 2
    old_exists = await db_pool.fetchval(
        "SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'water_old'"
    )
    assert int(old_exists) == 1


async def test_refresh_rejects_manifest_delta_and_rolls_back(
    db_pool: DbPool, tmp_path: Path
) -> None:
    """>10% delta fails loudly; the live schema and snapshots stay untouched."""
    before = await queries.current_snapshots(db_pool)
    bad = _write_manifest(tmp_path, {**GOOD_MANIFEST, "utilities": 60})
    with pytest.raises(RefreshError, match="utilities"):
        await run_refresh(TEST_DATABASE_URL, DATA_DIR, bad, "2030-01-01")

    after = await queries.current_snapshots(db_pool)
    assert after == before  # rollback also undid snapshot registration
    assert len(await queries.utilities_for_zip(db_pool, "33401")) == 2


async def test_refresh_requires_full_manifest_coverage(
    db_pool: DbPool, tmp_path: Path
) -> None:
    partial = _write_manifest(tmp_path, {"utilities": 6})
    with pytest.raises(RefreshError, match="missing"):
        await run_refresh(TEST_DATABASE_URL, DATA_DIR, partial, "2030-01-01")


def test_validate_counts_boundaries() -> None:
    validate_counts({"t": 100}, {"t": 110})  # exactly 10% of expected: allowed
    with pytest.raises(RefreshError, match="delta"):
        validate_counts({"t": 100}, {"t": 112})
    with pytest.raises(RefreshError, match="expected 0"):
        validate_counts({"t": 5}, {"t": 0})
    with pytest.raises(RefreshError, match="unknown"):
        validate_counts({"t": 5}, {"t": 5, "ghost": 1})
