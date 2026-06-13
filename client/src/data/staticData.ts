/**
 * Static data layer — all read-only data is bundled at build time.
 * POST endpoints (alerts, leads) still go to the live server.
 *
 * JSON files use snake_case (DB column names).
 * This module re-exports everything in camelCase to match the Dashboard/CCR type interfaces.
 *
 * Provenance model:
 * - sourceConfidence explains how trustworthy a value is right now.
 * - sourceType explains where the value came from.
 * - verificationStatus prevents AquaWatch-generated intelligence from being confused with official regulatory findings.
 */
import waterSystemsRaw from "./waterSystems.json";
import readingsRaw from "./readings.json";
import violationsRaw from "./violations.json";
import zipCcrRaw from "./zipCcr.json";
import ccrReportsRaw from "./ccrReports.json";

// ── Provenance Types ─────────────────────────────────────────────

export type SourceConfidence =
  | "official_ccr"
  | "official_sdwis"
  | "official_ucmr5"
  | "aquawatch_dataset"
  | "inferred"
  | "unverified";

export type SourceType =
  | "ccr"
  | "sdwis"
  | "ucmr5"
  | "aquawatch"
  | "inferred"
  | "unknown";

export type VerificationStatus =
  | "unverified"
  | "needs_review"
  | "source_linked"
  | "cross_verified";

const DEFAULT_PROVENANCE = {
  sourceConfidence: "aquawatch_dataset" as SourceConfidence,
  sourceType: "aquawatch" as SourceType,
  verificationStatus: "needs_review" as VerificationStatus,
  lastVerified: null as string | null,
};

// ── Camel-cased types (match existing component interfaces) ────

export interface WaterSystem {
  id: number; pwsid: string; name: string; zipCodes: string;
  city: string; county: string; populationServed: number;
  sourceType: string; status: string;
  sourceConfidence?: SourceConfidence;
  dataSourceType?: SourceType;
  verificationStatus?: VerificationStatus;
  lastVerified?: string | null;
}

export interface Reading {
  id: number; pwsid: string; contaminant: string; value: number;
  unit: string; sampleDate: string; samplePoint: string | null;
  method: string | null; epaLimit: number | null;
  ewgLimit: number | null; nationalAvg: number | null;
  sourceConfidence?: SourceConfidence;
  sourceType?: SourceType;
  verificationStatus?: VerificationStatus;
  lastVerified?: string | null;
}

export interface Violation {
  id: number; pwsid: string; violationId: string; contaminant: string;
  violationType: string; category: string; isHealthBased: number;
  startDate: string; endDate: string | null; status: string;
  description: string | null;
  sourceConfidence?: SourceConfidence;
  sourceType?: SourceType;
  verificationStatus?: VerificationStatus;
  lastVerified?: string | null;
}

export interface ZipCcrEntry {
  id: number; zipCode: string; city: string; utilityName: string;
  pwsid: string | null; latestYear: number; latestReportUrl: string;
  latestReportType: string; priorYear: number | null;
  priorReportUrl: string | null; pfosLevel: number | null;
  pfoa_level: number | null; // kept for compat
  pfoaLevel: number | null; violationCount: number; notes: string | null;
  sourceConfidence?: SourceConfidence;
  sourceType?: SourceType;
  verificationStatus?: VerificationStatus;
  lastVerified?: string | null;
}

// ── Map snake_case → camelCase ──────────────────────────────────

function withProvenance(r: any) {
  return {
    sourceConfidence: r.source_confidence ?? DEFAULT_PROVENANCE.sourceConfidence,
    sourceType: r.source_type_detail ?? r.data_source_type ?? DEFAULT_PROVENANCE.sourceType,
    verificationStatus: r.verification_status ?? DEFAULT_PROVENANCE.verificationStatus,
    lastVerified: r.last_verified ?? DEFAULT_PROVENANCE.lastVerified,
  };
}

export const waterSystems: WaterSystem[] = (waterSystemsRaw as any[]).map(r => ({
  id: r.id,
  pwsid: r.pwsid,
  name: r.name,
  zipCodes: r.zip_codes,
  city: r.city,
  county: r.county,
  populationServed: r.population_served,
  sourceType: r.source_type,
  status: r.status,
  sourceConfidence: r.source_confidence ?? DEFAULT_PROVENANCE.sourceConfidence,
  dataSourceType: r.data_source_type ?? DEFAULT_PROVENANCE.sourceType,
  verificationStatus: r.verification_status ?? DEFAULT_PROVENANCE.verificationStatus,
  lastVerified: r.last_verified ?? DEFAULT_PROVENANCE.lastVerified,
}));

export const readings: Reading[] = (readingsRaw as any[]).map(r => ({
  id: r.id,
  pwsid: r.pwsid,
  contaminant: r.contaminant,
  value: r.value,
  unit: r.unit,
  sampleDate: r.sample_date,
  samplePoint: r.sample_point,
  method: r.method,
  epaLimit: r.epa_limit,
  ewgLimit: r.ewg_limit,
  nationalAvg: r.national_avg,
  ...withProvenance(r),
}));

export const violations: Violation[] = (violationsRaw as any[]).map(r => ({
  id: r.id,
  pwsid: r.pwsid,
  violationId: r.violation_id,
  contaminant: r.contaminant,
  violationType: r.violation_type,
  category: r.category,
  isHealthBased: r.is_health_based,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
  description: r.description,
  ...withProvenance(r),
}));

