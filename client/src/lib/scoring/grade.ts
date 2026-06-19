import type { LetterGrade, RiskLevel } from "./types";

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function gradeFromScore(score: number): LetterGrade {
  const s = clampScore(score);
  if (s >= 90) return "A";
  if (s >= 80) return "B";
  if (s >= 70) return "C";
  if (s >= 60) return "D";
  return "F";
}

export function riskFromScore(score: number): RiskLevel {
  const s = clampScore(score);
  if (s >= 90) return "Very Low";
  if (s >= 75) return "Low";
  if (s >= 60) return "Moderate";
  if (s >= 40) return "High";
  return "Severe";
}
