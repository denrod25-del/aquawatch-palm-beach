import { useMemo } from "react";
import {
  getWaterSystems,
  getReadings,
  getViolations,
  type WaterSystem,
} from "@/data/staticData";
import { calculateWaterQualityScore, type WaterQualityScoreResult } from "@/lib/scoring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Droplets, FileText, ShieldAlert, TrendingUp } from "lucide-react";

function gradeClass(grade: string) {
  switch (grade) {
    case "A": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "B": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "C": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "D": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    default: return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  }
}

function riskClass(risk: string) {
  switch (risk) {
    case "Very Low":
    case "Low": return "text-green-600 dark:text-green-400";
    case "Moderate": return "text-yellow-600 dark:text-yellow-400";
    case "High": return "text-orange-600 dark:text-orange-400";
    default: return "text-red-600 dark:text-red-400";
  }
}

function categoryRow(label: string, score: number, risk: string) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/25 px-3 py-2 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`font-semibold ${riskClass(risk)}`}>{risk}</span>
        <span className="font-mono text-muted-foreground">{score}/100</span>
      </span>
    </div>
  );
}

function ReportCard({ system, score }: { system: WaterSystem; score: WaterQualityScoreResult }) {
  const needsReview = score.confidence !== "cross_verified";

  return (
    <Card className="overflow-hidden" data-testid={`report-card-${system.pwsid}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-start justify-between gap-3 text-base">
          <div>
            <div className="font-bold leading-tight">{system.name}</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">{system.pwsid}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{system.city}, {system.county} County · {system.populationServed.toLocaleString()} served</div>
          </div>
          <div className="text-right">
            <div className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xl font-black ${gradeClass(score.grade)}`}>{score.grade}</div>
            <div className="text-xs text-muted-foreground mt-1">{score.overallScore}/100</div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><Droplets className="h-3.5 w-3.5" /> PFAS Risk</div>
            <div className={`font-bold ${riskClass(score.pfas.risk)}`}>{score.pfas.risk}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><TrendingUp className="h-3.5 w-3.5" /> Trend</div>
            <div className="font-bold">{score.trend}</div>
          </div>
        </div>

        <div className="space-y-2">
          {categoryRow("PFAS", score.pfas.score, score.pfas.risk)}
          {categoryRow("Regulatory History", score.regulatory.score, score.regulatory.risk)}
          {categoryRow("Lead", score.lead.score, score.lead.risk)}
          {categoryRow("Nitrate", score.nitrate.score, score.nitrate.risk)}
          {categoryRow("DBPs", score.dbp.score, score.dbp.risk)}
          {categoryRow("Trend Stability", score.trendScore.score, score.trendScore.risk)}
        </div>

        <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 p-3 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <strong>Recommendation:</strong> {score.recommendation}
        </div>

        {needsReview && (
          <div className="rounded-lg border border-yellow-200 dark:border-yellow-800/40 bg-yellow-50 dark:bg-yellow-900/10 p-3 text-xs text-yellow-800 dark:text-yellow-300 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>This score is intelligence-grade, not publication-grade, until CCR / SDWIS / UCMR5 verification is complete.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportCards() {
  const reportCards = useMemo(() => {
    return getWaterSystems().map(system => {
      const readings = getReadings({ pwsid: system.pwsid });
      const violations = getViolations({ pwsid: system.pwsid });
      const score = calculateWaterQualityScore({
        pwsid: system.pwsid,
        utilityName: system.name,
        readings,
        violations,
        confidence: system.verificationStatus ?? "needs_review",
      });
      return { system, score };
    }).sort((a, b) => a.score.overallScore - b.score.overallScore);
  }, []);

  const avgScore = Math.round(reportCards.reduce((sum, item) => sum + item.score.overallScore, 0) / Math.max(reportCards.length, 1));
  const highPfas = reportCards.filter(item => item.score.pfas.risk === "High" || item.score.pfas.risk === "Severe").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText size={18} className="text-primary" />
              <h1 className="text-lg font-bold">Utility Report Cards</h1>
            </div>
            <p className="text-xs text-muted-foreground">AquaWatch v1 scoring engine for Palm Beach County utility intelligence.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href="/#/verification"><ShieldAlert size={14} /> Verification</a>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href="/#/"><ArrowLeft size={14} /> Dashboard</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Utilities Scored</p><p className="text-2xl font-bold">{reportCards.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Average Score</p><p className="text-2xl font-bold">{avgScore}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">High PFAS Risk</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{highPfas}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Score Version</p><p className="text-2xl font-bold">v1</p></CardContent></Card>
        </section>

        <section className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 p-4 text-sm text-blue-800 dark:text-blue-300">
          <strong>Scoring note:</strong> Report cards are generated from AquaWatch bundled readings and violations. BENCHMARK records affect risk intelligence, not regulatory-history scoring. Scores should be treated as draft intelligence until source verification is complete.
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          {reportCards.map(item => <ReportCard key={item.system.pwsid} system={item.system} score={item.score} />)}
        </section>
      </main>
    </div>
  );
}
