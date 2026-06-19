import type { WaterQualityScoreResult } from "./types";

export function buildRecommendation(result: Omit<WaterQualityScoreResult, "recommendation">): string {
  const actions: string[] = [];

  if (result.pfas.risk === "High" || result.pfas.risk === "Severe") {
    actions.push("Prioritize PFAS verification and homeowner education around activated carbon and RO options.");
  } else if (result.pfas.risk === "Moderate") {
    actions.push("Monitor PFAS trends and explain benchmark context clearly.");
  }

  if (result.regulatory.risk === "High" || result.regulatory.risk === "Severe") {
    actions.push("Review official CCR/SDWIS violation history before publishing claims.");
  }

  if (result.lead.risk === "High" || result.lead.risk === "Severe") {
    actions.push("Recommend fixture-side lead risk education and targeted water testing.");
  }

  if (result.nitrate.risk === "High" || result.nitrate.risk === "Severe") {
    actions.push("Recommend nitrate verification, especially for sensitive households.");
  }

  if (result.confidence !== "cross_verified") {
    actions.push("Mark public-facing claims as needs review until CCR, SDWIS, or UCMR5 source verification is complete.");
  }

  if (actions.length === 0) {
    actions.push("Maintain routine monitoring and refresh the utility profile when new CCR or UCMR data is available.");
  }

  return actions.join(" ");
}
