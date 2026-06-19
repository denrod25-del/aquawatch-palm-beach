export type RiskLevel = "Very Low" | "Low" | "Moderate" | "High" | "Severe";
export type LetterGrade = "A" | "B" | "C" | "D" | "F";
export type TrendDirection = "Improving" | "Stable" | "Declining" | "Unknown";

export interface ScoringReading {
  contaminant: string;
  value: number;
  unit: string;
  sampleDate?: string;
  epaLimit?: number | null;
  ewgLimit?: number | null;
}

export interface ScoringViolation {
  violationType: string;
  status: string;
  isHealthBased?: number;
}

export interface WaterQualityScoreInput {
  pwsid: string;
  utilityName?: string;
  readings: ScoringReading[];
  violations: ScoringViolation[];
  confidence?: string;
}

export interface CategoryScore {
  score: number;
  risk: RiskLevel;
  label: string;
  explanation: string;
}

export interface WaterQualityScoreResult {
  pwsid: string;
  utilityName?: string;
  overallScore: number;
  grade: LetterGrade;
  trend: TrendDirection;
  confidence: string;
  pfas: CategoryScore;
  regulatory: CategoryScore;
  lead: CategoryScore;
  nitrate: CategoryScore;
  dbp: CategoryScore;
  trendScore: CategoryScore;
  recommendation: string;
}
