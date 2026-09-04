"""Composite water-quality score, methodology v1.0 (approved 2026-08-09).

Pure functions only — no I/O. The service layer supplies source rows and
decides ``no_data`` (a source that was never ingested), which is distinct
from a loaded source with zero rows for a utility (that IS data: e.g. zero
violations scores 100). See docs/methodology.md for the approved curves.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Final, Literal

METHODOLOGY_VERSION: Final = "1.0"

WEIGHTS: Final[dict[str, float]] = {
    "violations_5yr": 0.30,
    "pfas_ucmr5": 0.30,
    "lead_copper_90th_pct": 0.20,
    "enforcement_5yr": 0.10,
    "hardness": 0.10,
}
assert math.isclose(sum(WEIGHTS.values()), 1.0)

PFAS_MCL_PPT: Final[dict[str, float]] = {
    "PFOA": 4.0,
    "PFOS": 4.0,
    "PFHXS": 10.0,
    "PFNA": 10.0,
    "HFPO-DA": 10.0,
}

LEAD_ACTION_LEVEL_PPB: Final = 15.0

ComponentStatus = Literal["scored", "no_data"]
Confidence = Literal["full", "partial", "insufficient_data"]


@dataclass(frozen=True)
class ViolationRecord:
    is_health_based: bool
    start_date: date
    is_ongoing: bool


@dataclass(frozen=True)
class PfasSample:
    compound: str
    value_ppt: float
    sample_date: date


@dataclass(frozen=True)
class EnforcementRecord:
    action_type: Literal["formal", "informal"]
    action_date: date


@dataclass(frozen=True)
class ComponentScore:
    name: str
    status: ComponentStatus
    score: float | None
    detail: dict[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        assert self.name in WEIGHTS, f"unknown component {self.name}"
        if self.status == "scored":
            assert self.score is not None and 0.0 <= self.score <= 100.0
        else:
            assert self.score is None


@dataclass(frozen=True)
class CompositeResult:
    composite: int | None
    confidence: Confidence
    missing_components: tuple[str, ...]
    applied_weights: dict[str, float]


def component_no_data(name: str) -> ComponentScore:
    """The source behind this component has never been ingested."""
    return ComponentScore(name=name, status="no_data", score=None)


def years_before(as_of: date, years: int) -> date:
    """Leap-safe year subtraction (Feb 29 maps to Feb 28)."""
    try:
        return as_of.replace(year=as_of.year - years)
    except ValueError:  # Feb 29 -> Feb 28
        return as_of.replace(year=as_of.year - years, day=28)


def score_violations(violations: Sequence[ViolationRecord], as_of: date) -> ComponentScore:
    """100 minus 25/health-based, 8/other, extra 10 if ongoing; floor 0."""
    window_start = years_before(as_of, 5)
    in_window = [v for v in violations if v.start_date >= window_start]
    deduction = sum(25 if v.is_health_based else 8 for v in in_window)
    deduction += 10 * sum(1 for v in in_window if v.is_ongoing)
    score = float(max(0, 100 - deduction))
    return ComponentScore(
        name="violations_5yr",
        status="scored",
        score=score,
        detail={
            "window_start": window_start.isoformat(),
            "count_5yr": len(in_window),
            "health_based_count": sum(1 for v in in_window if v.is_health_based),
            "ongoing_count": sum(1 for v in in_window if v.is_ongoing),
        },
    )


def _latest_per_compound(samples: Sequence[PfasSample]) -> dict[str, PfasSample]:
    latest: dict[str, PfasSample] = {}
    for sample in samples:
        current = latest.get(sample.compound)
        if current is None or sample.sample_date > current.sample_date:
            latest[sample.compound] = sample
    return latest


def score_pfas(samples: Sequence[PfasSample]) -> ComponentScore:
    """No detections: 100. r = max(value/MCL): r<=1 -> 100..60; r<=5 -> 60..0."""
    latest = _latest_per_compound(samples)
    detected = {c: s for c, s in latest.items() if s.value_ppt > 0}
    ratios = {
        c: s.value_ppt / PFAS_MCL_PPT[c] for c, s in detected.items() if c in PFAS_MCL_PPT
    }
    detail: dict[str, object] = {
        "detected_compounds": sorted(detected),
        "compounds_without_mcl": sorted(set(detected) - set(PFAS_MCL_PPT)),
    }
    if not ratios:
        return ComponentScore("pfas_ucmr5", "scored", 100.0, detail)
    worst = max(ratios.values())
    detail["max_mcl_ratio"] = round(worst, 4)
    if worst <= 1.0:
        score = 100.0 - 40.0 * worst
    elif worst <= 5.0:
        score = 60.0 - 60.0 * (worst - 1.0) / 4.0
    else:
        score = 0.0
    return ComponentScore("pfas_ucmr5", "scored", score, detail)


def score_lead(p90_ppb: float) -> ComponentScore:
    """0 ppb: 100; linear to 50 at the 15 ppb action level; 0 at 30 ppb."""
    assert p90_ppb >= 0
    action = LEAD_ACTION_LEVEL_PPB
    if p90_ppb <= action:
        score = 100.0 - 50.0 * p90_ppb / action
    elif p90_ppb <= 2 * action:
        score = 50.0 - 50.0 * (p90_ppb - action) / action
    else:
        score = 0.0
    return ComponentScore(
        "lead_copper_90th_pct",
        "scored",
        score,
        {"p90_ppb": p90_ppb, "action_level_ppb": action},
    )


def score_enforcement(actions: Sequence[EnforcementRecord], as_of: date) -> ComponentScore:
    """100 minus 35/formal and 15/informal in the trailing 5 years; floor 0."""
    window_start = years_before(as_of, 5)
    in_window = [a for a in actions if a.action_date >= window_start]
    formal = sum(1 for a in in_window if a.action_type == "formal")
    informal = len(in_window) - formal
    score = float(max(0, 100 - 35 * formal - 15 * informal))
    return ComponentScore(
        "enforcement_5yr",
        "scored",
        score,
        {"formal_count": formal, "informal_count": informal},
    )


def hardness_classification(value_mg_l: float) -> str:
    assert value_mg_l >= 0
    if value_mg_l <= 60:
        return "soft"
    if value_mg_l <= 120:
        return "moderately_hard"
    if value_mg_l <= 180:
        return "hard"
    return "very_hard"


def score_hardness(value_mg_l: float) -> ComponentScore:
    """USGS bands: <=60:100, <=120:85, <=180:70, <=250:55, else 40."""
    assert value_mg_l >= 0
    if value_mg_l <= 60:
        score = 100.0
    elif value_mg_l <= 120:
        score = 85.0
    elif value_mg_l <= 180:
        score = 70.0
    elif value_mg_l <= 250:
        score = 55.0
    else:
        score = 40.0
    return ComponentScore(
        "hardness",
        "scored",
        score,
        {"value_mg_l": value_mg_l, "classification": hardness_classification(value_mg_l)},
    )


def composite_score(components: Sequence[ComponentScore]) -> CompositeResult:
    """Renormalize weights over scored components (approved missing-data policy)."""
    names = [c.name for c in components]
    assert sorted(names) == sorted(WEIGHTS), f"expected all 5 components, got {names}"
    scored = [c for c in components if c.status == "scored"]
    missing = tuple(sorted(c.name for c in components if c.status == "no_data"))
    if len(scored) < 2:
        return CompositeResult(None, "insufficient_data", missing, {})
    weight_sum = sum(WEIGHTS[c.name] for c in scored)
    assert weight_sum > 0
    applied = {c.name: WEIGHTS[c.name] / weight_sum for c in scored}
    total = sum(c.score * applied[c.name] for c in scored if c.score is not None)
    confidence: Confidence = "full" if not missing else "partial"
    result = CompositeResult(round(total), confidence, missing, applied)
    assert result.composite is not None and 0 <= result.composite <= 100
    return result
