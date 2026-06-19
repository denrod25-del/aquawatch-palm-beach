import type { WaterQualityScoreInput, WaterQualityScoreResult } from "./types";
import { clampScore, gradeFromScore } from "./grade";
import { calculatePfasScore } from "./pfasScore";
import { calculateRegulatoryScore } from "./regulatoryScore";
import { calculateLeadScore, calculateNitrateScore, calculateDbpScore } from "./contaminantScore";
import { calculateTrendScore, trendDirectionFromScore } from "./trendScore";
import { buildRecommendation } from "./recommendations";

const WEIGHTS = {
  pfas: 0.35,
  regulatory: 0.20,
  lead: 0.10,
  nitrate: 0.10,
  dbp: 0.15,
  trend: 0.10,
};

export function calculateWaterQualityScore(input: WaterQualityScoreInput): WaterQualityScoreResult {
  const pfas = calculatePfasScore(input.readings);
  const regulatory = calculateRegulatoryScore(input.violations);
  const lead = calculateLeadScore(input.readings);
  const nitrate = calculateNitrateScore(input.readings);
  const dbp = calculateDbpScore(input.readings);
  const trendScore = calculateTrendScore(input.readings);

  const overallScore = clampScore(
    pfas.score * WEIGHTS.pfas +
    regulatory.score * WEIGHTS.regulatory +
    lead.score * WEIGHTS.lead +
    nitrate.score * WEIGHTS.nitrate +
    dbp.score * WEIGHTS.dbp +
    trendScore.score * WEIGHTS.trend
  );

  const base = {
    pwsid: input.pwsid,
    utilityName: input.utilityName,
    overallScore,
    grade: gradeFromScore(overallScore),
    trend: trendDirectionFromScore(trendScore.score),
    confidence: input.confidence ?? "needs_review",
    pfas,
    regulatory,
    lead,
    nitrate,
    dbp,
    trendScore,
  };

  return {
    ...base,
    recommendation: buildRecommendation(base),
  };
}

export { WEIGHTS as WATER_QUALITY_SCORE_WEIGHTS };
