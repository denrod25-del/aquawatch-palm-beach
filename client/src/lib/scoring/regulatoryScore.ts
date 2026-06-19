import type { CategoryScore, ScoringViolation } from "./types";
import { clampScore, riskFromScore } from "./grade";

function isRegulatoryViolation(v: ScoringViolation): boolean {
  return v.violationType !== "BENCHMARK";
}

export function calculateRegulatoryScore(violations: ScoringViolation[]): CategoryScore {
  const regulatory = violations.filter(isRegulatoryViolation);
  const active = regulatory.filter(v => v.status === "Ongoing").length;
  const resolved = regulatory.filter(v => v.status !== "Ongoing").length;
  const score = clampScore(100 - active * 25 - resolved * 10);

  return {
    score,
    risk: riskFromScore(score),
    label: "Regulatory History",
    explanation: `${active} active regulatory record(s), ${resolved} resolved regulatory record(s). BENCHMARK records are excluded from this score.`,
  };
}
