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


@app.command()
def refresh(
    data_dir: Path = typer.Option(..., help="Directory containing the snapshot files"),
    manifest: Path = typer.Option(..., help="Manifest JSON: table -> expected row count"),
    snapshot_date: str = typer.Option(..., help="Snapshot date YYYY-MM-DD"),
) -> None:
    """Re-ingest a snapshot: stage, validate vs manifest (>10% delta fails
    loudly), then swap schemas in one transaction."""
    from aquadata.db.refresh import run_refresh

    settings = load_settings()
    counts = asyncio.run(run_refresh(settings.database_url, data_dir, manifest, snapshot_date))
    for table, count in counts.items():
        typer.echo(f"{table}: {count} rows")
    typer.echo("refresh complete — schemas swapped")


@app.command("stripe-reconcile")
def stripe_reconcile() -> None:
    """Replay unsent usage to Stripe (run after outages, or from cron)."""
    from aquadata.services.stripe_meter import StripeMeter, StripeMeterEventClient

    settings = load_settings()
    if settings.stripe_api_key is None:
        typer.echo("STRIPE_API_KEY is not set", err=True)
        raise typer.Exit(code=1)

    async def _run(database_url: str, api_key: str) -> str:
        conn = await asyncpg.connect(database_url)
        try:
            meter = StripeMeter(conn, StripeMeterEventClient(api_key))
            result = await meter.run_once()
            return f"sent {result.sent}, failed {result.failed}"
        finally:
            await conn.close()

    typer.echo(asyncio.run(_run(settings.database_url, settings.stripe_api_key)))


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
