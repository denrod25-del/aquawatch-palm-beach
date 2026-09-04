"""Snapshot refresh: stage, validate against a manifest, swap atomically.

The whole refresh is ONE transaction (Postgres DDL is transactional):

1. Rebuild ``water_staging`` from the canonical water DDL.
2. Load the snapshot files into staging and register snapshot rows.
3. Validate staged row counts against the operator-provided manifest —
   any table off by more than 10% aborts and rolls back everything,
   including the snapshot registration.
4. Swap: ``water`` -> ``water_old`` (previous generation kept), staging
   -> ``water``. Response caches invalidate automatically because cache
   keys embed the snapshot fingerprint.

Run monthly from cron; see DEPLOY.md.
"""

import json
import re
from datetime import date
from pathlib import Path
from typing import Final

import asyncpg

from aquadata.db.seed import load_seed_files, seed_schema_tx

STAGING_SCHEMA: Final = "water_staging"
MAX_ROW_DELTA: Final = 0.10

_WATER_DDL_FILE: Final = "0002_water_schema.sql"
_DEFAULT_MIGRATIONS_DIR: Final = Path(__file__).resolve().parents[3] / "migrations"


class RefreshError(RuntimeError):
    """Raised when the snapshot fails validation; nothing is swapped."""


def _load_manifest(path: Path) -> dict[str, int]:
    if not path.is_file():
        raise RefreshError(f"manifest not found: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not raw:
        raise RefreshError("manifest must be a non-empty JSON object of table -> row count")
    manifest: dict[str, int] = {}
    for table, expected in raw.items():
        if not isinstance(expected, int) or expected < 0 or isinstance(expected, bool):
            raise RefreshError(f"manifest[{table!r}] must be a non-negative integer")
        manifest[table] = expected
    return manifest


def validate_counts(staged: dict[str, int], manifest: dict[str, int]) -> None:
    """Fail loudly on unknown tables, uncovered tables, or >10% deltas."""
    unknown = sorted(set(manifest) - set(staged))
    if unknown:
        raise RefreshError(f"manifest references unknown tables: {unknown}")
    uncovered = sorted(set(staged) - set(manifest))
    if uncovered:
        raise RefreshError(f"manifest must cover every loaded table; missing: {uncovered}")
    for table, expected in sorted(manifest.items()):
        actual = staged[table]
        if expected == 0:
            if actual != 0:
                raise RefreshError(f"{table}: expected 0 rows, staged {actual}")
            continue
        delta = abs(actual - expected) / expected
        if delta > MAX_ROW_DELTA:
            raise RefreshError(
                f"{table}: staged {actual} vs manifest {expected} "
                f"({delta:.0%} delta exceeds {MAX_ROW_DELTA:.0%})"
            )


def _staging_ddl(migrations_dir: Path) -> str:
    ddl_path = migrations_dir / _WATER_DDL_FILE
    if not ddl_path.is_file():
        raise RefreshError(f"water DDL not found: {ddl_path}")
    ddl = ddl_path.read_text(encoding="utf-8")
    staged = re.sub(r"\bwater\b", STAGING_SCHEMA, ddl)
    assert STAGING_SCHEMA in staged
    return staged


async def run_refresh(
    database_url: str,
    data_dir: Path,
    manifest_path: Path,
    snapshot_date_raw: str,
    migrations_dir: Path = _DEFAULT_MIGRATIONS_DIR,
) -> dict[str, int]:
    """Stage, validate, swap. Returns staged row counts on success."""
    snapshot_date = date.fromisoformat(snapshot_date_raw)
    manifest = _load_manifest(manifest_path)
    files = load_seed_files(data_dir)
    ddl = _staging_ddl(migrations_dir)

    conn = await asyncpg.connect(database_url)
    try:
        async with conn.transaction():
            await conn.execute(f"DROP SCHEMA IF EXISTS {STAGING_SCHEMA} CASCADE")
            await conn.execute(ddl)
            counts = await seed_schema_tx(conn, snapshot_date, files, schema=STAGING_SCHEMA)
            validate_counts(counts, manifest)
            await conn.execute("DROP SCHEMA IF EXISTS water_old CASCADE")
            await conn.execute("ALTER SCHEMA water RENAME TO water_old")
            await conn.execute(f"ALTER SCHEMA {STAGING_SCHEMA} RENAME TO water")
    finally:
        await conn.close()
    return counts
