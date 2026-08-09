"""Read queries against the water schema. Parameterized SQL only, no ORM."""

from datetime import date
from typing import Any, Protocol

from aquadata.core.scoring import PFAS_MCL_PPT


class DbPool(Protocol):
    """The slice of asyncpg.Pool/Connection we use (asyncpg ships no stubs)."""

    async def fetch(self, query: str, *args: object) -> list[Any]: ...

    async def fetchrow(self, query: str, *args: object) -> Any | None: ...

    async def fetchval(self, query: str, *args: object) -> Any: ...

    async def execute(self, query: str, *args: object) -> str: ...


Pool = DbPool

_PFAS_COMPOUNDS = sorted(PFAS_MCL_PPT) + ["PFBS", "PFBA", "PFHXA", "PFPEA"]


async def utilities_for_zip(pool: Pool, zip_code: str) -> list[Any]:
    """All utilities serving a ZIP, largest population first (drives is_primary)."""
    return await pool.fetch(
        """SELECT u.pws_id, u.name, u.state, u.county, u.population_served,
                  u.source_type, u.status
           FROM water.utility_zips z
           JOIN water.utilities u USING (pws_id)
           WHERE z.zip = $1
           ORDER BY u.population_served DESC, u.pws_id""",
        zip_code,
    )


async def utility_by_id(pool: Pool, pws_id: str) -> Any | None:
    return await pool.fetchrow(
        """SELECT pws_id, name, state, county, population_served, source_type, status
           FROM water.utilities WHERE pws_id = $1""",
        pws_id,
    )


async def zips_for_utility(pool: Pool, pws_id: str) -> list[str]:
    rows = await pool.fetch(
        "SELECT zip FROM water.utility_zips WHERE pws_id = $1 ORDER BY zip", pws_id
    )
    return [r["zip"] for r in rows]


async def violations_for_pws(pool: Pool, pws_id: str) -> list[Any]:
    return await pool.fetch(
        """SELECT violation_id, contaminant, violation_type, category, is_health_based,
                  start_date, end_date, status, description
           FROM water.violations WHERE pws_id = $1
           ORDER BY start_date DESC, violation_id""",
        pws_id,
    )


async def pfas_readings_for_pws(pool: Pool, pws_id: str) -> list[Any]:
    """PFAS rows in ppt; compound matching is case-insensitive (PFHxS == PFHXS)."""
    return await pool.fetch(
        """SELECT contaminant, value, unit, sample_date, epa_limit
           FROM water.contaminant_readings
           WHERE pws_id = $1 AND unit = 'ppt' AND upper(contaminant) = ANY($2::text[])
           ORDER BY sample_date DESC""",
        pws_id,
        _PFAS_COMPOUNDS,
    )


async def latest_lead_reading(pool: Pool, pws_id: str) -> Any | None:
    """Most recent lead row; unit may be ppt or ppb — caller converts to ppb."""
    return await pool.fetchrow(
        """SELECT value, unit, sample_date
           FROM water.contaminant_readings
           WHERE pws_id = $1 AND upper(contaminant) = 'LEAD'
           ORDER BY sample_date DESC LIMIT 1""",
        pws_id,
    )


async def readings_for_pws(pool: Pool, pws_id: str) -> list[Any]:
    return await pool.fetch(
        """SELECT contaminant, value, unit, sample_date, sample_point, method,
                  epa_limit, ewg_limit, national_avg
           FROM water.contaminant_readings WHERE pws_id = $1
           ORDER BY contaminant, sample_date DESC""",
        pws_id,
    )


async def enforcement_for_pws(pool: Pool, pws_id: str) -> list[Any]:
    return await pool.fetch(
        """SELECT action_type, action_date, description
           FROM water.enforcement_actions WHERE pws_id = $1 ORDER BY action_date DESC""",
        pws_id,
    )


async def hardness_for_zip(pool: Pool, zip_code: str) -> Any | None:
    return await pool.fetchrow(
        "SELECT value_mg_l FROM water.hardness WHERE zip = $1", zip_code
    )


async def ccr_reports_for_pws(pool: Pool, pws_id: str) -> list[Any]:
    return await pool.fetch(
        """SELECT year, report_url, report_type, notes
           FROM water.ccr_reports WHERE pws_id = $1 ORDER BY year DESC""",
        pws_id,
    )


async def current_snapshots(pool: Pool) -> dict[str, dict[str, Any]]:
    """source -> {snapshot_date, loaded_at}; drives meta.sources, never hardcoded."""
    rows = await pool.fetch(
        """SELECT source, snapshot_date, loaded_at
           FROM api.data_snapshots WHERE is_current ORDER BY source"""
    )
    return {
        r["source"]: {"snapshot_date": r["snapshot_date"], "loaded_at": r["loaded_at"]}
        for r in rows
    }


async def coverage_summary(pool: Pool) -> dict[str, Any]:
    states = await pool.fetch(
        """SELECT state, count(*) AS utility_count
           FROM water.utilities GROUP BY state ORDER BY state"""
    )
    zip_count = await pool.fetchval("SELECT count(DISTINCT zip) FROM water.utility_zips")
    return {
        "states": [{"state": r["state"], "utility_count": r["utility_count"]} for r in states],
        "zip_count": int(zip_count or 0),
    }


def lead_value_ppb(value: float, unit: str) -> float:
    """Convert a lead reading to ppb; reject unknown units loudly."""
    if unit == "ppb":
        return value
    if unit == "ppt":
        return value / 1000.0
    if unit == "ppm":
        return value * 1000.0
    raise ValueError(f"unsupported lead unit {unit!r}")


def snapshot_source_labels(snapshots: dict[str, dict[str, Any]]) -> list[str]:
    """Human-readable meta.sources entries from the live snapshot registry."""
    labels: list[str] = []
    for source, info in sorted(snapshots.items()):
        snapshot_date = info["snapshot_date"]
        assert isinstance(snapshot_date, date)
        labels.append(f"{source} (snapshot {snapshot_date.isoformat()})")
    return labels
