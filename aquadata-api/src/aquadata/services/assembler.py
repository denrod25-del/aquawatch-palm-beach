"""Assemble API response payloads from queries + scoring.

Every quantitative value here traces back to a source row, and every
response carries ``meta.sources`` built from the live snapshot registry.
Component gating: a component is ``no_data`` when its *source* has never
been ingested — a loaded source with zero rows for a utility is real data.
"""

from datetime import UTC, date, datetime
from typing import Any, Final

from aquadata.core.scoring import (
    METHODOLOGY_VERSION,
    PFAS_MCL_PPT,
    WEIGHTS,
    ComponentScore,
    CompositeResult,
    EnforcementRecord,
    PfasSample,
    ViolationRecord,
    component_no_data,
    composite_score,
    hardness_classification,
    score_enforcement,
    score_hardness,
    score_lead,
    score_pfas,
    score_violations,
    years_before,
)
from aquadata.db import queries
from aquadata.db.queries import DbPool

DISCLAIMER: Final = (
    "Informational only; not a substitute for utility CCRs or certified lab testing."
)

# Which snapshot source feeds each score component.
_COMPONENT_SOURCE: Final = {
    "violations_5yr": "ccr",
    "pfas_ucmr5": "readings",
    "lead_copper_90th_pct": "readings",
    "enforcement_5yr": "enforcement",
    "hardness": "hardness",
}
assert set(_COMPONENT_SOURCE) == set(WEIGHTS)


def _meta(snapshots: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "sources": queries.snapshot_source_labels(snapshots),
        "disclaimer": DISCLAIMER,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


def _component_json(component: ComponentScore) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": component.status,
        "weight": WEIGHTS[component.name],
    }
    if component.status == "scored":
        assert component.score is not None
        payload["score"] = round(component.score, 1)
        payload.update(component.detail)
    return payload


async def _score_utility(
    pool: DbPool,
    pws_id: str,
    snapshots: dict[str, dict[str, Any]],
    hardness_mg_l: float | None,
    as_of: date,
) -> tuple[list[ComponentScore], CompositeResult]:
    """Score one utility. hardness_mg_l is ZIP-level; None means no row."""
    loaded = set(snapshots)
    components: list[ComponentScore] = []

    if _COMPONENT_SOURCE["violations_5yr"] in loaded:
        rows = await queries.violations_for_pws(pool, pws_id)
        records = [
            ViolationRecord(
                is_health_based=bool(r["is_health_based"]),
                start_date=r["start_date"],
                is_ongoing=r["status"] == "Ongoing",
            )
            for r in rows
        ]
        components.append(score_violations(records, as_of))
    else:
        components.append(component_no_data("violations_5yr"))

    if _COMPONENT_SOURCE["pfas_ucmr5"] in loaded:
        pfas_rows = await queries.pfas_readings_for_pws(pool, pws_id)
        samples = [
            PfasSample(r["contaminant"].upper(), float(r["value"]), r["sample_date"])
            for r in pfas_rows
        ]
        components.append(score_pfas(samples))
    else:
        components.append(component_no_data("pfas_ucmr5"))

    if _COMPONENT_SOURCE["lead_copper_90th_pct"] in loaded:
        lead_row = await queries.latest_lead_reading(pool, pws_id)
        if lead_row is None:
            components.append(component_no_data("lead_copper_90th_pct"))
        else:
            ppb = queries.lead_value_ppb(float(lead_row["value"]), lead_row["unit"])
            components.append(score_lead(ppb))
    else:
        components.append(component_no_data("lead_copper_90th_pct"))

    if _COMPONENT_SOURCE["enforcement_5yr"] in loaded:
        actions = await queries.enforcement_for_pws(pool, pws_id)
        records_e = [EnforcementRecord(a["action_type"], a["action_date"]) for a in actions]
        components.append(score_enforcement(records_e, as_of))
    else:
        components.append(component_no_data("enforcement_5yr"))

    if _COMPONENT_SOURCE["hardness"] in loaded and hardness_mg_l is not None:
        components.append(score_hardness(hardness_mg_l))
    else:
        components.append(component_no_data("hardness"))

    return components, composite_score(components)


