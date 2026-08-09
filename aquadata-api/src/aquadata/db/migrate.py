"""SQL migration runner.

Applies ``migrations/*.sql`` in filename order, one transaction per file,
tracked in ``public.schema_migrations`` with content hashes so an edited
already-applied file fails loudly instead of drifting silently. An advisory
lock prevents two runners from racing.
"""

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import asyncpg

_ADVISORY_LOCK_KEY: Final = 0x41514144  # 'AQAD'
_MAX_MIGRATIONS: Final = 1000  # loop bound sanity cap

_TRACKING_TABLE: Final = """
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    filename   text PRIMARY KEY,
    sha256     char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""


class MigrationError(RuntimeError):
    """Raised on missing files, drifted content, or apply failure."""


@dataclass(frozen=True)
class Migration:
    filename: str
    sql: str
    sha256: str


def load_migrations(directory: Path) -> list[Migration]:
    """Read all .sql files in name order; empty or missing dir is an error."""
    if not directory.is_dir():
        raise MigrationError(f"migrations directory not found: {directory}")
    files = sorted(directory.glob("*.sql"))
    if not files:
        raise MigrationError(f"no .sql files in {directory}")
    if len(files) > _MAX_MIGRATIONS:
        raise MigrationError(f"more than {_MAX_MIGRATIONS} migration files")
    migrations: list[Migration] = []
    for path in files:
        sql = path.read_text(encoding="utf-8")
        if not sql.strip():
            raise MigrationError(f"migration {path.name} is empty")
        digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        migrations.append(Migration(filename=path.name, sql=sql, sha256=digest))
    return migrations


async def apply_migrations(conn: asyncpg.Connection, migrations: list[Migration]) -> list[str]:
    """Apply pending migrations; return the filenames applied this run."""
    await conn.execute(_TRACKING_TABLE)
    await conn.execute("SELECT pg_advisory_lock($1)", _ADVISORY_LOCK_KEY)
    try:
        return await _apply_locked(conn, migrations)
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _ADVISORY_LOCK_KEY)


async def _apply_locked(conn: asyncpg.Connection, migrations: list[Migration]) -> list[str]:
    applied: list[str] = []
    for migration in migrations:
        row = await conn.fetchrow(
            "SELECT sha256 FROM public.schema_migrations WHERE filename = $1",
            migration.filename,
        )
        if row is not None:
            if row["sha256"] != migration.sha256:
                raise MigrationError(
                    f"{migration.filename} changed after being applied "
                    f"(stored {row['sha256'][:12]}…, file {migration.sha256[:12]}…)"
                )
            continue
        async with conn.transaction():
            await conn.execute(migration.sql)
            await conn.execute(
                "INSERT INTO public.schema_migrations (filename, sha256) VALUES ($1, $2)",
                migration.filename,
                migration.sha256,
            )
        applied.append(migration.filename)
    return applied
