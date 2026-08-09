"""Response models. These render the OpenAPI docs — descriptions matter."""

from typing import Any

from pydantic import BaseModel, Field


class Utility(BaseModel):
    pws_id: str = Field(description="EPA Public Water System ID, e.g. FL4004801.")
    name: str = Field(description="Utility name as reported in its CCR.")
    is_primary: bool = Field(
        description="True for the largest utility serving this ZIP (by population served). "
        "The top-level score reflects the primary utility."
    )
    population_served: int = Field(description="Population served, from the latest snapshot.")
    source_type: str | None = Field(
        default=None, description="Water source: GW (groundwater), SW (surface water), GWP."
    )
    county: str | None = Field(default=None, description="County of the utility's service area.")


class PerUtilityScore(BaseModel):
    pws_id: str = Field(description="Utility this score belongs to.")
    composite: int | None = Field(
        description="0-100 composite for this utility; null if insufficient data."
    )
    confidence: str = Field(description="full | partial | insufficient_data.")


class ScoreBlock(BaseModel):
    composite: int | None = Field(
        description="Composite score of the primary utility, 0-100, higher is better. "
        "Null when fewer than two components have data."
    )
    scale: str = Field(description="Human-readable scale reminder.")
    methodology_version: str = Field(
        description="Version of docs/methodology.md used. Any change to weights or "
        "curves increments this."
    )
    confidence: str = Field(
        description="full = all five components scored; partial = some components had "
        "no ingested source (weights renormalized); insufficient_data = composite withheld."
    )
    missing_components: list[str] = Field(
        description="Components reported as no_data and excluded from the composite."
    )
    components: dict[str, dict[str, Any]] = Field(
        description="Per-component score, weight, and traceable detail (counts, ratios, "
        "sample dates) for the primary utility."
    )
    utilities: list[PerUtilityScore] = Field(
        description="Composite per utility when a ZIP is served by more than one."
    )


class HardnessBlock(BaseModel):
    value_mg_l: float = Field(description="Hardness as CaCO3, mg/L.")
    classification: str = Field(
        description="USGS band: soft | moderately_hard | hard | very_hard."
    )


class PfasCompound(BaseModel):
    name: str = Field(description="Compound name as reported by the source row.")
    value_ppt: float = Field(description="Most recent sample value, parts per trillion.")
    epa_mcl_ppt: float | None = Field(
        description="EPA MCL for this compound in ppt; null if no MCL exists."
    )
    exceeds_mcl: bool | None = Field(
        description="True if the latest value exceeds the EPA MCL; null when no MCL."
    )
    sample_date: str = Field(description="Sample date of the value shown (ISO 8601).")


class PfasBlock(BaseModel):
    detected: bool = Field(description="True if any PFAS compound was detected (> 0).")
    compounds: list[PfasCompound] = Field(description="Latest reading per compound.")


class ViolationItem(BaseModel):
    violation_id: str = Field(description="Source violation identifier.")
    contaminant: str | None = Field(description="Contaminant involved, when applicable.")
    violation_type: str = Field(description="MCL, MR, TT, or BENCHMARK.")
    category: str = Field(description="Source category, e.g. Health Benchmark Exceedance.")
    is_health_based: bool = Field(description="True for health-based violations.")
    start_date: str = Field(description="Violation start date (ISO 8601).")
    end_date: str | None = Field(description="Resolution date; null while ongoing.")
    status: str = Field(description="Resolved | Ongoing | Archived.")
    description: str | None = Field(description="Narrative from the source, if any.")


class ViolationsBlock(BaseModel):
    count_5yr: int = Field(description="Violations starting in the trailing 5 years.")
    health_based_count: int = Field(description="Of those, how many are health-based.")
    latest: ViolationItem | None = Field(description="Most recent violation on record.")


class Meta(BaseModel):
    sources: list[str] = Field(
        description="Loaded snapshot per source with its snapshot date — read live from "
        "the snapshot registry, never hardcoded."
    )
    disclaimer: str = Field(description="Usage disclaimer; include when displaying data.")
    generated_at: str = Field(description="When this payload was generated (UTC).")


class WaterQualityResponse(BaseModel):
    zip: str = Field(description="The requested 5-digit ZIP code.")
    state: str | None = Field(
        description="Two-letter state of the serving utilities; null outside coverage."
    )
    coverage: str = Field(description="supported | unsupported_region.")
    utilities: list[Utility] = Field(
        description="All public water systems serving this ZIP, largest first."
    )
    score: ScoreBlock | None = Field(description="Null outside coverage.")
    hardness: HardnessBlock | None = Field(
        description="ZIP-level hardness; null when the hardness layer has no row."
    )
    pfas: PfasBlock | None = Field(description="Null outside coverage.")
    violations: ViolationsBlock | None = Field(description="Null outside coverage.")
    meta: Meta


class ContaminantReading(BaseModel):
    contaminant: str
    value: float
    unit: str = Field(description="ppt, ppb, or ppm as reported by the source.")
    sample_date: str
    sample_point: str | None
    method: str | None = Field(description="Lab method, e.g. EPA Method 537.1.")
    epa_limit: float | None = Field(description="EPA MCL / action level in the same unit.")
    ewg_limit: float | None = Field(description="EWG health guideline in the same unit.")
    national_avg: float | None


class CcrReport(BaseModel):
    year: int
    report_url: str
    report_type: str = Field(description="PDF or PAGE.")
    notes: str | None


class UtilityDetailResponse(BaseModel):
    pws_id: str
    name: str
    state: str
    county: str | None
    population_served: int
    source_type: str | None
    status: str
    zip_codes: list[str] = Field(description="All ZIPs this utility serves.")
    score: ScoreBlock
    violations: list[ViolationItem] = Field(description="Full violation history, newest first.")
    contaminants: list[ContaminantReading] = Field(description="Full contaminant table.")
    ccr_reports: list[CcrReport]
    meta: Meta


class HardnessResponse(BaseModel):
    zip: str
    coverage: str = Field(description="supported | unsupported_region.")
    hardness: HardnessBlock | None = Field(description="Null when no hardness row exists.")
    data_status: str = Field(description="ok | no_data.")
    meta: Meta


class CoverageState(BaseModel):
    state: str
    utility_count: int


class CoverageResponse(BaseModel):
    states: list[CoverageState]
    zip_count: int = Field(description="Distinct ZIP codes with at least one mapped utility.")
    meta: Meta


class HealthResponse(BaseModel):
    status: str = Field(description="ok | degraded.")
    checks: dict[str, str] = Field(description="Per-dependency check result.")


class SignupRequest(BaseModel):
    email: str = Field(description="Where invoices and service notices go.")
    product_code: str = Field(default="free", description="free | starter | pro.")


class SignupResponse(BaseModel):
    key_id: str = Field(description="Stable identifier for this key.")
    api_key: str | None = Field(
        description="The raw API key — shown exactly once, only stored hashed. "
        "Null for paid tiers until checkout completes."
    )
    product_code: str
    checkout_url: str | None = Field(
        description="Stripe Checkout link for paid tiers; null for the free tier."
    )
    note: str


class ErrorResponse(BaseModel):
    error: str = Field(description="Stable machine-readable error code.")
    detail: str = Field(description="Human-readable explanation.")