def _score_json(
    components: list[ComponentScore],
    result: CompositeResult,
    per_utility: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "composite": result.composite,
        "scale": "0-100, higher is better",
        "methodology_version": METHODOLOGY_VERSION,
        "confidence": result.confidence,
        "missing_components": list(result.missing_components),
        "components": {c.name: _component_json(c) for c in components},
        "utilities": per_utility,
    }


async def _pfas_block(pool: DbPool, pws_id: str) -> dict[str, Any]:
    rows = await queries.pfas_readings_for_pws(pool, pws_id)
    latest: dict[str, Any] = {}
    for r in rows:  # rows are sample_date DESC; first hit per compound is latest
        latest.setdefault(r["contaminant"].upper(), r)
    compounds = []
    for upper_name, r in sorted(latest.items()):
        value = float(r["value"])
        mcl = PFAS_MCL_PPT.get(upper_name)
        compounds.append(
            {
                "name": r["contaminant"],
                "value_ppt": value,
                "epa_mcl_ppt": mcl,
                "exceeds_mcl": (value > mcl) if mcl is not None else None,
                "sample_date": r["sample_date"].isoformat(),
            }
        )
    return {
        "detected": any(c["value_ppt"] > 0 for c in compounds),
        "compounds": compounds,
    }


def _violation_json(r: Any) -> dict[str, Any]:
    return {
        "violation_id": r["violation_id"],
        "contaminant": r["contaminant"],
        "violation_type": r["violation_type"],
        "category": r["category"],
        "is_health_based": bool(r["is_health_based"]),
        "start_date": r["start_date"].isoformat(),
        "end_date": r["end_date"].isoformat() if r["end_date"] else None,
        "status": r["status"],
        "description": r["description"],
    }


async def _violations_block(pool: DbPool, pws_id: str, as_of: date) -> dict[str, Any]:
    rows = await queries.violations_for_pws(pool, pws_id)
    window_start = years_before(as_of, 5)  # leap-safe: bare .replace() dies on Feb 29
    in_window = [r for r in rows if r["start_date"] >= window_start]
    return {
        "count_5yr": len(in_window),
        "health_based_count": sum(1 for r in in_window if r["is_health_based"]),
        "latest": _violation_json(rows[0]) if rows else None,
    }


def _utility_json(row: Any, is_primary: bool) -> dict[str, Any]:
    return {
        "pws_id": row["pws_id"],
        "name": row["name"],
        "is_primary": is_primary,
        "population_served": row["population_served"],
        "source_type": row["source_type"],
        "county": row["county"],
    }


def _unsupported_region(zip_code: str, snapshots: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "zip": zip_code,
        "state": None,
        "coverage": "unsupported_region",
        "utilities": [],
        "score": None,
        "hardness": None,
        "pfas": None,
        "violations": None,
        "meta": _meta(snapshots),
    }


async def _hardness_value(pool: DbPool, zip_code: str) -> float | None:
    row = await queries.hardness_for_zip(pool, zip_code)
    return float(row["value_mg_l"]) if row is not None else None


def _hardness_json(value: float | None) -> dict[str, Any] | None:
    if value is None:
        return None
    return {"value_mg_l": value, "classification": hardness_classification(value)}


