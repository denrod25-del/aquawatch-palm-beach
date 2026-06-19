import type { CategoryScore, ScoringReading } from "./types";
import { clampScore, riskFromScore } from "./grade";

function latest(readings: ScoringReading[], names: string[]): ScoringReading | null {
  const normalized = names.map(n => n.toLowerCase());
  const matches = readings
    .filter(r => normalized.some(n => r.contaminant.toLowerCase().includes(n)))
    .filter(r => Number.isFinite(r.value))
    .sort((a, b) => (b.sampleDate ?? "").localeCompare(a.sampleDate ?? ""));
  return matches[0] ?? null;
}

export function calculateLeadScore(readings: ScoringReading[]): CategoryScore {
  const reading = latest(readings, ["lead"]);
  const value = reading?.value ?? null;
  // Data may be stored as ppt in AquaWatch; convert to ppb for lead scoring when needed.
  const ppb = value == null ? null : reading?.unit === "ppt" ? value / 1000 : value;
  let score = 100;
  if (ppb != null) {
    if (ppb < 5) score = 100;
    else if (ppb < 10) score = 80;
    else if (ppb < 15) score = 60;
    else score = 30;
  }
  score = clampScore(score);
  return {
    score,
    risk: riskFromScore(score),
    label: "Lead Risk",
    explanation: ppb == null ? "No lead reading found in the current dataset." : `Latest lead reading: ${ppb.toFixed(2)} ppb.`,
  };
}

export function calculateNitrateScore(readings: ScoringReading[]): CategoryScore {
  const reading = latest(readings, ["nitrate"]);
  const value = reading?.value ?? null;
  // Data may be stored as ppb; convert to mg/L because nitrate MCL is usually expressed as mg/L.
  const mgL = value == null ? null : reading?.unit === "ppb" ? value / 1000 : value;
  let score = 100;
  if (mgL != null) {
    if (mgL < 1) score = 100;
    else if (mgL < 5) score = 80;
    else if (mgL < 10) score = 60;
    else score = 20;
  }
  score = clampScore(score);
  return {
    score,
    risk: riskFromScore(score),
    label: "Nitrate Risk",
    explanation: mgL == null ? "No nitrate reading found in the current dataset." : `Latest nitrate reading: ${mgL.toFixed(2)} mg/L.`,
  };
}

export function calculateDbpScore(readings: ScoringReading[]): CategoryScore {
  const tthm = latest(readings, ["tthm", "trihalomethane", "chloroform"]);
  const haa5 = latest(readings, ["haa5", "haloacetic"]);
  const scores: number[] = [];

  for (const reading of [tthm, haa5]) {
    if (!reading) continue;
    const limit = reading.epaLimit ?? (reading.contaminant.toLowerCase().includes("haa") ? 60 : 80);
    const ratio = limit > 0 ? reading.value / limit : 0;
    if (ratio < 0.25) scores.push(100);
    else if (ratio < 0.5) scores.push(85);
    else if (ratio < 1) scores.push(65);
    else scores.push(35);
  }

  const score = clampScore(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 100);
  return {
    score,
    risk: riskFromScore(score),
    label: "Disinfection Byproducts",
    explanation: scores.length ? "DBP score based on available TTHM/HAA5-style readings." : "No DBP readings found in the current dataset.",
  };
}