export const zipCcr: ZipCcrEntry[] = (zipCcrRaw as any[]).map(r => ({
  id: r.id,
  zipCode: r.zip_code,
  city: r.city,
  utilityName: r.utility_name,
  pwsid: r.pwsid,
  latestYear: r.latest_year,
  latestReportUrl: r.latest_report_url,
  latestReportType: r.latest_report_type,
  priorYear: r.prior_year,
  priorReportUrl: r.prior_report_url,
  pfosLevel: r.pfos_level,
  pfoa_level: r.pfoa_level,
  pfoaLevel: r.pfoa_level,
  violationCount: r.violation_count,
  notes: r.notes,
  ...withProvenance(r),
}));

export const ccrReports = (ccrReportsRaw as any[]).map(r => ({
  ...r,
  source_confidence: r.source_confidence ?? DEFAULT_PROVENANCE.sourceConfidence,
  data_source_type: r.data_source_type ?? "ccr",
  verification_status: r.verification_status ?? "source_linked",
  last_verified: r.last_verified ?? null,
}));

// ── Query helpers (all synchronous) ────────────────────────────

export function getWaterSystems(zip?: string): WaterSystem[] {
  if (!zip || zip === "all") return waterSystems;
  return waterSystems.filter(s => {
    try {
      const zips: string[] = JSON.parse(s.zipCodes);
      return zips.includes(zip);
    } catch { return false; }
  });
}

export function getReadings(opts: {
  pwsid?: string; contaminant?: string; zip?: string;
  from?: string; to?: string;
} = {}): Reading[] {
  let data = readings;
  if (opts.zip && opts.zip !== "all") {
    const systems = getWaterSystems(opts.zip);
    const pwsids = systems.map(s => s.pwsid);
    data = data.filter(r => pwsids.includes(r.pwsid));
  } else if (opts.pwsid) {
    data = data.filter(r => r.pwsid === opts.pwsid);
  }
  if (opts.contaminant && opts.contaminant !== "all") {
    data = data.filter(r => r.contaminant === opts.contaminant);
  }
  if (opts.from) data = data.filter(r => r.sampleDate >= opts.from!);
  if (opts.to) data = data.filter(r => r.sampleDate <= opts.to!);
  return data;
}

export function getTrends(pwsid: string, contaminant: string): Reading[] {
  return readings
    .filter(r => r.pwsid === pwsid && r.contaminant === contaminant)
    .sort((a, b) => a.sampleDate.localeCompare(b.sampleDate));
}

export function getViolations(opts: { pwsid?: string; zip?: string } = {}): Violation[] {
  if (opts.zip && opts.zip !== "all") {
    const systems = getWaterSystems(opts.zip);
    const pwsids = systems.map(s => s.pwsid);
    return violations.filter(v => pwsids.includes(v.pwsid));
  }
  if (opts.pwsid) return violations.filter(v => v.pwsid === opts.pwsid);
  return violations;
}

export function getBenchmarks(contaminant: string) {
  const r = readings.find(x => x.contaminant === contaminant);
  return {
    nationalAvg: r?.nationalAvg ?? 0,
    epaLimit: r?.epaLimit ?? 0,
    ewgLimit: r?.ewgLimit ?? 0,
  };
}

export function getSummary(zip?: string) {
  const effectiveZip = (!zip || zip === "all") ? undefined : zip;
  const systems = getWaterSystems(effectiveZip);
  const allViolations = getViolations({ zip: effectiveZip });
  const allReadings = getReadings({ zip: effectiveZip });
  const activeViolations = allViolations.filter(v => v.status === "Ongoing");
  const pfosReadings = allReadings.filter(r => r.contaminant === "PFOS").sort((a, b) => b.sampleDate.localeCompare(a.sampleDate));
  const pfoaReadings = allReadings.filter(r => r.contaminant === "PFOA").sort((a, b) => b.sampleDate.localeCompare(a.sampleDate));
  // Separate true regulatory violations (MCL, TT, MR) from benchmark exceedances
  const regulatoryViolations = allViolations.filter(v => v.violationType !== "BENCHMARK");
  const benchmarkExceedances = allViolations.filter(v => v.violationType === "BENCHMARK");
  const activeRegulatory = regulatoryViolations.filter(v => v.status === "Ongoing");
  const activeBenchmarks = benchmarkExceedances.filter(v => v.status === "Ongoing");

  return {
    systemCount: systems.length,
    populationServed: systems.reduce((s, x) => s + x.populationServed, 0),
    // "activeViolations" in the summary = all unresolved entries (regulatory + benchmark)
    // Dashboard KPI card now labels these "PFAS Exceedances" for clarity
    activeViolations: activeViolations.length,
    totalViolations: allViolations.length,
    healthBasedViolations: allViolations.filter(v => v.isHealthBased === 1).length,
    // Separate counts for accurate display
    activeRegulatoryViolations: activeRegulatory.length,
    activeBenchmarkExceedances: activeBenchmarks.length,
    latestPFOS: pfosReadings[0]?.value ?? 0,
    latestPFOA: pfoaReadings[0]?.value ?? 0,
    pfosEPALimit: 4,
    pfoaEPALimit: 4,
    exceedanceCount: allReadings.filter(r => r.epaLimit !== null && r.value > (r.epaLimit ?? 0)).length,
    lastUpdated: new Date().toISOString(),
  };
}

export function getZipCcr(zip?: string): ZipCcrEntry[] {
  if (zip) return zipCcr.filter(z => z.zipCode === zip);
  return zipCcr;
}