async def build_water_quality(pool: DbPool, zip_code: str) -> dict[str, Any]:
    """Flagship payload for GET /v1/water-quality/{zip}."""
    snapshots = await queries.current_snapshots(pool)
    utilities = await queries.utilities_for_zip(pool, zip_code)
    if not utilities:
        return _unsupported_region(zip_code, snapshots)

    as_of = datetime.now(UTC).date()
    hardness_mg_l = await _hardness_value(pool, zip_code)

    per_utility: list[dict[str, Any]] = []
    primary_components: list[ComponentScore] | None = None
    primary_result: CompositeResult | None = None
    for index, utility in enumerate(utilities):
        components, result = await _score_utility(
            pool, utility["pws_id"], snapshots, hardness_mg_l, as_of
        )
        per_utility.append(
            {
                "pws_id": utility["pws_id"],
                "composite": result.composite,
                "confidence": result.confidence,
            }
        )
        if index == 0:
            primary_components, primary_result = components, result
    assert primary_components is not None and primary_result is not None

    primary_id = utilities[0]["pws_id"]
    return {
        "zip": zip_code,
        "state": utilities[0]["state"],
        "coverage": "supported",
        "utilities": [_utility_json(u, i == 0) for i, u in enumerate(utilities)],
        "score": _score_json(primary_components, primary_result, per_utility),
        "hardness": _hardness_json(hardness_mg_l),
        "pfas": await _pfas_block(pool, primary_id),
        "violations": await _violations_block(pool, primary_id, as_of),
        "meta": _meta(snapshots),
    }


async def build_utility_detail(pool: DbPool, pws_id: str) -> dict[str, Any] | None:
    """Full utility payload for GET /v1/utilities/{pws_id}; None if unknown."""
    utility = await queries.utility_by_id(pool, pws_id)
    if utility is None:
        return None
    snapshots = await queries.current_snapshots(pool)
    as_of = datetime.now(UTC).date()
    components, result = await _score_utility(pool, pws_id, snapshots, None, as_of)
    violations = await queries.violations_for_pws(pool, pws_id)
    readings = await queries.readings_for_pws(pool, pws_id)
    reports = await queries.ccr_reports_for_pws(pool, pws_id)
    return {
        "pws_id": utility["pws_id"],
        "name": utility["name"],
        "state": utility["state"],
        "county": utility["county"],
        "population_served": utility["population_served"],
        "source_type": utility["source_type"],
        "status": utility["status"],
        "zip_codes": await queries.zips_for_utility(pool, pws_id),
        "score": _score_json(components, result, []),
        "violations": [_violation_json(v) for v in violations],
        "contaminants": [
            {
                "contaminant": r["contaminant"],
                "value": float(r["value"]),
                "unit": r["unit"],
                "sample_date": r["sample_date"].isoformat(),
                "sample_point": r["sample_point"],
                "method": r["method"],
                "epa_limit": float(r["epa_limit"]) if r["epa_limit"] is not None else None,
                "ewg_limit": float(r["ewg_limit"]) if r["ewg_limit"] is not None else None,
                "national_avg": (
                    float(r["national_avg"]) if r["national_avg"] is not None else None
                ),
            }
            for r in readings
        ],
        "ccr_reports": [
            {
                "year": r["year"],
                "report_url": r["report_url"],
                "report_type": r["report_type"],
                "notes": r["notes"],
            }
            for r in reports
        ],
        "meta": _meta(snapshots),
    }


async def build_hardness(pool: DbPool, zip_code: str) -> dict[str, Any]:
    """Lightweight payload for GET /v1/hardness/{zip}."""
    snapshots = await queries.current_snapshots(pool)
    utilities = await queries.utilities_for_zip(pool, zip_code)
    value = await _hardness_value(pool, zip_code)
    coverage = "supported" if utilities else "unsupported_region"
    return {
        "zip": zip_code,
        "coverage": coverage,
        "hardness": _hardness_json(value),
        "data_status": "ok" if value is not None else "no_data",
        "meta": _meta(snapshots),
    }


async def build_coverage(pool: DbPool) -> dict[str, Any]:
    """Public payload for GET /v1/coverage."""
    snapshots = await queries.current_snapshots(pool)
    summary = await queries.coverage_summary(pool)
    return {
        "states": summary["states"],
        "zip_count": summary["zip_count"],
        "meta": _meta(snapshots),
    }
