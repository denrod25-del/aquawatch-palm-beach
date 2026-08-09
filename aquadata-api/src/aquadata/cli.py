"""AquaData operations CLI: migrations, seeding, snapshot refresh."""

import asyncio
from pathlib import Path

import asyncpg
import typer

from aquadata.config import load_settings
from aquadata.db.migrate import apply_migrations, load_migrations

app = typer.Typer(no_args_is_help=True, help="AquaData API operations")

_DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"


async def _run_migrations(database_url: str, directory: Path) -> list[str]:
    migrations = load_migrations(directory)
    conn = await asyncpg.connect(database_url)
    try:
        return await apply_migrations(conn, migrations)
    finally:
        await conn.close()


@app.command()
def migrate(
    migrations_dir: Path = typer.Option(_DEFAULT_MIGRATIONS_DIR, exists=False),
) -> None:
    """Apply pending SQL migrations."""
    settings = load_settings()
    applied = asyncio.run(_run_migrations(settings.database_url, migrations_dir))
    if applied:
        for name in applied:
            typer.echo(f"applied {name}")
    else:
        typer.echo("nothing to apply — database is up to date")


@app.command("seed-palm-beach")
def seed_palm_beach(
    data_dir: Path = typer.Option(..., help="Directory with the AquaWatch JSON files"),
    snapshot_date: str = typer.Option(..., help="Snapshot date YYYY-MM-DD for provenance"),
) -> None:
    """Load the Palm Beach County dataset (real CCR/UCMR5-derived data)."""
    from aquadata.db.seed import run_seed  # local import: keeps CLI startup light

    settings = load_settings()
    counts = asyncio.run(run_seed(settings.database_url, data_dir, snapshot_date))
    for table, count in counts.items():
        typer.echo(f"{table}: {count} rows")


@app.command("ensure-partitions")
def ensure_partitions() -> None:
    """Create current+next month api.usage partitions (run from monthly cron)."""

    async def _ensure(database_url: str) -> list[str]:
        conn = await asyncpg.connect(database_url)
        try:
            rows = await conn.fetch(
                "SELECT api.ensure_usage_partition(now()::date) AS a,"
                " api.ensure_usage_partition((now() + interval '1 month')::date) AS b"
            )
            assert len(rows) == 1
            return [rows[0]["a"], rows[0]["b"]]
        finally:
            await conn.close()

    settings = load_settings()
    for name in asyncio.run(_ensure(settings.database_url)):
        typer.echo(f"partition ready: {name}")


if __name__ == "__main__":
    app()
