import type { CategoryScore, ScoringReading, TrendDirection } from "./types";
import { clampScore, riskFromScore } from "./grade";

export function calculateTrendScore(readings: ScoringReading[]): CategoryScore {
  const dated = readings
    .filter(r => r.sampleDate && Number.isFinite(r.value))
    .sort((a, b) => (a.sampleDate ?? "").localeCompare(b.sampleDate ?? ""));

  if (dated.length < 2) {
    return {
      score: 80,
      risk: "Low",
      label: "Trend Stability",
      explanation: "Not enough dated readings to determine trend; defaulting to stable.",
    };
  }

  const first = dated[0].value;
  const last = dated[dated.length - 1].value;
  const change = first === 0 ? 0 : (last - first) / Math.abs(first);

  let score = 80;
  let direction: TrendDirection = "Stable";
  if (change < -0.15) { score = 100; direction = "Improving"; }
  else if (change > 0.30) { score = 20; direction = "Declining"; }
  else if (change > 0.10) { score = 50; direction = "Declining"; }

  score = clampScore(score);
  return {
    score,
    risk: riskFromScore(score),
    label: "Trend Stability",
    explanation: `${direction} trend based on first-to-latest available reading change of ${(change * 100).toFixed(1)}%.`,
  };
}

export function trendDirectionFromScore(score: number): TrendDirection {
  if (score >= 95) return "Improving";
  if (score >= 70) return "Stable";
  if (score > 0) return "Declining";
  return "Unknown";
}
