import type { CategoryScore, ScoringReading } from "./types";
import { clampScore, riskFromScore } from "./grade";

function scorePfasValue(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 100;
  if (value < 1) return 100;
  if (value < 4) return 80;
  if (value < 10) return 60;
  if (value < 20) return 40;
  return 20;
}

function latestValue(readings: ScoringReading[], contaminant: "PFOS" | "PFOA"): number | null {
  const matches = readings
    .filter(r => r.contaminant === contaminant && Number.isFinite(r.value))
    .sort((a, b) => (b.sampleDate ?? "").localeCompare(a.sampleDate ?? ""));
  return matches[0]?.value ?? null;
}

export function calculatePfasScore(readings: ScoringReading[]): CategoryScore {
  const pfos = latestValue(readings, "PFOS");
  const pfoa = latestValue(readings, "PFOA");
  const score = clampScore((scorePfasValue(pfos) + scorePfasValue(pfoa)) / 2);
  const parts = [
    pfos == null ? "PFOS unavailable" : `PFOS ${pfos} ppt`,
    pfoa == null ? "PFOA unavailable" : `PFOA ${pfoa} ppt`,
  ];

  return {
    score,
    risk: riskFromScore(score),
    label: "PFAS Risk",
    explanation: `${parts.join(" · ")}. Score uses AquaWatch v1 PFAS bands and treats readings above 4 ppt as benchmark exceedances unless official violation status is verified.`,
  };
}
