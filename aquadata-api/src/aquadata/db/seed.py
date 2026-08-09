"""Full load of the Palm Beach County dataset (real harvested CCR/PFAS data).

Reads the AquaWatch JSON files, replaces the ``water`` schema contents in one
transaction, and registers ``api.data_snapshots`` rows so ``meta.sources`` in
responses reflects what is actually loaded. Sources registered:

- ``ccr``      -> utilities, utility_zips, violations, ccr_reports
- ``readings`` -> contaminant_readings (PFAS, lead, nitrate, ...)

``enforcement`` and ``hardness`` are deliberately NOT registered — those
components report ``no_data`` until their sources are ingested.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

import asyncpg

from aquadata.core.validation import is_valid_zip

_REQUIRED_FILES = (
    "waterSystems.json",
    "violations.json",
    "readings.json",
    "zipCcr.json",
    "ccrReports.json",
)


class SeedError(RuntimeError):
    """Raised when seed input files are missing or malformed."""


def _load_json(data_dir: Path, name: str) -> list[dict[str, Any]]:
    path = data_dir / name
    if not path.is_file():
        raise SeedError(f"required seed file missing: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise SeedError(f"{name} must be a non-empty JSON array")
    return data


def _zip_list(raw: str, context: str) -> list[str]:
    zips = json.loads(raw)
    if not isinstance(zips, list):
        raise SeedError(f"{context}: zip_codes is not a JSON array")
    bad = [z for z in zips if not is_valid_zip(z)]
    if bad:
        raise SeedError(f"{context}: invalid ZIPs {bad}")
    return zips


async def _register_snapshot(
    conn: asyncpg.Connection,
    source: str,
    snapshot_date: date,
    row_count: int,
    manifest: dict[str, Any],
) -> int:
    await conn.execute(
        "UPDATE api.data_snapshots SET is_current = false WHERE source = $1 AND is_current",
        source,
    )
    snapshot_id = await conn.fetchval(
        """INSERT INTO api.data_snapshots (source, snapshot_date, row_count, manifest, is_current)
           VALUES ($1, $2, $3, $4, true) RETURNING id""",
        source,
        snapshot_date,
        row_count,
        json.dumps(manifest),
    )
    assert isinstance(snapshot_id, int)
    return snapshot_id


async def run_seed(database_url: str, data_dir: Path, snapshot_date_raw: str) -> dict[str, int]:
    """Replace water-schema contents from the JSON files; returns row counts."""
    snapshot_date = date.fromisoformat(snapshot_date_raw)
    files = {name: _load_json(data_dir, name) for name in _REQUIRED_FILES}

    conn = await asyncpg.connect(database_url)
    try:
        async with conn.transaction():
            counts = await _seed_tx(conn, snapshot_date, files)
    finally:
        await conn.close()
    return counts


async def _seed_tx(
    conn: asyncpg.Connection,
    snapshot_date: date,
    files: dict[str, list[dict[str, Any]]],
) -> dict[str, int]:
    systems = files["waterSystems.json"]
    violations = files["violations.json"]
    readings = files["readings.json"]
    zip_ccr = files["zipCcr.json"]
    ccr_reports = files["ccrReports.json"]
    await conn.execute(
        "TRUNCATE water.contaminant_readings, water.violations, water.ccr_reports,"
        " water.enforcement_actions, water.utility_zips, water.hardness, water.utilities"
    )
    known_pws = {s["pwsid"] for s in systems}
    ccr_manifest = {
        "utilities": len(systems),
        "violations": len(violations),
        "ccr_reports": len(ccr_reports),
        "zip_ccr_rows_without_pwsid": sum(1 for z in zip_ccr if not z.get("pwsid")),
    }
    ccr_snap = await _register_snapshot(
        conn, "ccr", snapshot_date, len(systems) + len(violations) + len(ccr_reports), ccr_manifest
    )
    readings_snap = await _register_snapshot(
        conn, "readings", snapshot_date, len(readings), {"readings": len(readings)}
    )

    for s in systems:
        await conn.execute(
            """INSERT INTO water.utilities
               (pws_id, name, state, county, population_served, source_type, status, snapshot_id)
               VALUES ($1, $2, 'FL', $3, $4, $5, $6, $7)""",
            s["pwsid"], s["name"], s["county"], s["population_served"],
            s["source_type"], s["status"], ccr_snap,
        )

    zip_pairs: set[tuple[str, str]] = set()
    for s in systems:
        for z in _zip_list(s["zip_codes"], s["pwsid"]):
            zip_pairs.add((s["pwsid"], z))
    for row in zip_ccr:
        pwsid = row.get("pwsid")
        if isinstance(pwsid, str) and pwsid in known_pws and is_valid_zip(row["zip_code"]):
            zip_pairs.add((pwsid, row["zip_code"]))
    await conn.executemany(
        "INSERT INTO water.utility_zips (pws_id, zip) VALUES ($1, $2)", sorted(zip_pairs)
    )

    for v in violations:
        if v["pwsid"] not in known_pws:
            raise SeedError(f"violation {v['violation_id']} references unknown PWS {v['pwsid']}")
        await conn.execute(
            """INSERT INTO water.violations
               (pws_id, violation_id, contaminant, violation_type, category, is_health_based,
                start_date, end_date, status, description, snapshot_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            v["pwsid"], v["violation_id"], v["contaminant"], v["violation_type"], v["category"],
            bool(v["is_health_based"]), date.fromisoformat(v["start_date"]),
            date.fromisoformat(v["end_date"]) if v.get("end_date") else None,
            v["status"], v.get("description"), ccr_snap,
        )

    for r in readings:
        if r["pwsid"] not in known_pws:
            raise SeedError(f"reading {r['id']} references unknown PWS {r['pwsid']}")
        await conn.execute(
            """INSERT INTO water.contaminant_readings
               (pws_id, contaminant, value, unit, sample_date, sample_point, method,
                epa_limit, ewg_limit, national_avg, snapshot_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            r["pwsid"], r["contaminant"], r["value"], r["unit"],
            date.fromisoformat(r["sample_date"]), r.get("sample_point"), r.get("method"),
            r.get("epa_limit"), r.get("ewg_limit"), r.get("national_avg"), readings_snap,
        )

    for c in ccr_reports:
        pwsid = c.get("pwsid") if c.get("pwsid") in known_pws else None
        await conn.execute(
            """INSERT INTO water.ccr_reports
               (pws_id, year, report_url, report_type, notes, snapshot_id)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            pwsid, c["year"], c["report_url"], c["report_type"], c.get("notes"), ccr_snap,
        )

    return {
        "utilities": len(systems),
        "utility_zips": len(zip_pairs),
        "violations": len(violations),
        "contaminant_readings": len(readings),
        "ccr_reports": len(ccr_reports),
    }
