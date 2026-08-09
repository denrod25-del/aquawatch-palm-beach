"""Score function vs 5 hand-computed fixtures (test plan item 1).

Every expected value below is derived by hand from docs/methodology.md; the
arithmetic is shown in comments so a reviewer can re-check without running code.
"""

from datetime import date

from aquadata.core.scoring import (
    ComponentScore,
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
)

AS_OF = date(2026, 8, 1)


def _all_five(
    violations: ComponentScore,
    pfas: ComponentScore,
    lead: ComponentScore,
    enforcement: ComponentScore,
    hardness: ComponentScore,
) -> list[ComponentScore]:
    return [violations, pfas, lead, enforcement, hardness]


def test_fixture_1_clean_utility_full_data() -> None:
    """viol 100, pfas 100, lead p90=3 -> 100-50*3/15=90, enf 100, hard 100mg/L -> 85.
    composite = .3*100 + .3*100 + .2*90 + .1*100 + .1*85 = 96.5 -> round -> 96
    (Python banker's rounding: round(96.5) == 96)."""
    result = composite_score(
        _all_five(
            score_violations([], AS_OF),
            score_pfas([]),
            score_lead(3.0),
            score_enforcement([], AS_OF),
            score_hardness(100.0),
        )
    )
    assert result.composite == 96
    assert result.confidence == "full"
    assert result.missing_components == ()


def test_fixture_2_pbcwud_like_partial_data() -> None:
    """viol: 1 health-based ongoing -> 100-25-10=65.
    pfas: PFOS 7.2 ppt, MCL 4 -> r=1.8 -> 60 - 60*(0.8)/4 = 48.
    lead: p90=2 -> 100 - 50*2/15 = 93.3333...
    enforcement + hardness: no_data -> weights renormalize over 0.8.
    composite = (.3*65 + .3*48 + .2*93.33333)/0.8 = 52.566667/0.8 = 65.7083 -> 66."""
    result = composite_score(
        _all_five(
            score_violations(
                [ViolationRecord(True, date(2024, 11, 6), is_ongoing=True)],
                AS_OF,
            ),
            score_pfas([PfasSample("PFOS", 7.2, date(2026, 1, 15))]),
            score_lead(2.0),
            component_no_data("enforcement_5yr"),
            component_no_data("hardness"),
        )
    )
    assert result.composite == 66
    assert result.confidence == "partial"
    assert result.missing_components == ("enforcement_5yr", "hardness")
    assert abs(sum(result.applied_weights.values()) - 1.0) < 1e-9


def test_fixture_3_severe_utility_full_data() -> None:
    """viol: 3 health-based, 2 ongoing -> 100 - 3*25 - 2*10 = 5.
    pfas: PFOA 24 ppt -> r=6 > 5 -> 0.
    lead: p90=20 -> 50 - 50*(5)/15 = 33.3333...
    enforcement: 1 formal -> 65.  hardness: 300 -> 40.
    composite = .3*5 + 0 + .2*33.33333 + .1*65 + .1*40 = 18.6667 -> 19."""
    violations = [
        ViolationRecord(True, date(2023, 1, 1), is_ongoing=True),
        ViolationRecord(True, date(2024, 6, 1), is_ongoing=True),
        ViolationRecord(True, date(2025, 2, 1), is_ongoing=False),
    ]
    result = composite_score(
        _all_five(
            score_violations(violations, AS_OF),
            score_pfas([PfasSample("PFOA", 24.0, date(2025, 7, 1))]),
            score_lead(20.0),
            score_enforcement([EnforcementRecord("formal", date(2024, 1, 1))], AS_OF),
            score_hardness(300.0),
        )
    )
    assert result.composite == 19
    assert result.confidence == "full"


def test_fixture_4_insufficient_data() -> None:
    """Only one scored component -> composite None, insufficient_data."""
    result = composite_score(
        _all_five(
            score_violations([], AS_OF),
            component_no_data("pfas_ucmr5"),
            component_no_data("lead_copper_90th_pct"),
            component_no_data("enforcement_5yr"),
            component_no_data("hardness"),
        )
    )
    assert result.composite is None
    assert result.confidence == "insufficient_data"
    assert result.applied_weights == {}


def test_fixture_5_exact_boundaries() -> None:
    """PFOA exactly at MCL (r=1) -> 60; lead exactly at action level -> 50;
    hardness exactly 60 -> 100 (soft band edge).
    composite = .3*100 + .3*60 + .2*50 + .1*100 + .1*100 = 78."""
    result = composite_score(
        _all_five(
            score_violations([], AS_OF),
            score_pfas([PfasSample("PFOA", 4.0, date(2026, 1, 1))]),
            score_lead(15.0),
            score_enforcement([], AS_OF),
            score_hardness(60.0),
        )
    )
    assert result.composite == 78
    assert result.confidence == "full"


def test_violation_outside_5yr_window_ignored() -> None:
    old = ViolationRecord(True, date(2021, 7, 31), is_ongoing=False)  # window starts 2021-08-01
    edge = ViolationRecord(True, date(2021, 8, 1), is_ongoing=False)
    assert score_violations([old], AS_OF).score == 100.0
    assert score_violations([edge], AS_OF).score == 75.0


def test_pfas_uses_latest_sample_per_compound() -> None:
    """An older, higher PFOS reading must not override the latest one."""
    samples = [
        PfasSample("PFOS", 18.0, date(2020, 1, 1)),
        PfasSample("PFOS", 2.0, date(2026, 1, 1)),  # r=0.5 -> 100-20=80
    ]
    component = score_pfas(samples)
    assert component.score == 80.0


def test_pfas_compound_without_mcl_is_reported_not_scored() -> None:
    component = score_pfas([PfasSample("PFBS", 12.0, date(2026, 1, 1))])
    assert component.score == 100.0
    assert component.detail["compounds_without_mcl"] == ["PFBS"]


def test_hardness_classification_bands() -> None:
    assert hardness_classification(0) == "soft"
    assert hardness_classification(60) == "soft"
    assert hardness_classification(61) == "moderately_hard"
    assert hardness_classification(120) == "moderately_hard"
    assert hardness_classification(180) == "hard"
    assert hardness_classification(181) == "very_hard"
    assert hardness_classification(400) == "very_hard"


def test_scores_never_leave_bounds() -> None:
    assert score_violations([ViolationRecord(True, AS_OF, True)] * 10, AS_OF).score == 0.0
    assert score_enforcement([EnforcementRecord("formal", AS_OF)] * 5, AS_OF).score == 0.0
    assert score_lead(1000.0).score == 0.0
